'use client';

import PageCover from './PageCover';
import UnsplashBanner from './UnsplashBanner';

/**
 * Shared page top (same look as Document Vault): wide photo cover, square photo tile with
 * an icon, small label, big title, description, meta line, then a row of action buttons.
 * The page root needs the `spx-page` class. `children` go in the action row.
 */
export default function PageHero({ seed, icon, eyebrow, title, desc, meta, tint = true, children }) {
  return (
    <>
      <PageCover seed={seed} tint={tint} />
      <header className="spx-hero">
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
