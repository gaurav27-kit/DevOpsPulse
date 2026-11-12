import { getIO } from './index.js';

export const SOCKET_EVENTS = Object.freeze({
  APPLICATION_STATUS: 'application:status',
  HEALTHCHECK_COMPLETED: 'healthcheck:completed',
  INCIDENT_CREATED: 'incident:created',
  INCIDENT_UPDATED: 'incident:updated',
  DEPLOYMENT_RECORDED: 'deployment:recorded',
  SLO_ALERT: 'slo:alert'
});

/**
 * Emits application:status event to the owner's room.
 *
 * WHY EMIT ON EVERY CHECK (not just status transitions)?
 * User interfaces and dashboards show relative timestamps ("Last checked: 3s ago")
 * and heartbeat pulses. Emitting on every check keeps real-time views fresh
 * and accurate without forcing clients into polling.
 *
 * @param {string|import('mongoose').Types.ObjectId} ownerId
 * @param {object} app - Application model document
 */
export function emitApplicationStatus(ownerId, app) {
  try {
    const io = getIO();
    if (!io) return;

    const targetRoom = `user:${ownerId.toString()}`;
    const payload = {
      applicationId: (app._id || app.id).toString(),
      status: app.status,
      lastCheckedAt: app.lastCheckedAt ?? null,
      lastSuccessfulAt: app.lastSuccessfulAt ?? null
    };

    io.to(targetRoom).emit(SOCKET_EVENTS.APPLICATION_STATUS, payload);
  } catch (err) {
    console.debug('[Socket] emitApplicationStatus error:', err.message);
  }
}

/**
 * Emits healthcheck:completed event to the owner's room.
 *
 * @param {string|import('mongoose').Types.ObjectId} ownerId
 * @param {object} check - HealthCheck document or summary object
 */
export function emitHealthCheckCompleted(ownerId, check) {
  try {
    const io = getIO();
    if (!io) return;

    const targetRoom = `user:${ownerId.toString()}`;
    const payload = {
      applicationId: (check.applicationId?._id || check.applicationId).toString(),
      success: Boolean(check.success),
      statusCode: check.statusCode ?? null,
      responseTimeMs: typeof check.responseTimeMs === 'number' ? check.responseTimeMs : null,
      errorType: check.errorType ?? null,
      checkedAt: check.checkedAt
    };

    io.to(targetRoom).emit(SOCKET_EVENTS.HEALTHCHECK_COMPLETED, payload);
  } catch (err) {
    console.debug('[Socket] emitHealthCheckCompleted error:', err.message);
  }
}

/**
 * Emits incident:created event to the owner's room.
 *
 * @param {string|import('mongoose').Types.ObjectId} ownerId
 * @param {object} incident - Incident document
 * @param {string} [applicationName] - Associated application name
 */
export function emitIncidentCreated(ownerId, incident, applicationName) {
  try {
    const io = getIO();
    if (!io) return;

    const targetRoom = `user:${ownerId.toString()}`;
    const payload = {
      incidentId: (incident._id || incident.id).toString(),
      applicationId: (incident.applicationId?._id || incident.applicationId).toString(),
      applicationName: applicationName || incident.applicationName || incident.title,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      startedAt: incident.startedAt
    };

    io.to(targetRoom).emit(SOCKET_EVENTS.INCIDENT_CREATED, payload);
  } catch (err) {
    console.debug('[Socket] emitIncidentCreated error:', err.message);
  }
}

/**
 * Emits incident:updated event to the owner's room.
 *
 * @param {string|import('mongoose').Types.ObjectId} ownerId
 * @param {object} incident - Updated Incident document
 */
export function emitIncidentUpdated(ownerId, incident) {
  try {
    const io = getIO();
    if (!io) return;

    const targetRoom = `user:${ownerId.toString()}`;
    const payload = {
      incidentId: (incident._id || incident.id).toString(),
      applicationId: (incident.applicationId?._id || incident.applicationId).toString(),
      status: incident.status,
      failureCount: incident.failureCount,
      lastFailureAt: incident.lastFailureAt ?? null,
      resolvedAt: incident.resolvedAt ?? null
    };

    io.to(targetRoom).emit(SOCKET_EVENTS.INCIDENT_UPDATED, payload);
  } catch (err) {
    console.debug('[Socket] emitIncidentUpdated error:', err.message);
  }
}

/**
 * Emits deployment:recorded event to the owner's room.
 *
 * @param {string|import('mongoose').Types.ObjectId} ownerId
 * @param {object} deployment - Deployment document
 */
export function emitDeploymentRecorded(ownerId, deployment) {
  try {
    const io = getIO();
    if (!io) return;

    const targetRoom = `user:${ownerId.toString()}`;
    const payload = {
      deploymentId: (deployment._id || deployment.id).toString(),
      applicationId: (deployment.applicationId?._id || deployment.applicationId).toString(),
      version: deployment.version,
      status: deployment.status,
      startedAt: deployment.startedAt
    };

    io.to(targetRoom).emit(SOCKET_EVENTS.DEPLOYMENT_RECORDED, payload);
  } catch (err) {
    console.debug('[Socket] emitDeploymentRecorded error:', err.message);
  }
}

/**
 * Emits slo:alert event to the owner's room only.
 *
 * @param {string|import('mongoose').Types.ObjectId} ownerId
 * @param {object} alertData - { sloId, applicationId, type, severity, at }
 */
export function emitSloAlert(ownerId, alertData) {
  try {
    const io = getIO();
    if (!io) return;

    const targetRoom = `user:${ownerId.toString()}`;
    const payload = {
      sloId: (alertData.sloId?._id || alertData.sloId).toString(),
      applicationId: (alertData.applicationId?._id || alertData.applicationId).toString(),
      type: alertData.type,
      severity: alertData.severity,
      at: alertData.at instanceof Date ? alertData.at.toISOString() : alertData.at || new Date().toISOString()
    };

    io.to(targetRoom).emit(SOCKET_EVENTS.SLO_ALERT, payload);
  } catch (err) {
    console.debug('[Socket] emitSloAlert error:', err.message);
  }
}
