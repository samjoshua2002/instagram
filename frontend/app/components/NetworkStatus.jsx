'use client';

import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import StatusScreen from './StatusScreen';

/**
 * No-internet screen. Covers the app while the device is offline (your data stays
 * on screen underneath), and shows a "Back online" toast when the connection returns.
 */
export default function NetworkStatus() {
  const { showToast, API_BASE } = useApp();
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const goOffline = () => { wasOffline.current = true; setOffline(true); };
    const goOnline = () => {
      setOffline(false);
      if (wasOffline.current) showToast?.('Back online', 'success');
      wasOffline.current = false;
    };
    if (navigator.onLine === false) goOffline();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [showToast]);

  const retry = async () => {
    setChecking(true);
    try {
      if (navigator.onLine === false) throw new Error('offline');
      await fetch(`${API_BASE}/health`, { cache: 'no-store' });
      setOffline(false);
      showToast?.('Back online', 'success');
      wasOffline.current = false;
    } catch {
      showToast?.('Still no connection. Check Wi-Fi or mobile data.', 'error');
    } finally {
      setChecking(false);
    }
  };

  if (!offline) return null;
  return (
    <StatusScreen
      overlay
      icon={WifiOff}
      title="No internet connection"
      message="Check your Wi-Fi or mobile data. Nothing is lost; we will pick up where you left off once you are back online."
      actions={[{ label: checking ? 'Checking...' : 'Try again', onClick: retry, icon: RefreshCw, disabled: checking }]}
    />
  );
}
