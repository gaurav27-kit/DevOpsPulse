import React from 'react';
import { useSocket } from '../socket/SocketProvider.jsx';

/**
 * Visual indicator of the live Socket.IO connection state.
 * Features an accessible status role and descriptive aria-label.
 */
export function LiveIndicator({ className = '' }) {
  const { status } = useSocket();

  const configs = {
    connected: {
      dot: 'bg-emerald-500',
      text: 'Live',
      aria: 'Real-time connection active'
    },
    connecting: {
      dot: 'bg-amber-400 animate-pulse',
      text: 'Connecting',
      aria: 'Connecting to real-time updates'
    },
    reconnecting: {
      dot: 'bg-amber-500 animate-pulse',
      text: 'Reconnecting',
      aria: 'Reconnecting to real-time updates'
    },
    disconnected: {
      dot: 'bg-slate-400',
      text: 'Offline',
      aria: 'Real-time updates disconnected'
    }
  };

  const config = configs[status] || configs.disconnected;

  return (
    <div
      role="status"
      aria-label={config.aria}
      title={config.aria}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${config.dot}`} aria-hidden="true" />
      <span className="text-2xs font-semibold tracking-wider uppercase text-slate-600">{config.text}</span>
    </div>
  );
}
