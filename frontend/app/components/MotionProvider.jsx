'use client';

import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { installTriggerTracking, PRESS_SCALE, T } from '../lib/motion';

/**
 * App-wide motion runtime (mounted once in layout.jsx):
 *  - MotionConfig: respects the OS "reduce motion" setting; layout moves default to ease-in-out.
 *  - Trigger tracking: popups grow out of (and shrink back into) the button that opened them.
 *  - Press: every button / link / tab deflates to 0.97 instantly on press and eases back on release.
 *  - Rubber band: horizontal pill rows stretch a little past their ends, then snap back.
 *  - Text areas grow with their text where CSS `field-sizing: content` is missing.
 */
export default function MotionProvider({ children }) {
  useEffect(() => {
    const off = [installTriggerTracking(), installPress(), installRubberBand(), installAutoGrow()];
    return () => off.forEach((f) => f && f());
  }, []);

  return (
    <MotionConfig reducedMotion="user" transition={T.move}>
      {children}
    </MotionConfig>
  );
}

/* ───────────── Text area auto-grow (fallback for field-sizing) ───────────── */

// The CSS (globals.css) sets min-height / max-height; this only sets the height to the text.
function installAutoGrow() {
  if (typeof window === 'undefined' || window.CSS?.supports?.('field-sizing', 'content')) return null;
  const grow = (el) => {
    if (!(el instanceof HTMLTextAreaElement)) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  const onInput = (e) => grow(e.target);
  const onFocus = (e) => grow(e.target);
  document.addEventListener('input', onInput, true);
  document.addEventListener('focusin', onFocus, true);
  return () => {
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('focusin', onFocus, true);
  };
}

/* ───────────── Press: scale 0.97 ───────────── */

const PRESS_SEL = 'button, a[href], [role="button"], [role="tab"], summary, .press';
const PRESS_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

function pressTarget(node) {
  const el = node?.closest?.(PRESS_SEL);
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
  if (el.closest('[data-no-press], [role="switch"], .feature-switch')) return null;
  return el;
}

function installPress() {
  if (typeof window === 'undefined' || !Element.prototype.animate) return null;
  let held = null;

  const down = (el) => {
    const r = el.getBoundingClientRect();
    // Big surfaces (full-width rows, tiles) shrink by at most ~8px so they don't look like they collapse
    const s = Math.max(PRESS_SCALE, 1 - 8 / Math.max(r.width, r.height, 1));
    el.__press?.cancel();
    el.__press = el.animate([{ scale: '1' }, { scale: String(s) }], { duration: 70, easing: 'ease-out', fill: 'forwards' });
    held = el;
  };
  const up = () => {
    const el = held;
    if (!el) return;
    held = null;
    const now = getComputedStyle(el).scale;
    el.__press?.cancel();
    el.__press = el.animate([{ scale: now && now !== 'none' ? now : String(PRESS_SCALE) }, { scale: '1' }], {
      duration: 200,
      easing: PRESS_EASE,
    });
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const el = pressTarget(e.target);
    if (el) down(el);
  };
  const onKeyDown = (e) => {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat) return;
    const el = pressTarget(document.activeElement);
    if (el) down(el);
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  document.addEventListener('dragstart', up, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', up, true);
  window.addEventListener('blur', up);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', up, true);
    document.removeEventListener('dragstart', up, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', up, true);
    window.removeEventListener('blur', up);
  };
}

/* ───────────── Rubber band past bounds ───────────── */

const RUBBER_SEL = '.sp-chips, .sh-chips, .person-tabs, .spx-pills, .people-pills, .mode-segment, [data-rubber]';

/** iOS-style resistance: the further you pull, the less it moves. */
export const rubber = (d, size, c = 0.55) => Math.sign(d) * (1 - 1 / ((Math.abs(d) * c) / size + 1)) * size;

function installRubberBand() {
  if (typeof window === 'undefined' || !Element.prototype.animate) return null;
  // iOS Safari already rubber-bands scroll containers natively
  const ua = navigator.userAgent;
  if (/iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return null;

  let s = null;

  const onStart = (e) => {
    const el = e.target?.closest?.(RUBBER_SEL);
    if (!el || e.touches.length !== 1 || el.scrollWidth <= el.clientWidth + 1) return;
    const t = e.touches[0];
    el.__rubber?.cancel();
    s = { el, x0: t.clientX, y0: t.clientY, axis: null, edgeX: null };
  };

  const onMove = (e) => {
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x0;
    const dy = t.clientY - s.y0;
    if (!s.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (s.axis !== 'x') return;
    const { el } = s;
    const max = el.scrollWidth - el.clientWidth;
    const atStart = el.scrollLeft <= 0;
    const atEnd = el.scrollLeft >= max - 1;
    if (s.edgeX == null) {
      if ((atStart && dx > 0) || (atEnd && dx < 0)) s.edgeX = t.clientX;
      else return;
    }
    const over = t.clientX - s.edgeX;
    // Only stretch outward from the edge we are pulling on
    if ((atStart && over < 0) || (atEnd && !atStart && over > 0)) {
      el.style.translate = '';
      s.edgeX = null;
      return;
    }
    // Follows the finger 1:1 through the resistance curve: no tween while held
    el.style.translate = `${rubber(over, el.clientWidth).toFixed(2)}px 0`;
  };

  const onEnd = () => {
    if (!s) return;
    const { el } = s;
    s = null;
    const now = el.style.translate;
    if (!now || now === '0px 0px') return;
    el.style.translate = '';
    el.__rubber = el.animate([{ translate: now }, { translate: '0 0' }], { duration: 380, easing: PRESS_EASE });
  };

  document.addEventListener('touchstart', onStart, { passive: true, capture: true });
  document.addEventListener('touchmove', onMove, { passive: true, capture: true });
  document.addEventListener('touchend', onEnd, true);
  document.addEventListener('touchcancel', onEnd, true);
  return () => {
    document.removeEventListener('touchstart', onStart, true);
    document.removeEventListener('touchmove', onMove, true);
    document.removeEventListener('touchend', onEnd, true);
    document.removeEventListener('touchcancel', onEnd, true);
  };
}
