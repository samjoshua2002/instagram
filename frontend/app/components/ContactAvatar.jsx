'use client';

import React, { useState } from 'react';

/**
 * High-performance Monochrome Avatar Component (Light Theme)
 * - Fetches Instagram DP / Profile picture
 * - Robust multi-tier fallback (Instagram -> Unavatar -> Clean Initials)
 * - Monochrome AI indicator dot: Full AI (solid black), Only Reels (ring), Paused (dim dot)
 */
export default function ContactAvatar({ contact, size = 40, showStatus = true, style = {} }) {
  const [imgError, setImgError] = useState(false);
  const [unavatarError, setUnavatarError] = useState(false);

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
    avatarSrc = `https://unavatar.io/instagram/${rawUsername}?fallback=false`;
  }

  // Monochrome status indicator
  const isPaused = contact.aiEnabled === false;
  const isReelsOnly = !isPaused && contact.replyToMessages === false && contact.replyToReelsAndPosts !== false;
  const statusTitle = isPaused ? 'AI Paused (Manual)' : (isReelsOnly ? 'AI Only Reacts to Reels' : 'Full AI Active');

  const handleImgError = () => {
    if (!imgError && contact.profilePic) {
      setImgError(true);
    } else {
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
        borderRadius: '8px',
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
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#f4f4f5',
          border: '1px solid #e4e4e7',
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
              background: '#f4f4f5',
              color: '#09090b',
              fontSize: `${Math.max(10, Math.floor(size * 0.36))}px`,
              fontWeight: '700',
              fontFamily: "'JetBrains Mono', monospace",
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
            background: isPaused ? '#ffffff' : '#09090b',
            border: isPaused ? '2px solid #a1a1aa' : (isReelsOnly ? '2px solid #09090b' : '2px solid #ffffff'),
            boxShadow: '0 0 0 1px #e4e4e7',
            display: 'block'
          }}
        />
      )}
    </div>
  );
}
