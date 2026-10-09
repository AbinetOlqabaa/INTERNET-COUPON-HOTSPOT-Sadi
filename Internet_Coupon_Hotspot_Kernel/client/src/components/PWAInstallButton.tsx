import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall.js';

interface PWAInstallButtonProps {
  className?: string;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ className = '', compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If running in standalone PWA mode already, suppress button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop install trigger
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={className || `btn btn-primary ${compact ? 'btn-sm' : ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'linear-gradient(135deg, #0284c7, #0369a1)',
          color: '#ffffff',
          border: '1px solid #38bdf8',
          borderRadius: '8px',
          padding: compact ? '0.35rem 0.75rem' : '0.5rem 1rem',
          fontSize: compact ? '0.8rem' : '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
        title="Install Hotspot App on your device"
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>{compact ? 'Install App' : 'Install Hotspot App'}</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={className || `btn ${compact ? 'btn-sm' : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#e2e8f0',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            padding: compact ? '0.35rem 0.75rem' : '0.5rem 1rem',
            fontSize: compact ? '0.8rem' : '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
          title="Install on iPhone / iPad"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(4px)',
              padding: '1rem',
            }}
          >
            <div
              style={{
                maxWidth: '380px',
                width: '100%',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '16px',
                padding: '1.5rem',
                color: '#f8fafc',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              }}
            >
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.15rem', color: '#38bdf8' }}>
                Install on iPhone &amp; iPad
              </h3>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
                1. Tap the <strong style={{ color: '#fff' }}>Share</strong> button in the Safari bottom toolbar.<br />
                2. Scroll down and tap <strong style={{ color: '#fff' }}>Add to Home Screen</strong>.<br />
                3. Tap <strong style={{ color: '#fff' }}>Add</strong> in the top right to launch full-screen.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  background: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
