'use client';

import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

/** Animated number counter: eases from the previous value to `value`. */
export default function CountUp({ value = 0, duration = 1.1, className, style }) {
  const ref = useRef(null);
  const from = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    const target = Number(value) || 0;
    if (!node) return;
    if (reduce) {
      node.textContent = target.toLocaleString();
      from.current = target;
      return;
    }
    const controls = animate(from.current, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: v => { node.textContent = Math.round(v).toLocaleString(); },
    });
    from.current = target;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return <span ref={ref} className={className} style={style}>0</span>;
}
