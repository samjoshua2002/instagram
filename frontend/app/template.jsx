'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * Page transition (PLAN.md §13 Phase 5). A template re-mounts on every route
 * change, so each page fades and lifts in; reduced-motion users get a plain fade.
 */
export default function Template({ children }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
