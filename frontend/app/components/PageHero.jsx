'use client';

import { useMemo, useRef } from 'react';
import PageCover from './PageCover';
import UnsplashBanner from './UnsplashBanner';
import { useHeroCollapse, PAGE_HERO } from '../lib/scrollMotion';

/**
 * Shared page top (same look as Document Vault): wide photo cover, square photo tile with
 * an icon, small label, big title, description, meta line, then a row of action buttons.
 * The page root needs the `spx-page` class. `children` go in the action row.
 * On scroll the header shrinks into a sticky band (desktop and phones); pass
 * `collapse={false}` when the page runs useHeroCollapse itself (People list + its toolbar).
 */
export default function PageHero({ seed, icon, eyebrow, title, desc, meta, tint = true, collapse = true, children }) {
  const heroRef = useRef(null);
  // The page root is the header's parent (the hook measures padding and sticks inside it).
  const rootRef = useMemo(() => ({ get current() { return heroRef.current?.parentElement || null; } }), []);
  useHeroCollapse(rootRef, collapse ? PAGE_HERO : null, [collapse]);

  return (
    <>
      <PageCover seed={seed} tint={tint} />
      <header ref={heroRef} className="spx-hero">
        <span className="hero-surface" aria-hidden="true" />
        <UnsplashBanner seed={seed} credit={false} className="spx-cover">{icon}</UnsplashBanner>
        <div className="spx-hero-text">
          {eyebrow && <div className="spx-eyebrow">{eyebrow}</div>}
          <h1 className="spx-title">{title}</h1>
          {desc && <p className="spx-desc">{desc}</p>}
          {meta && <div className="spx-meta">Chatter OS <span>· {meta}</span></div>}
        </div>
      </header>
      {children && <div className="spx-actions">{children}</div>}
    </>
  );
}
