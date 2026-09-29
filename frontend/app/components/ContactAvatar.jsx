'use client';

import React, { useState } from 'react';

/**
 * High-performance Avatar Component
 * - Fetches Instagram DP / Profile picture
 * - Robust multi-tier fallback (Instagram -> Unavatar -> DiceBear Initials)
 * - Badges for AI status: Full AI (green), Only Reels (amber), Paused (red/dim)
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

  // Determine status color
  const isPaused = contact.aiEnabled === false;
  const isReelsOnly = !isPaused && contact.replyToMessages === false && contact.replyToReelsAndPosts !== false;
  const statusColor = isPaused ? '#ef4444' : (isReelsOnly ? '#f59e0b' : '#10b981');
  const statusTitle = isPaused ? 'AI Paused (Sam Manual)' : (isReelsOnly ? 'AI Only Reacts to Reels' : 'Full AI Active');

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
        borderRadius: '10px',
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
          borderRadius: '10px',
          overflow: 'hidden',
          background: '#18181b',
          border: '1px solid #27272a',
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
              background: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
              color: '#ffffff',
              fontSize: `${Math.max(10, Math.floor(size * 0.36))}px`,
              fontWeight: '800',
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

      {/* Online / AI Status Indicator Pill */}
      {showStatus && (
        <span
          style={{
            position: 'absolute',
            bottom: '-2px',
            right: '-2px',
            width: `${Math.max(8, Math.floor(size * 0.24))}px`,
            height: `${Math.max(8, Math.floor(size * 0.24))}px`,
            borderRadius: '50%',
            background: statusColor,
            border: '2px solid #000000',
            boxShadow: `0 0 8px ${statusColor}88`
          }}
          title={statusTitle}
        />
      )}
    </div>
  );
}
