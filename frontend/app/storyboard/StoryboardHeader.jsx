'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { currentMode } from '../lib/workspaceFeatures';

/** Which board a mode opens: Personal and Hybrid start on personal, Business on business. */
export const storyboardPathFor = mode => (mode === 'business' ? '/storyboard/business' : '/storyboard/personal');

/**
 * Title block for the storyboard pages. Personal mode only sees the personal
 * board and Business mode only the customer journey; Hybrid gets tabs for both.
 */
export default function StoryboardHeader({ active, code, title, description }) {
  const router = useRouter();
  const { user, workspaceFeatures } = useApp();
  const mode = currentMode(workspaceFeatures, user);
  const allowed = mode === 'hybrid' || mode === active;

  // Wrong board for this mode (old link or bookmark): open the right one, once the real mode has loaded
  const loaded = Boolean(workspaceFeatures?.activeMode);
  useEffect(() => {
    if (loaded && !allowed) router.replace(storyboardPathFor(mode));
  }, [loaded, allowed, mode, router]);

  return (
    <div style={{ marginBottom: '18px' }}>
      <div className="mono" style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 'bold' }}>{code}</div>
      <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', margin: '4px 0 6px' }}>{title}</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: '0 0 14px', lineHeight: 1.5 }}>{description}</p>
      {mode === 'hybrid' && (
        <div className="sheet-segment" style={{ maxWidth: '320px' }} role="tablist" aria-label="Storyboard">
          <Link href="/storyboard/personal" role="tab" aria-selected={active === 'personal'} className={`story-tab${active === 'personal' ? ' active' : ''}`}>Personal</Link>
          <Link href="/storyboard/business" role="tab" aria-selected={active === 'business'} className={`story-tab${active === 'business' ? ' active' : ''}`}>Business</Link>
        </div>
      )}
    </div>
  );
}
