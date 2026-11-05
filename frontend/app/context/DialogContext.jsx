'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Info } from 'lucide-react';

/**
 * In-app popups instead of the browser's window.confirm / window.alert.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete Sam?', message: '...', confirmLabel: 'Delete', tone: 'danger' }))) return;
 *
 *   const alertBox = useAlert();
 *   await alertBox({ title: 'Missing handle', message: 'Enter an Instagram handle.' });
 *
 * Styles live in globals.css (.dialog-*), so the look follows the site theme.
 * On phones the popup opens as a bottom sheet.
 */
const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const open = useCallback((opts) => new Promise((resolve) => {
    // A new popup replaces an open one; the old one counts as cancelled
    resolverRef.current?.(false);
    resolverRef.current = resolve;
    setDialog(opts);
  }), []);

  const close = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  const confirm = useCallback((opts = {}) => open({ kind: 'confirm', ...(typeof opts === 'string' ? { message: opts } : opts) }), [open]);
  const alertBox = useCallback((opts = {}) => open({ kind: 'alert', ...(typeof opts === 'string' ? { message: opts } : opts) }), [open]);

  return (
    <DialogContext.Provider value={{ confirm, alert: alertBox }}>
      {children}
      <AnimatePresence>{dialog && <DialogView key="dialog" dialog={dialog} onClose={close} />}</AnimatePresence>
    </DialogContext.Provider>
  );
}

function DialogView({ dialog, onClose }) {
  const reduce = useReducedMotion();
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const boxRef = useRef(null);
  const isAlert = dialog.kind === 'alert';
  const danger = dialog.tone === 'danger';
  const Icon = danger ? AlertTriangle : Info;

  useEffect(() => {
    const prevFocus = document.activeElement;
    // Safer default: Cancel has focus on delete popups, so Enter never deletes by accident
    (isAlert || !danger ? confirmRef : cancelRef).current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(false); }
      if (e.key === 'Tab' && boxRef.current) {
        const items = boxRef.current.querySelectorAll('button');
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [isAlert, danger, onClose]);

  return (
    <motion.div
      className="dialog-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false); }}
    >
      <motion.div
        ref={boxRef}
        className="dialog-box"
        role={isAlert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby={dialog.message ? 'app-dialog-message' : undefined}
        initial={{ opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduce ? 0 : 16, transition: { duration: 0.12 } }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={`dialog-icon ${danger ? 'dialog-icon-danger' : ''}`}><Icon size={20} /></div>
        <h2 id="app-dialog-title" className="dialog-title">{dialog.title || (isAlert ? 'Heads up' : 'Are you sure?')}</h2>
        {dialog.message && <p id="app-dialog-message" className="dialog-message">{dialog.message}</p>}
        <div className="dialog-actions">
          {!isAlert && (
            <button ref={cancelRef} type="button" className="dialog-btn dialog-btn-ghost" onClick={() => onClose(false)}>
              {dialog.cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`dialog-btn ${danger ? 'dialog-btn-danger' : 'dialog-btn-primary'}`}
            onClick={() => onClose(true)}
          >
            {dialog.confirmLabel || (isAlert ? 'OK' : 'Confirm')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const fallback = {
  confirm: async () => false,
  alert: async () => true,
};

export const useConfirm = () => (useContext(DialogContext) || fallback).confirm;
export const useAlert = () => (useContext(DialogContext) || fallback).alert;
