'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import gsap from 'gsap';

/** Animated number counter (GSAP): eases from the previous value to `value`. */
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
    const counter = { v: from.current };
    const tween = gsap.to(counter, {
      v: target,
      duration,
      ease: 'expo.out',
      onUpdate: () => { node.textContent = Math.round(counter.v).toLocaleString(); },
    });
    from.current = target;
    return () => tween.kill();
  }, [value, duration, reduce]);

  return <span ref={ref} className={className} style={style}>0</span>;
}
