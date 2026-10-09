import React from 'react';
import { useOnlineStatus } from './useOnlineStatus.js';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '1rem',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        background: 'linear-gradient(135deg, #b45309, #d97706)',
        color: '#ffffff',
        border: '1px solid #f59e0b',
        borderRadius: '8px',
        padding: '0.5rem 0.9rem',
        fontSize: '0.8rem',
        fontWeight: 600,
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#ffffff',
          animation: 'pulse 1.5s infinite',
        }}
      />
      <span>Offline Mode — Showing cached data. Reconnecting...</span>
    </div>
  );
};
