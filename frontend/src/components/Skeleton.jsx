import React from 'react';

/**
 * Skeleton placeholder for content loading states.
 */
export function Skeleton({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-[#eaedff] rounded-lg ${className}`}
    />
  );
}

