'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share, PlusSquare, X } from 'lucide-react';

/**
 * "Install app" button. Chrome / Edge / Android: the browser's own install prompt.
 * iPhone and iPad Safari have no prompt, so a short "Share > Add to Home Screen" guide opens instead.
 * Hidden when the app is already installed (running in its own window).
 */
let deferred = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    listeners.forEach(f => f());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

const isStandalone = () => typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
const isIOS = () => typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export default function InstallApp({ className = '', label = 'Install app' }) {
  const [, tick] = useState(0);
  const [ready, setReady] = useState(false);
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    setReady(true);
    const f = () => tick(n => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  if (!ready || isStandalone()) return null;
  const ios = isIOS();
  if (!deferred && !ios) return null; // browser cannot install (or it is already installed)

  const install = async () => {
    if (deferred) {
      const e = deferred;
      deferred = null;
      e.prompt();
      try { await e.userChoice; } catch { /* dismissed */ }
      tick(n => n + 1);
    } else {
      setGuide(true);
    }
  };

  return (
    <>
      <button type="button" className={`install-app-btn ${className}`} onClick={install}>
        <Download size={15} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {guide && createPortal(
        <div className="install-guide-backdrop" onClick={() => setGuide(false)}>
          <div className="install-guide" role="dialog" aria-label="Install Chatter OS" onClick={e => e.stopPropagation()}>
            <button type="button" className="install-guide-close" onClick={() => setGuide(false)} aria-label="Close"><X size={18} /></button>
            <img src="/icon-192.png" alt="" width="56" height="56" />
            <h3>Install Chatter OS</h3>
            <ol>
              <li><span>1</span> Tap <Share size={16} aria-label="Share" /> <b>Share</b> in Safari's toolbar</li>
              <li><span>2</span> Choose <PlusSquare size={16} aria-hidden="true" /> <b>Add to Home Screen</b></li>
              <li><span>3</span> Tap <b>Add</b>. It opens like an app, full screen</li>
            </ol>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
