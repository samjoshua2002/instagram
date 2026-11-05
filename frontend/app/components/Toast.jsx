'use client';

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

const ICONS = { success: Check, error: AlertCircle, warning: AlertTriangle, info: Info };

/**
 * Toaster: Spotify-style pills, bottom centre, stacked (max 3).
 * On mobile they sit above the bottom tab bar. Colours come from globals.css (.toast-*).
 * Use anywhere: showToast(message, 'success' | 'error' | 'warning' | 'info', { action, duration }).
 */
export default function Toaster() {
  const { toasts = [], dismissToast } = useApp();
  const reduce = useReducedMotion();

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
              initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduce ? 0 : 8, transition: { duration: 0.15 } }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
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
