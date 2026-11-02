/**
 * scripts/socketCheck.js
 *
 * Automated verification suite for real-time Socket.IO implementation:
 * a) Connect without cookie -> rejected with "Unauthorized"
 * b) Connect with tampered / expired cookie -> rejected
 * c) Connect with valid User A cookie -> succeeds
 * d) Emit to User A -> Client A receives within 1s
 * e) Emit to User B -> Client A receives nothing (room isolation)
 * f) Fake room join event -> ignored by server, isolation intact
 * g) Payload verification -> exact required keys only, no mongo internals
 * h) Safe degradation -> emit helpers succeed safely when getIO() is null
 * i) Abusive client protection -> sending > 20 events disconnects socket
 *
 * Run: node scripts/socketCheck.js
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { initSockets, closeIO, getIO } from '../src/sockets/index.js';
import {
  SOCKET_EVENTS,
  emitApplicationStatus,
  emitHealthCheckCompleted,
  emitIncidentCreated,
  emitIncidentUpdated,
  emitDeploymentRecorded
} from '../src/sockets/events.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✔ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ✘ FAIL: ${label}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n--- Socket.IO Security & Protocol Verification ---\n');

  // Assertion H (Safe degradation when getIO() is null before server is running)
  console.log('[Test H] Safe degradation when Socket.IO server is not running');
  try {
    emitApplicationStatus('dummy-owner', { id: 'app-1', status: 'up' });
    emitHealthCheckCompleted('dummy-owner', { applicationId: 'app-1', success: true });
    emitIncidentCreated('dummy-owner', { id: 'inc-1', applicationId: 'app-1', title: 'test', severity: 'high', status: 'open', startedAt: new Date() });
    emitIncidentUpdated('dummy-owner', { id: 'inc-1', applicationId: 'app-1', status: 'investigating', failureCount: 3 });
    emitDeploymentRecorded('dummy-owner', { id: 'dep-1', applicationId: 'app-1', version: '1.0.0', status: 'success', startedAt: new Date() });
    assert(getIO() === null, 'getIO() returns null safely when uninitialized');
    assert(true, 'emit functions degrade safely without throwing when uninitialized');
  } catch (err) {
    assert(false, `Safe degradation threw error: ${err.message}`);
  }

  // Connect DB
  await connectDB();

  // Create temporary test users
  const testSuffix = Date.now();
  const dummyPasswordHash = '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr';
  const userA = await User.create({
    name: 'Socket User A',
    email: `socket_a_${testSuffix}@example.com`,
    passwordHash: dummyPasswordHash
  });

  const userB = await User.create({
    name: 'Socket User B',
    email: `socket_b_${testSuffix}@example.com`,
    passwordHash: dummyPasswordHash
  });

  // Tokens
  const tokenA = jwt.sign({ id: userA._id }, env.JWT_SECRET, { expiresIn: '1h' });
  const tokenB = jwt.sign({ id: userB._id }, env.JWT_SECRET, { expiresIn: '1h' });
  const expiredToken = jwt.sign({ id: userA._id }, env.JWT_SECRET, { expiresIn: '-1s' });
  const tamperedToken = tokenA.slice(0, -6) + 'abcdef';

  // Create ephemeral HTTP server
  const server = http.createServer();
  initSockets(server);

  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const port = server.address().port;
  const socketUrl = `http://localhost:${port}`;

  console.log(`Ephemeral test server running on port ${port}`);

  // Test A: Connect without cookie
  console.log('\n[Test A] Connection rejected without cookie');
  await new Promise((resolve) => {
    const client = ioClient(socketUrl, {
      transports: ['websocket'],
      reconnection: false
    });

    client.on('connect_error', (err) => {
      assert(err.message === 'Unauthorized', `Connection rejected with 'Unauthorized' (got: ${err.message})`);
      client.close();
      resolve();
    });

    client.on('connect', () => {
      assert(false, 'Expected connection without cookie to be rejected, but it succeeded');
      client.close();
      resolve();
    });
  });

  // Test B: Connect with tampered or expired cookie
  console.log('\n[Test B] Connection rejected with expired or tampered cookie');
  await new Promise((resolve) => {
    const client = ioClient(socketUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: {
        Cookie: `token=${expiredToken}`
      }
    });

    client.on('connect_error', (err) => {
      assert(err.message === 'Unauthorized', `Expired token rejected with 'Unauthorized' (got: ${err.message})`);
      client.close();
      resolve();
    });

    client.on('connect', () => {
      assert(false, 'Expected expired token to be rejected, but connected');
      client.close();
      resolve();
    });
  });

  await new Promise((resolve) => {
    const client = ioClient(socketUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: {
        Cookie: `token=${tamperedToken}`
      }
    });

    client.on('connect_error', (err) => {
      assert(err.message === 'Unauthorized', `Tampered token rejected with 'Unauthorized' (got: ${err.message})`);
      client.close();
      resolve();
    });

    client.on('connect', () => {
      assert(false, 'Expected tampered token to be rejected, but connected');
      client.close();
      resolve();
    });
  });

  // Test C: Connect with valid User A cookie
  console.log('\n[Test C] Connection succeeds with valid cookie');
  let clientA;
  await new Promise((resolve) => {
    clientA = ioClient(socketUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: {
        Cookie: `token=${tokenA}`
      }
    });

    clientA.on('connect', () => {
      assert(clientA.connected, 'Client A connected successfully with valid JWT cookie');
      resolve();
    });

    clientA.on('connect_error', (err) => {
      assert(false, `Client A failed to connect: ${err.message}`);
      resolve();
    });
  });

  // Test D: Emit event to User A -> Client A receives it within 1s
  console.log('\n[Test D & G] Event reception & payload key verification');
  const testNow = new Date();
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      assert(false, 'Timed out waiting for application:status event');
      resolve();
    }, 1500);

    clientA.on(SOCKET_EVENTS.APPLICATION_STATUS, (data) => {
      clearTimeout(timeout);
      assert(data.applicationId === '507f1f77bcf86cd799439011', 'Client A received application:status event');

      // Test G: Exact payload key verification
      const expectedKeys = ['applicationId', 'status', 'lastCheckedAt', 'lastSuccessfulAt'].sort();
      const actualKeys = Object.keys(data).sort();
      const match = JSON.stringify(actualKeys) === JSON.stringify(expectedKeys);
      assert(match, `Payload contains exact required keys without mongo internals (${actualKeys.join(', ')})`);
      assert(data.status === 'up', `Payload status matches emitted value (${data.status})`);
      assert(!('__v' in data), 'Payload does not leak mongo __v');
      resolve();
    });

    emitApplicationStatus(userA._id, {
      _id: '507f1f77bcf86cd799439011',
      status: 'up',
      lastCheckedAt: testNow,
      lastSuccessfulAt: testNow
    });
  });

  // Test E: Emit event to User B -> Client A receives NOTHING (room isolation)
  console.log('\n[Test E] Room isolation (events to User B are NOT received by Client A)');
  await new Promise((resolve) => {
    let receivedUserBEvent = false;

    const onEvent = () => {
      receivedUserBEvent = true;
    };

    clientA.on(SOCKET_EVENTS.DEPLOYMENT_RECORDED, onEvent);

    // Emit to User B
    emitDeploymentRecorded(userB._id, {
      _id: '507f1f77bcf86cd799439022',
      applicationId: '507f1f77bcf86cd799439011',
      version: 'v2.0.0',
      status: 'success',
      startedAt: testNow
    });

    setTimeout(() => {
      clientA.off(SOCKET_EVENTS.DEPLOYMENT_RECORDED, onEvent);
      assert(!receivedUserBEvent, 'Client A received 0 events intended for User B (room isolation verified)');
      resolve();
    }, 1000);
  });

  // Test F: Fake room join attempt ignored by server
  console.log('\n[Test F] Client attempts fake room join -> ignored by server');
  await new Promise((resolve) => {
    // Client attempts to emit join event
    clientA.emit('join', `user:${userB._id}`);
    clientA.emit('subscribe', `user:${userB._id}`);

    let interceptedUserBEvent = false;
    const onUserBEvent = () => {
      interceptedUserBEvent = true;
    };

    clientA.on(SOCKET_EVENTS.INCIDENT_CREATED, onUserBEvent);

    setTimeout(() => {
      emitIncidentCreated(userB._id, {
        _id: '507f1f77bcf86cd799439033',
        applicationId: '507f1f77bcf86cd799439011',
        title: 'App Down',
        severity: 'high',
        status: 'open',
        startedAt: testNow
      }, 'Test App');

      setTimeout(() => {
        clientA.off(SOCKET_EVENTS.INCIDENT_CREATED, onUserBEvent);
        assert(!interceptedUserBEvent, 'Client A could not hijack User B room via fake client join/subscribe events');
        resolve();
      }, 800);
    }, 200);
  });

  // Test I: Abusive client protection (> 20 events in 10s window disconnects socket)
  console.log('\n[Test I] Abusive client disconnect (> 20 events in 10s)');
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      assert(false, 'Socket was not disconnected after 30 rapid events');
      resolve();
    }, 2000);

    clientA.on('disconnect', (reason) => {
      clearTimeout(timeout);
      assert(true, `Server disconnected client after flooding events (reason: ${reason})`);
      resolve();
    });

    // Send 30 rapid events from client
    for (let i = 0; i < 30; i++) {
      clientA.emit('ping_spam', { seq: i });
    }
  });

  // Cleanup
  console.log('\nCleaning up test environment...');
  if (clientA) clientA.close();
  closeIO();
  await new Promise((resolve) => server.close(resolve));
  await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
  await mongoose.connection.close();

  console.log(`\n--- Socket.IO Test Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[FATAL] Socket check failed with unhandled error:', err);
  process.exit(1);
});
