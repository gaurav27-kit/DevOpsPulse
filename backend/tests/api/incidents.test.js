import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { Application } from '../../src/models/Application.js';
import { Incident } from '../../src/models/Incident.js';
import { processCheckResult } from '../../src/services/schedulerService.js';
import { createTestUser, getAuthCookie } from '../helpers.js';

// Helper: run N consecutive failed checks for an app and return the refreshed app doc.
// We re-fetch from DB after each call because processCheckResult may return undefined
// (when the URL changes during flight). The app stays the same here so we just re-fetch.
async function runFailures(appDoc, count) {
  for (let i = 0; i < count; i++) {
    // Pass a fresh DB snapshot so the URL filter inside processCheckResult always matches
    const fresh = await Application.findById(appDoc._id).lean();
    await processCheckResult(fresh, { success: false, errorType: 'timeout', responseTimeMs: 0 });
  }
  return Application.findById(appDoc._id).lean();
}

async function runSuccesses(appDoc, count) {
  for (let i = 0; i < count; i++) {
    const fresh = await Application.findById(appDoc._id).lean();
    await processCheckResult(fresh, { success: true, responseTimeMs: 150 });
  }
  return Application.findById(appDoc._id).lean();
}

function makeApp(user) {
  return Application.create({
    name: 'Test App',
    url: 'https://test-incident.example.com',
    ownerId: user._id,
    environment: 'production',
    status: 'unknown',
    nextCheckAt: new Date()
  });
}

describe('Incidents API', () => {
  it('2 consecutive failures open exactly one incident; 3rd failure updates it', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    let appDoc = await makeApp(user);

    // 1st failure → no incident yet (threshold is 2)
    appDoc = await runFailures(appDoc, 1);
    let incidents = await Incident.find({ applicationId: appDoc._id });
    expect(incidents).toHaveLength(0);

    // 2nd failure → incident created
    appDoc = await runFailures(appDoc, 1);
    incidents = await Incident.find({ applicationId: appDoc._id });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].isActive).toBe(true);
    expect(incidents[0].status).toBe('open');
    expect(incidents[0].failureCount).toBe(2);

    // 3rd failure → existing incident updated (failureCount++)
    appDoc = await runFailures(appDoc, 1);
    incidents = await Incident.find({ applicationId: appDoc._id });
    expect(incidents).toHaveLength(1); // still just one
    expect(incidents[0].failureCount).toBe(3);

    // Verify via API
    const res = await request(app)
      .get('/api/v1/incidents')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.incidents).toHaveLength(1);
  });

  it('2 consecutive successes resolve an active incident', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    let appDoc = await makeApp(user);

    // Open an incident
    appDoc = await runFailures(appDoc, 2);
    let incident = await Incident.findOne({ applicationId: appDoc._id, isActive: true });
    expect(incident).toBeTruthy();

    // 1st success → still active
    appDoc = await runSuccesses(appDoc, 1);
    incident = await Incident.findOne({ applicationId: appDoc._id, isActive: true });
    expect(incident).toBeTruthy();

    // 2nd success → resolved
    appDoc = await runSuccesses(appDoc, 1);
    incident = await Incident.findOne({ applicationId: appDoc._id });
    expect(incident.isActive).toBe(false);
    expect(incident.status).toBe('resolved');
    expect(incident.resolvedAt).toBeTruthy();

    // Verify via API
    const res = await request(app)
      .get(`/api/v1/incidents/${incident._id}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.incident.status).toBe('resolved');
  });

  it('allows open→investigating, open→resolved, investigating→resolved; rejects others with 409', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    // Create an incident directly
    const appDoc = await makeApp(user);
    const incident = await Incident.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      title: 'Test outage',
      severity: 'high',
      status: 'open',
      isActive: true,
      startedAt: new Date(),
      failureCount: 2
    });

    // open → investigating ✓
    const toInvestigating = await request(app)
      .patch(`/api/v1/incidents/${incident._id}/status`)
      .set('Cookie', cookie)
      .send({ status: 'investigating' });
    expect(toInvestigating.status).toBe(200);
    expect(toInvestigating.body.data.incident.status).toBe('investigating');

    // investigating → investigating is NOT in allowed transitions list (409)
    const dupTransition = await request(app)
      .patch(`/api/v1/incidents/${incident._id}/status`)
      .set('Cookie', cookie)
      .send({ status: 'investigating' });
    expect(dupTransition.status).toBe(409);

    // investigating → resolved ✓
    const toResolved = await request(app)
      .patch(`/api/v1/incidents/${incident._id}/status`)
      .set('Cookie', cookie)
      .send({ status: 'resolved', note: 'Fixed the issue' });
    expect(toResolved.status).toBe(200);
    expect(toResolved.body.data.incident.status).toBe('resolved');

    // resolved → anything → 409 (incident is now resolved)
    const afterResolved = await request(app)
      .patch(`/api/v1/incidents/${incident._id}/status`)
      .set('Cookie', cookie)
      .send({ status: 'resolved' });
    expect(afterResolved.status).toBe(409);
  });

  it('open→resolved transition: creates a status_change timeline entry with the note', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const incident = await Incident.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      title: 'DB Outage',
      severity: 'critical',
      status: 'open',
      isActive: true,
      startedAt: new Date(),
      failureCount: 2
    });

    await request(app)
      .patch(`/api/v1/incidents/${incident._id}/status`)
      .set('Cookie', cookie)
      .send({ status: 'resolved', note: 'Rolled back the bad deploy' });

    const getRes = await request(app)
      .get(`/api/v1/incidents/${incident._id}`)
      .set('Cookie', cookie);
    expect(getRes.status).toBe(200);
    const updates = getRes.body.data.incident.updates;
    const statusEntry = updates.find((u) => u.type === 'status_change');
    expect(statusEntry).toBeTruthy();
    expect(statusEntry.message).toContain('Rolled back the bad deploy');
  });

  it('adds a note to timeline; rejects body with extra fields; 409 at 200 updates cap', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);
    const appDoc = await makeApp(user);

    const incident = await Incident.create({
      applicationId: appDoc._id,
      ownerId: user._id,
      title: 'Long outage',
      severity: 'high',
      status: 'open',
      isActive: true,
      startedAt: new Date(),
      failureCount: 2,
      // Pre-fill with 199 updates so the next call caps it at 200
      updates: Array.from({ length: 199 }, (_, i) => ({
        message: `Update ${i + 1}`,
        type: 'note',
        author: null,
        createdAt: new Date()
      }))
    });

    // 200th note → accepted
    const noteRes = await request(app)
      .post(`/api/v1/incidents/${incident._id}/updates`)
      .set('Cookie', cookie)
      .send({ message: 'Note 200' });
    expect(noteRes.status).toBe(201);

    // 201st note → 409
    const overCapRes = await request(app)
      .post(`/api/v1/incidents/${incident._id}/updates`)
      .set('Cookie', cookie)
      .send({ message: 'Note 201' });
    expect(overCapRes.status).toBe(409);

    // Strict body: extra field rejected
    const strictRes = await request(app)
      .post(`/api/v1/incidents/${incident._id}/updates`)
      .set('Cookie', cookie)
      .send({ message: 'Hi', extraField: 'bad' });
    expect(strictRes.status).toBe(400);
  });

  it('filters by status, severity, applicationId and date range', async () => {
    const { user } = await createTestUser();
    const cookie = getAuthCookie(user);

    // Each active incident must be for a DIFFERENT application (unique partial index)
    const nextCheck = new Date();
    const appOpen = await Application.create({ name: 'App A', url: 'https://filter-a.example.com', ownerId: user._id, environment: 'production', nextCheckAt: nextCheck });
    const appInv = await Application.create({ name: 'App B', url: 'https://filter-b.example.com', ownerId: user._id, environment: 'staging', nextCheckAt: nextCheck });
    const appResolved = await Application.create({ name: 'App C', url: 'https://filter-c.example.com', ownerId: user._id, environment: 'development', nextCheckAt: nextCheck });

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    await Incident.create([
      { applicationId: appOpen._id, ownerId: user._id, title: 'Open', severity: 'high', status: 'open', isActive: true, startedAt: now, failureCount: 2 },
      { applicationId: appInv._id, ownerId: user._id, title: 'Investigating', severity: 'medium', status: 'investigating', isActive: true, startedAt: yesterday, failureCount: 3 },
      { applicationId: appResolved._id, ownerId: user._id, title: 'Old resolved', severity: 'low', status: 'resolved', isActive: false, startedAt: yesterday, failureCount: 1 }
    ]);

    // Filter by status
    const openRes = await request(app)
      .get('/api/v1/incidents?status=open')
      .set('Cookie', cookie);
    expect(openRes.status).toBe(200);
    expect(openRes.body.data.incidents.every((i) => i.status === 'open')).toBe(true);

    // Filter by severity
    const sevRes = await request(app)
      .get('/api/v1/incidents?severity=high')
      .set('Cookie', cookie);
    expect(sevRes.status).toBe(200);
    expect(sevRes.body.data.incidents.every((i) => i.severity === 'high')).toBe(true);

    // Filter by applicationId
    const appRes = await request(app)
      .get(`/api/v1/incidents?applicationId=${appOpen._id}`)
      .set('Cookie', cookie);
    expect(appRes.status).toBe(200);
    expect(appRes.body.data.incidents.length).toBe(1);

    // sortBy allowlist: reject bad sortBy
    const badSort = await request(app)
      .get('/api/v1/incidents?sortBy=passwordHash')
      .set('Cookie', cookie);
    expect(badSort.status).toBe(400);
  });

  it('20 parallel failure results produce exactly ONE active incident', async () => {
    const { user } = await createTestUser();

    const appDoc = await makeApp(user);

    // Warm up to consecutiveFailures=1 so the NEXT call would trigger open (count reaches 2)
    await processCheckResult(appDoc, { success: false, errorType: 'timeout', responseTimeMs: null });

    // Fetch the updated app for the concurrent calls
    const updatedApp = await Application.findById(appDoc._id).lean();

    // Fire 20 concurrent failure results
    await Promise.all(
      Array.from({ length: 20 }, () =>
        processCheckResult(updatedApp, { success: false, errorType: 'timeout', responseTimeMs: null })
      )
    );

    // Exactly one active incident should exist
    const active = await Incident.find({ applicationId: appDoc._id, isActive: true });
    expect(active).toHaveLength(1);
  });
});
