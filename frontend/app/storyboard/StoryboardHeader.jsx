'use client';

import React from 'react';

/** Title block for the storyboard page. */
export default function StoryboardHeader({ code, title, description }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div className="mono" style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 'bold' }}>{code}</div>
      <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', margin: '4px 0 6px' }}>{title}</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: '0 0 14px', lineHeight: 1.5 }}>{description}</p>
    </div>
  );
}
