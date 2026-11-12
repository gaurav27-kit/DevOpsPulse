/**
 * backend/src/services/sloAlertService.js
 *
 * Evaluation orchestrator for SLO alerting.
 * Integrates pure rules with MongoDB state machine, distributed lock deduplication,
 * and unified notification dispatch.
 */

import { Slo } from '../models/Slo.js';
import { Application } from '../models/Application.js';
import { SloAlertState } from '../models/SloAlertState.js';
import { decideSloEvents } from './sloAlertRules.js';
import { getSloForApplication } from './sloService.js';
import { notifyEvent } from './notificationService.js';
import { emitSloAlert } from '../sockets/events.js';
import { env } from '../config/env.js';

/**
 * Evaluates SLO alerting rules for a specific application.
 *
 * @param {Object} params
 * @param {string|import('mongoose').Types.ObjectId} params.applicationId
 * @param {Object} [params.slo] - Optional preloaded Slo document
 * @param {Object} [params.application] - Optional preloaded Application document
 * @param {string} [params.trigger='check'] - 'check' | 'sweep' | 'manual'
 * @param {Date|number} [params.now] - Injected timestamp
 * @param {Object} [params.options] - Injected mock transports or testing options
 * @returns {Promise<{ evaluated: boolean, winner?: boolean, events?: Array, state?: Object }>}
 */
export async function evaluateSloAlerts({
  applicationId,
  slo = null,
  application = null,
  trigger = 'check',
  now = new Date(),
  options = {}
}) {
  try {
    const nowDate = now instanceof Date ? now : new Date(now);

    const app =
      application || (await Application.findById(applicationId).lean());
    if (!app) {
      return { evaluated: false, reason: 'app_not_found' };
    }

    const sloDoc =
      slo || (await Slo.findOne({ applicationId: app._id }).lean());
    if (!sloDoc) {
      return { evaluated: false, reason: 'no_slo' };
    }

    // Load or initialize state machine
    let state = await SloAlertState.findOne({ sloId: sloDoc._id });
    if (!state) {
      try {
        state = await SloAlertState.create({
          sloId: sloDoc._id,
          applicationId: app._id,
          ownerId: app.ownerId,
          status: 'insufficient_data',
          version: 0
        });
      } catch (err) {
        if (err.code === 11000) {
          state = await SloAlertState.findOne({ sloId: sloDoc._id });
        } else {
          throw err;
        }
      }
    }

    // Check-trigger throttling: max once per 60s per SLO
    if (trigger === 'check' && state.lastEvaluatedAt) {
      const elapsedSeconds =
        (nowDate.getTime() - new Date(state.lastEvaluatedAt).getTime()) / 1000;
      if (elapsedSeconds < 60) {
        return { evaluated: false, reason: 'throttled' };
      }
    }

    // Compute stats
    let stats;
    try {
      stats = await getSloForApplication(app.ownerId, app._id, sloDoc);
    } catch {
      return { evaluated: false, reason: 'stats_computation_failed' };
    }

    // Run pure rules
    const ctx = {
      now: nowDate,
      lastCheckAt: app.lastCheckedAt,
      intervalSeconds: app.checkIntervalSeconds || 60,
      sloCreatedAt: sloDoc.createdAt,
      config: {
        SLO_BURN_FAST_1H: env.SLO_BURN_FAST_1H,
        SLO_BURN_SLOW_6H: env.SLO_BURN_SLOW_6H,
        SLO_BURN_CLEAR_6H: env.SLO_BURN_CLEAR_6H,
        SLO_ALERT_COOLDOWN_MINUTES: env.SLO_ALERT_COOLDOWN_MINUTES
      }
    };

    const { events, nextState } = decideSloEvents(state, stats, ctx);

    // Multi-worker safe optimistic locking: only winner dispatches
    const updateQuery = {
      sloId: sloDoc._id,
      version: state.version
    };

    const updateDoc = {
      $set: {
        status: nextState.status,
        pendingStatus: nextState.pendingStatus,
        pendingCount: nextState.pendingCount,
        episode: nextState.episode,
        burnLevel: nextState.burnLevel,
        dataState: nextState.dataState,
        lastEvaluatedAt: nextState.lastEvaluatedAt
      },
      $inc: { version: 1 }
    };

    const updatedState = await SloAlertState.findOneAndUpdate(
      updateQuery,
      updateDoc,
      { new: true }
    );

    if (!updatedState) {
      return { evaluated: false, winner: false };
    }

    // Winner dispatches each event
    for (const ev of events) {
      const counter =
        ev.type === 'slo_breached' || ev.type === 'slo_recovered'
          ? updatedState.episode
          : updatedState.version;
      const dedupeKey = `${sloDoc._id}:${ev.type}:${counter}`;

      await notifyEvent({
        ownerId: app.ownerId,
        application: app,
        slo: sloDoc,
        type: ev.type,
        severity: ev.severity,
        dedupeKey,
        details: ev.details,
        link: `${env.CLIENT_ORIGIN}/applications/${app._id}`,
        options
      });

      emitSloAlert(app.ownerId, {
        sloId: sloDoc._id,
        applicationId: app._id,
        type: ev.type,
        severity: ev.severity,
        at: nextState.lastEvaluatedAt
      });
    }

    return { evaluated: true, winner: true, events, state: updatedState };
  } catch (err) {
    // Errors are non-fatal
    return { evaluated: false, error: err.message };
  }
}

