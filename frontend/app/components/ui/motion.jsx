'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DUR, EASE_IN, EASE_IN_OUT, EASE_OUT, KNOB_STRETCH, T, exitOf } from '../../lib/motion';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Shared sliding indicator for segmented controls / pill tabs.
 * Render it inside the ACTIVE item only; it morphs (same element, new size and
 * place) to the next active item with ease-in-out, stretching 12% mid-move.
 * The item needs no extra CSS: motion.css hides its own active background and
 * paints the indicator with the group's --seg-bg colour.
 *
 *   const seg = useSegId();
 *   {items.map(i => <button className={active ? 'active' : ''}>{active && <SegIndicator id={seg} />}{i.label}</button>)}
 */
// Live indicators per id. A new one rendering while the old is still mounted = a move.
const alive = new Map();

export function useSegId() {
  return `seg-${useId()}`;
}

export function SegIndicator({ id, className = '' }) {
  // First paint (or coming back to a page): sit still. Taking over from a live one: stretch.
  const moved = useRef((alive.get(id) || 0) > 0);
  useEffect(() => {
    alive.set(id, (alive.get(id) || 0) + 1);
    return () => alive.set(id, (alive.get(id) || 1) - 1);
  }, [id]);
  return (
    <motion.span
      aria-hidden="true"
      layoutId={id}
      className={`seg-indicator ${className}`}
      initial={false}
      animate={moved.current ? { scaleX: [1, KNOB_STRETCH, 1] } : undefined}
      transition={{
        layout: { duration: DUR.move, ease: EASE_IN_OUT },
        scaleX: { duration: DUR.move, ease: EASE_IN_OUT, times: [0, 0.45, 1] },
      }}
    />
  );
}

/**
 * Crossfade between icons with a short directional blur.
 *   <IconSwap k={isOn ? 'pause' : 'play'}>{isOn ? <Pause/> : <Play/>}</IconSwap>
 */
export function IconSwap({ k, children, className = '' }) {
  return (
    <span className={`icon-swap ${className}`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={k}
          className="icon-swap-item"
          initial={{ opacity: 0, scale: 0.6, y: 3, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.2, ease: EASE_OUT } }}
          exit={{ opacity: 0, scale: 0.6, y: -3, filter: 'blur(4px)', transition: { duration: exitOf(0.2), ease: EASE_IN } }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Reuse the same container: it morphs to its content's new height (ease-in-out)
 * instead of jumping, and without squashing the content like a scale would.
 */
export function AutoHeight({ children, className = '', style }) {
  const inner = useRef(null);
  const [h, setH] = useState('auto');
  useIsoLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div className={className} style={{ overflow: 'hidden', ...style }} initial={false} animate={{ height: h }} transition={T.move}>
      <div ref={inner} style={{ display: 'flow-root' }}>{children}</div>
    </motion.div>
  );
}
