'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DUR, EASE_IN, EASE_OUT, T, exitOf, pulseLastTrigger } from '../lib/motion';

const ICONS = { success: Check, error: AlertCircle, warning: AlertTriangle, info: Info };

/**
 * Toaster: Spotify-style pills, bottom centre, stacked (max 3).
 * On mobile they sit above the bottom tab bar. Colours come from globals.css (.toast-*).
 * Use anywhere: showToast(message, 'success' | 'error' | 'warning' | 'info', { action, duration }).
 */
export default function Toaster() {
  const { toasts = [], dismissToast } = useApp();
  const reduce = useReducedMotion();

  // Success confirms where it happened: the button the user pressed gives a gentle outward pulse
  const seen = useRef(new Set());
  useEffect(() => {
    toasts.forEach(t => {
      if (seen.current.has(t.id)) return;
      seen.current.add(t.id);
      if (t.type === 'success') pulseLastTrigger();
    });
  }, [toasts]);

  return (
    <div className="toast-region" aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {toasts.map(t => {
          const Icon = ICONS[t.type] || Info;
          return (
            <motion.div
              key={t.id}
              layout
              role={t.type === 'error' ? 'alert' : 'status'}
              className={`toast toast-${ICONS[t.type] ? t.type : 'info'}`}
              initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.95, transition: { duration: exitOf(DUR.enter), ease: EASE_IN } }}
              transition={{ duration: DUR.enter, ease: EASE_OUT, layout: T.move }}
            >
              <span className="toast-icon"><Icon size={16} strokeWidth={2.5} /></span>
              <span className="toast-text">{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => { t.action.onClick?.(); dismissToast(t.id); }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
