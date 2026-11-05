/**
 * Motion system: one place for every curve, duration and preset.
 * The same numbers live as CSS variables in app/motion.css (--ease-*, --dur-*).
 *
 * Rules (UI.md §1.3):
 *  - Entrances ease-out; things already on screen move ease-in-out; exits ease-in.
 *  - Dropdowns / popovers 150-250ms; exits 20% shorter than their entrance.
 *  - Lists stagger 30ms. Popovers start at 0.95. Press = 0.97. Moving knobs stretch 12%.
 *  - No bounce (no springs) on everyday UI. Dragged things follow the pointer 1:1.
 */

export const EASE_OUT = [0.16, 1, 0.3, 1];
export const EASE_IN = [0.5, 0, 0.75, 0];
export const EASE_IN_OUT = [0.65, 0, 0.35, 1];
/** Softer curve for the second axis of an arc (see popFromTrigger). */
export const EASE_ARC = [0.45, 0, 0.2, 1];

export const DUR = {
  press: 0.1,
  dropdown: 0.2,
  enter: 0.24,
  move: 0.3,
  page: 0.28,
  pulse: 0.6,
};

/** Exits are 20% shorter than the matching entrance. */
export const exitOf = (d) => Math.round(d * 0.8 * 1000) / 1000;

export const STAGGER = 0.03;
export const POP_SCALE = 0.95;
export const PRESS_SCALE = 0.97;
export const KNOB_STRETCH = 1.12;

export const T = {
  enter: { duration: DUR.enter, ease: EASE_OUT },
  exit: { duration: exitOf(DUR.enter), ease: EASE_IN },
  dropdown: { duration: DUR.dropdown, ease: EASE_OUT },
  dropdownExit: { duration: exitOf(DUR.dropdown), ease: EASE_IN },
  move: { duration: DUR.move, ease: EASE_IN_OUT },
};

/** Backdrop fade for modals and sheets. */
export const backdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: T.enter },
  exit: { opacity: 0, transition: T.exit },
};

/** Expanding panel (accordion / dropdown body): clip-mask reveal, not a plain fade. */
export const revealMotion = {
  initial: { height: 0, clipPath: 'inset(0 0 100% 0)' },
  animate: { height: 'auto', clipPath: 'inset(0 0 0% 0)', transition: T.dropdown },
  exit: { height: 0, clipPath: 'inset(0 0 100% 0)', transition: T.dropdownExit },
};

/** Overlay revealed by a circle mask growing from the centre (e.g. avatar camera overlay). */
export const maskCircleMotion = {
  initial: { clipPath: 'circle(0% at 50% 50%)' },
  animate: { clipPath: 'circle(75% at 50% 50%)', transition: T.dropdown },
  exit: { clipPath: 'circle(0% at 50% 50%)', transition: T.dropdownExit },
};

/** Small inline notice / banner sliding in from above. */
export const dropMotion = {
  initial: { opacity: 0, y: -8, scale: POP_SCALE },
  animate: { opacity: 1, y: 0, scale: 1, transition: T.dropdown },
  exit: { opacity: 0, y: -8, scale: POP_SCALE, transition: T.dropdownExit },
};

/** Section / card entering the page. */
export const enterMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: T.enter },
};

/** List with a 30ms waterfall. Put listItem on each row. */
export const listContainer = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER } },
};
export const listItem = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: T.enter },
};

/**
 * Row in an animated list (AnimatePresence + layout): rises in with a 30ms
 * waterfall by index, leaves 20% faster, and neighbours slide (ease-in-out) to fill the gap.
 */
export const rowMotion = (i = 0) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { ...T.enter, delay: Math.min(i, 10) * STAGGER } },
  exit: { opacity: 0, scale: POP_SCALE, transition: T.exit },
  transition: { layout: T.move },
});

/** Content swapping in place (view mode change): reuses the layout, fades + settles. */
export const swapMotion = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: T.enter },
  exit: { opacity: 0, scale: 0.98, transition: T.exit },
  transition: { layout: T.move },
};

/**
 * Settle: the card (layout) lands first, then its details (numbers, labels)
 * fade in one after another. Use settleCard on the card, settleDetail inside.
 */
export const settleCard = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { ...T.enter, when: 'beforeChildren', delayChildren: 0.04, staggerChildren: STAGGER },
  },
};
export const settleDetail = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } },
};

/* ───────────── Trigger tracking ─────────────
 * Remembers where the user last pressed (or pressed Enter/Space), so popups
 * can grow out of the button that opened them and shrink back into it. */

let lastTrigger = null;
const history = []; // newest last, a few entries: lets a success pulse skip buttons that already closed

function record(el, x, y) {
  lastTrigger = { el, x, y, time: Date.now() };
  history.push(lastTrigger);
  if (history.length > 6) history.shift();
}

export function installTriggerTracking() {
  if (typeof window === 'undefined' || window.__chatterTriggers) return () => {};
  window.__chatterTriggers = true;
  const onPointer = (e) => {
    const el = e.target?.closest?.('button, a, [role="button"], [role="tab"], label, summary') || e.target;
    const r = el?.getBoundingClientRect?.();
    if (r && r.width) record(el, r.left + r.width / 2, r.top + r.height / 2);
    else record(el, e.clientX, e.clientY);
  };
  const onKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = document.activeElement;
    const r = el?.getBoundingClientRect?.();
    if (r && r.width) record(el, r.left + r.width / 2, r.top + r.height / 2);
  };
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey, true);
  return () => {
    window.__chatterTriggers = false;
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('keydown', onKey, true);
  };
}

/** Last pressed point if it happened within maxAge ms, else null. */
export function getTrigger(maxAge = 1500) {
  if (!lastTrigger || Date.now() - lastTrigger.time > maxAge) return null;
  return lastTrigger;
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Popover / modal that enters from the trigger and exits back into it,
 * travelling a short arc (x and y use different curves, so the path bends).
 * The box is assumed centred in the viewport (all our modals are), so this is
 * safe to compute during render. Freeze the result with useState(() => ...).
 *
 *   const [pop] = useState(() => popFromTrigger({ reduce }));
 *   <motion.div {...pop} />
 */
export function popFromTrigger({ reduce = false, sheet = false, travel = 0.3, duration = DUR.enter } = {}) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.15 } },
      exit: { opacity: 0, transition: { duration: 0.12 } },
    };
  }
  if (sheet) {
    return {
      initial: { opacity: 1, y: '100%' },
      animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } },
      exit: { opacity: 1, y: '100%', transition: { duration: exitOf(0.3), ease: EASE_IN } },
    };
  }
  const tr = typeof window !== 'undefined' ? getTrigger() : null;
  const dx = tr ? (tr.x - window.innerWidth / 2) * travel : 0;
  const dy = tr ? (tr.y - window.innerHeight / 2) * travel : 16;
  const origin = tr
    ? `calc(50% + ${Math.round(tr.x - window.innerWidth / 2)}px) calc(50% + ${Math.round(tr.y - window.innerHeight / 2)}px)`
    : '50% 50%';
  const out = exitOf(duration);
  return {
    style: { transformOrigin: origin },
    initial: { opacity: 0, scale: POP_SCALE, x: dx, y: dy },
    animate: {
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      transition: {
        default: { duration, ease: EASE_OUT },
        opacity: { duration: duration * 0.6, ease: EASE_OUT },
        y: { duration, ease: EASE_ARC },
      },
    },
    exit: {
      opacity: 0,
      scale: POP_SCALE,
      x: dx,
      y: dy,
      transition: {
        default: { duration: out, ease: EASE_IN },
        opacity: { duration: out, ease: EASE_IN },
        y: { duration: out, ease: EASE_IN_OUT },
      },
    },
  };
}

/** True on phone widths, where our dialogs become bottom sheets. */
export const isSheetViewport = (max = 768) =>
  typeof window !== 'undefined' && !!window.matchMedia?.(`(max-width: ${max}px)`).matches;

/* ───────────── Success pulse ───────────── */

/** Gentle outward wave on an element to confirm success. */
export function pulse(el, color) {
  if (!el || !el.animate || prefersReducedMotion()) return;
  const c = color || getComputedStyle(document.documentElement).getPropertyValue('--color-success').trim() || '#1db954';
  el.animate(
    [
      { boxShadow: `0 0 0 0 color-mix(in srgb, ${c} 55%, transparent)` },
      { boxShadow: `0 0 0 10px color-mix(in srgb, ${c} 0%, transparent)` },
    ],
    { duration: DUR.pulse * 1000, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
  );
}

/**
 * Pulse the newest recently pressed button that is still on screen
 * (e.g. after a confirm dialog closes, its own buttons are gone, so the
 * button that opened it gets the pulse instead).
 */
export function pulseLastTrigger(maxAge = 15000) {
  const now = Date.now();
  for (let i = history.length - 1; i >= 0; i--) {
    const tr = history[i];
    if (now - tr.time > maxAge) break;
    const el = tr.el?.closest?.('button, a, [role="button"]');
    if (el && el.isConnected && el.getClientRects().length) return pulse(el);
  }
}
