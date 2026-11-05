'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import PageHero from '../components/PageHero';
import { Network, Route } from 'lucide-react';
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
    <PageHero
      seed={`page-storyboard-${active}`}
      icon={active === 'business' ? <Route size={96} strokeWidth={2} /> : <Network size={96} strokeWidth={2} />}
      eyebrow={code.replace(/^\/\/\s*/, '')}
      title={title}
      desc={description}
    >
      {mode === 'hybrid' && (
        <>
          <Link href="/storyboard/personal" className="spx-outline" aria-pressed={active === 'personal'}>Personal</Link>
          <Link href="/storyboard/business" className="spx-outline" aria-pressed={active === 'business'}>Business</Link>
        </>
      )}
    </PageHero>
  );
}
