'use client';

import React, { useState, useEffect } from 'react';
import { unavatarUrl, noteUnavatarFailed } from '../lib/utils';

/**
 * High-performance Monochrome Avatar Component (Light Theme)
 * - Fetches Instagram DP / Profile picture
 * - Robust multi-tier fallback (Instagram -> Unavatar -> Clean Initials)
 * - Monochrome AI indicator dot: Full AI (solid black), Paused (dim dot)
 */
export default function ContactAvatar({ contact, size = 40, showStatus = true, style = {} }) {
  const [imgError, setImgError] = useState(false);
  const [unavatarError, setUnavatarError] = useState(false);
  const handleKey = (contact && (contact.handle || contact.instagramHandle || contact.username)) || '';
  const profilePicKey = (contact && contact.profilePic) || '';

  // A new person, handle or refreshed photo link gets a fresh try (an earlier failure must not block it)
  useEffect(() => {
    setImgError(false);
    setUnavatarError(false);
  }, [handleKey, profilePicKey]);

  if (!contact) return null;

  const rawUsername = (contact.handle || contact.instagramHandle || contact.username || '')
    .replace(/^@/, '')
    .trim();

  const displayName = contact.name || rawUsername || 'Contact';

  // Compute initials
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('') || 'IG';

  // Determine DP source
  let avatarSrc = null;
  if (!imgError && contact.profilePic && contact.profilePic.startsWith('http')) {
    avatarSrc = contact.profilePic;
  } else if (!unavatarError && rawUsername) {
    avatarSrc = unavatarUrl(rawUsername);
  }

  // Monochrome status indicator
  const isPaused = contact.aiEnabled === false || contact.replyToMessages === false;
  const statusTitle = isPaused ? 'AI Paused (Manual)' : 'Full AI Active';

  const handleImgError = () => {
    if (!imgError && contact.profilePic) {
      setImgError(true);
    } else {
      noteUnavatarFailed(avatarSrc);
      setUnavatarError(true);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        borderRadius: '50%',
        overflow: 'visible',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
      title={`${displayName} ${rawUsername ? `(@${rawUsername})` : ''} - ${statusTitle}`}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'var(--color-surface-hover)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={displayName}
            onError={handleImgError}
            referrerPolicy="no-referrer"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--color-surface-hover)',
              color: 'var(--color-text-primary)',
              fontSize: `${Math.max(10, Math.floor(size * 0.36))}px`,
              fontWeight: '700',
              fontFamily: "var(--font-label)",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              letterSpacing: '-0.5px'
            }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Monochrome AI Status Indicator Dot */}
      {showStatus && (
        <span
          style={{
            position: 'absolute',
            bottom: '-2px',
            right: '-2px',
            width: `${Math.max(8, Math.floor(size * 0.22))}px`,
            height: `${Math.max(8, Math.floor(size * 0.22))}px`,
            borderRadius: '50%',
            background: isPaused ? 'var(--color-surface)' : 'var(--color-text-primary)',
            border: isPaused ? '2px solid var(--color-text-muted)' : '2px solid var(--color-surface)',
            boxShadow: '0 0 0 1px var(--color-border)',
            display: 'block'
          }}
        />
      )}
    </div>
  );
}
