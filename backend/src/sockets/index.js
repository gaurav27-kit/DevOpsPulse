import { Server } from 'socket.io';
import * as cookie from 'cookie';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

let io = null;

/**
 * Initializes the Socket.IO server mounted on an HTTP server.
 * Enforces httpOnly cookie-based JWT authentication, user existence check,
 * single-room user isolation, expiry disconnect timer, and abuse prevention.
 *
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN,
      credentials: true
    }
  });

  // Authentication middleware (mirrors requireAuth REST middleware)
  io.use(async (socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie;
      if (!rawCookie) {
        return next(new Error('Unauthorized'));
      }

      const parseCookie = cookie.parse || cookie.parseCookie;
      const parsed = parseCookie(rawCookie);
      const token = parsed.token;
      if (!token) {
        return next(new Error('Unauthorized'));
      }

      const decoded = jwt.verify(token, env.JWT_SECRET);
      if (!decoded || !decoded.id) {
        return next(new Error('Unauthorized'));
      }

      // Confirm user still exists in DB
      const user = await User.findById(decoded.id).lean();
      if (!user) {
        return next(new Error('Unauthorized'));
      }

      socket.user = user;
      socket.userId = user._id.toString();
      socket.tokenExp = decoded.exp;
      next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    const userRoom = `user:${userId}`;

    // Server-assigned room: client cannot choose or switch rooms
    socket.join(userRoom);

    // Auto-disconnect when the JWT session expires
    let expiryTimer = null;
    if (socket.tokenExp) {
      const msUntilExpiry = socket.tokenExp * 1000 - Date.now();
      if (msUntilExpiry <= 0) {
        socket.disconnect(true);
        return;
      }
      expiryTimer = setTimeout(() => {
        socket.disconnect(true);
      }, msUntilExpiry);
    }

    // Abusive client protection:
    // Clients only receive notifications; if a client emits > 20 events in 10s, disconnect.
    let eventCount = 0;
    const windowTimer = setInterval(() => {
      eventCount = 0;
    }, 10000);

    socket.onAny(() => {
      eventCount++;
      if (eventCount > 20) {
        console.warn(`[Socket] Disconnecting abusive client ${socket.id} (${eventCount} events in window)`);
        socket.disconnect(true);
      }
    });

    socket.on('disconnect', () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      clearInterval(windowTimer);
    });
  });

  return io;
}

/**
 * Returns the active Socket.IO server instance or null if not yet initialized.
 * Never throws, ensuring tests and offline services run safely.
 */
export function getIO() {
  return io;
}

/**
 * Closes the active Socket.IO server cleanly.
 */
export function closeIO() {
  if (io) {
    io.close();
    io = null;
  }
}
