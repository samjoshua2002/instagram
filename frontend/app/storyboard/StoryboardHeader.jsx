'use client';

import React from 'react';
import Link from 'next/link';

/** Title block + Personal / Business tabs shared by both storyboard pages. */
export default function StoryboardHeader({ active, code, title, description }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div className="mono" style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 'bold' }}>{code}</div>
      <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', margin: '4px 0 6px' }}>{title}</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: '0 0 14px', lineHeight: 1.5 }}>{description}</p>
      <div className="sheet-segment" style={{ maxWidth: '320px' }} role="tablist" aria-label="Storyboard">
        <Link href="/storyboard/personal" role="tab" aria-selected={active === 'personal'} className={`story-tab${active === 'personal' ? ' active' : ''}`}>Personal</Link>
        <Link href="/storyboard/business" role="tab" aria-selected={active === 'business'} className={`story-tab${active === 'business' ? ' active' : ''}`}>Business</Link>
      </div>
    </div>
  );
}
