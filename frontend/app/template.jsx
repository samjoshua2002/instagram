'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { DUR, EASE_OUT } from './lib/motion';

/**
 * Page transition (PLAN.md §13 Phase 5). A template re-mounts on every route
 * change, so each page fades and lifts in (ease-out, no wait for the old page:
 * the new one starts at once, overlapping the swap); reduced-motion users get a plain fade.
 */
export default function Template({ children }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : DUR.page, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
