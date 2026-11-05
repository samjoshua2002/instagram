'use client';

/**
 * Scroll-linked motion for page heroes (GSAP + ScrollTrigger).
 *
 *  - useHeroCollapse: a big hero shrinks into a compact sticky band as the page scrolls.
 *    The hero is made `position: sticky` with a negative `top`, so it never changes height
 *    (no layout jump); only transforms and opacity are scrubbed. Optionally coordinates a
 *    second sticky row (toolbar) right under the band.
 *  - useRevealOnce: sections fade/rise in once when they first reach the viewport.
 *
 * The app scrolls inside `.app-main-content`, not the window, so every trigger uses it.
 * Under prefers-reduced-motion nothing moves and the hero stays a normal static block.
 */

import { useEffect, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger);

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const MOTION_OK = '(prefers-reduced-motion: no-preference)';
const PHONE = '(max-width: 640px)';

export const scrollerOf = (el) => el?.closest('.app-main-content') || window;

/** Offset of `el` inside `ancestor`, ignoring transforms. */
function offsetIn(el, ancestor) {
  let x = 0;
  let y = 0;
  for (let n = el; n && n !== ancestor; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

/** Untransformed box of an element's text (centred text is narrower than its block). */
function inkBox(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const ink = range.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const s = Number(gsap.getProperty(el, 'scaleX')) || 1;
  if (!ink.width) return { dx: 0, dy: 0, w: el.offsetWidth, h: el.offsetHeight };
  return { dx: (ink.left - box.left) / s, dy: (ink.top - box.top) / s, w: ink.width / s, h: ink.height / s };
}

/** Refresh trigger positions when the page's geometry changes (data, fonts, images). */
function watchGeometry(els) {
  if (typeof ResizeObserver === 'undefined') return () => {};
  let t;
  let first = true;
  const ro = new ResizeObserver(() => {
    if (first) { first = false; return; } // initial callback: triggers were just measured
    clearTimeout(t);
    t = setTimeout(() => ScrollTrigger.refresh(), 120);
  });
  els.filter(Boolean).forEach((el) => ro.observe(el));
  return () => { clearTimeout(t); ro.disconnect(); };
}

/**
 * @param {React.RefObject<HTMLElement>} rootRef page root (the hero's parent)
 * @param {object} o selectors, scoped to the hero: hero, media (avatar/cover), title, fade (secondary bits),
 *   pin (optional control that stays in the band, e.g. a back button); `stack` (scoped to root) is an
 *   optional sticky row that sits under the band and gets `.is-stuck` while stuck.
 */
export function useHeroCollapse(rootRef, o, deps = []) {
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    const hero = root?.querySelector(o.hero);
    if (!root || !hero) return undefined;
    const scroller = scrollerOf(root);
    const stack = o.stack ? root.querySelector(o.stack) : null;
    const mm = gsap.matchMedia();

    mm.add({ motion: MOTION_OK, phone: PHONE }, (ctx) => {
      const { motion, phone } = ctx.conditions;
      const band = motion ? (phone ? 56 : 64) : 0;
      const cleanups = [];
      gsap.set(root, { '--hero-band': `${band}px` });

      if (motion) {
        const media = hero.querySelector(o.media);
        const title = hero.querySelector(o.title);
        const pin = o.pin ? hero.querySelector(o.pin) : null;
        const fades = gsap.utils.toArray(o.fade, hero);
        const surface = hero.querySelector('.hero-surface');
        const m = {};

        gsap.set(hero, { position: 'sticky', zIndex: 30 });
        gsap.set(media, { transformOrigin: '0 0' });
        // Own GPU layers for everything that moves: the browser only re-composites each
        // frame instead of re-painting text, shadows and the avatar while scrolling.
        gsap.set([media, title, pin, surface, ...fades].filter(Boolean), { willChange: 'transform, opacity' });

        const measure = () => {
          const H = hero.offsetHeight;
          const W = hero.offsetWidth;
          const yc = H - band / 2; // band centre, in hero coordinates, once fully collapsed
          m.travel = parseFloat(getComputedStyle(root).paddingTop) + H - band;
          gsap.set(hero, { top: band - H });

          let left = 0;
          if (pin) {
            const p = offsetIn(pin, hero);
            m.pinY = yc - (p.y + pin.offsetHeight / 2);
            left = p.x + pin.offsetWidth + 8;
          }

          const a = band - 16; // compact avatar/cover size
          const mo = offsetIn(media, hero);
          m.mediaS = a / (media.offsetWidth || a);
          m.mediaX = left - mo.x;
          m.mediaY = yc - a / 2 - mo.y;
          left += a + 12;

          const to = offsetIn(title, hero);
          const ink = inkBox(title);
          const fs = parseFloat(getComputedStyle(title).fontSize) || 32;
          const s = Math.min((phone ? 17 : 20) / fs, (band - 14) / ink.h, (W - left - 8) / ink.w);
          m.titleS = s;
          m.titleOrigin = `${ink.dx}px ${ink.dy}px`;
          m.titleX = left - (to.x + ink.dx);
          m.titleY = yc - (ink.h * s) / 2 - (to.y + ink.dy);
          gsap.set(title, { transformOrigin: m.titleOrigin });
        };
        measure();
        ScrollTrigger.addEventListener('refreshInit', measure);
        cleanups.push(() => ScrollTrigger.removeEventListener('refreshInit', measure));

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: root,
            scroller,
            start: 'top top',
            end: () => `+=${m.travel}`,
            // Touch scrolling already moves smoothly; extra smoothing on phones makes the
            // avatar/title trail behind the (natively sticky) band, which reads as lag.
            scrub: phone ? true : 0.2,
            invalidateOnRefresh: true,
          },
        });
        tl.fromTo(fades, { opacity: 1, y: 0 }, { opacity: 0, y: -8, duration: 0.3 }, 0)
          .fromTo(media, { x: 0, y: 0, scale: 1 }, { x: () => m.mediaX, y: () => m.mediaY, scale: () => m.mediaS, duration: 1 }, 0)
          .fromTo(title, { x: 0, y: 0, scale: 1 }, { x: () => m.titleX, y: () => m.titleY, scale: () => m.titleS, duration: 1 }, 0);
        if (pin) tl.fromTo(pin, { y: 0 }, { y: () => m.pinY, duration: 1 }, 0);
        if (surface) tl.fromTo(surface, { opacity: 0 }, { opacity: 1, duration: 0.35 }, 0.65);
      }

      if (stack) {
        // Marks the toolbar while it is stuck, so it can take an opaque surface.
        const before = stack.previousElementSibling || hero;
        ScrollTrigger.create({
          trigger: before,
          scroller,
          start: () => `bottom top+=${band}`,
          end: 'max',
          toggleClass: { targets: stack, className: 'is-stuck' },
        });
      }

      // Keyboard focus scrolled into view must not land under the sticky band/toolbar.
      if (scroller !== window) {
        const stuckH = stack && getComputedStyle(stack).position === 'sticky' ? stack.offsetHeight : 0;
        gsap.set(scroller, { scrollPaddingTop: band + stuckH + 8 });
      }

      cleanups.push(watchGeometry([hero, root]));
      return () => cleanups.forEach((f) => f());
    });

    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * One-time rise-in for sections as they reach the viewport. Content is never hidden
 * without JS, and under reduced motion nothing is hidden at all.
 * @param {string[]} groups selectors scoped to root; children of each match stagger in.
 */
export function useRevealOnce(rootRef, groups, deps = []) {
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const scroller = scrollerOf(root);
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      groups.forEach(({ sel, children }) => {
        const el = root.querySelector(sel);
        if (!el) return;
        const targets = children ? Array.from(el.children) : [el];
        if (!targets.length) return;
        gsap.from(targets, {
          opacity: 0,
          y: children ? 12 : 16,
          duration: 0.45,
          ease: 'power3.out',
          stagger: 0.04,
          clearProps: 'opacity,transform',
          scrollTrigger: { trigger: el, scroller, start: 'top 94%', once: true },
        });
      });
    });
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
