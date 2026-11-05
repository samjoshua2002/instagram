'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

// Same curve as GSAP's expo.out, without loading the 50 KB GSAP library.
const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Animated number counter: eases from the previous value to `value`. */
export default function CountUp({ value = 0, duration = 1.1, className, style }) {
  const ref = useRef(null);
  const from = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    const target = Number(value) || 0;
    if (!node) return;
    const start = from.current;
    from.current = target;
    if (reduce || start === target) {
      node.textContent = target.toLocaleString();
      return;
    }
    let frame;
    const t0 = performance.now();
    const tick = (now) => {
      const p = expoOut(Math.min(1, (now - t0) / (duration * 1000)));
      node.textContent = Math.round(start + (target - start) * p).toLocaleString();
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduce]);

  return <span ref={ref} className={className} style={style}>0</span>;
}
