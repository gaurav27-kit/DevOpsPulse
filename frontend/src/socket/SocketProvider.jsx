import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth.js';

const SocketContext = createContext({
  socket: null,
  status: 'disconnected' // 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
});

/**
 * SocketProvider manages the single authenticated Socket.IO connection.
 * - Connects only when an authenticated user session is active.
 * - Uses withCredentials: true so the browser sends httpOnly cookie automatically.
 * - Automatically cleans up on logout or unmount.
 * - Catches up on missed updates by invalidating core caches upon reconnect.
 */
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('disconnected');
  const hasConnectedBefore = useRef(false);

  useEffect(() => {
    // Only connect if the user is authenticated
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setStatus('disconnected');
      hasConnectedBefore.current = false;
      return;
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

    setStatus('connecting');

    const socketInstance = io(socketUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    socketInstance.on('connect', () => {
      setStatus('connected');

      // If reconnecting after temporary disconnection, catch up on any missed data
      if (hasConnectedBefore.current) {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
        queryClient.invalidateQueries({ queryKey: ['applications'] });
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
        queryClient.invalidateQueries({ queryKey: ['deployments'] });
      }

      hasConnectedBefore.current = true;
    });

    socketInstance.on('disconnect', (reason) => {
      // If server disconnected the socket or manual disconnect
      setStatus('disconnected');
    });

    socketInstance.on('connect_error', () => {
      setStatus('disconnected');
    });

    socketInstance.io.on('reconnect_attempt', () => {
      setStatus('reconnecting');
    });

    socketInstance.io.on('reconnect', () => {
      setStatus('connected');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      setSocket(null);
      setStatus('disconnected');
    };
  }, [user?._id || user?.id]); // Re-evaluate if user changes or logs out

  return (
    <SocketContext.Provider value={{ socket, status }}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Hook to access the live Socket.IO client and current connection status.
 */
export function useSocket() {
  return useContext(SocketContext);
}
