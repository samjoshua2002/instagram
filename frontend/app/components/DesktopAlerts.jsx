'use client';

import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { isFeatureOn } from '../lib/workspaceFeatures';

const POLL_MS = 30 * 1000;
const SINCE_KEY = 'chatter_desktop_alerts_since';

const readSince = () => { try { return localStorage.getItem(SINCE_KEY); } catch { return null; } };
const writeSince = v => { try { localStorage.setItem(SINCE_KEY, v); } catch { /* storage blocked */ } };

/**
 * Native desktop notifications (PLAN.md §13 Phase 8). Renders nothing and only
 * runs inside the Tauri app (window.__TAURI__ comes from withGlobalTauri):
 * registers the device, then polls /api/desktop/alerts for new leads,
 * bookings and handoffs.
 */
export default function DesktopAlerts() {
  const { API_BASE, token, user, workspaceFeatures } = useApp();
  const enabled = isFeatureOn(workspaceFeatures, 'desktopPushAlerts');

  useEffect(() => {
    const tauri = typeof window !== 'undefined' ? window.__TAURI__ : null;
    if (!tauri || !token || !user || !enabled) return;

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const notify = tauri.notification;
    let timer;
    let stopped = false;

    const allowed = async () => {
      if (!notify) return false;
      if (await notify.isPermissionGranted()) return true;
      return (await notify.requestPermission()) === 'granted';
    };

    const poll = async () => {
      try {
        const since = readSince() || new Date().toISOString();
        const res = await fetch(`${API_BASE}/api/desktop/alerts?since=${encodeURIComponent(since)}`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        writeSince(new Date(data.now).toISOString());
        if (data.alerts?.length && await allowed()) {
          // Many at once (e.g. after sleep): one summary instead of a flood
          if (data.alerts.length > 3) {
            notify.sendNotification({ title: 'Chatter OS', body: `${data.alerts.length} new updates: leads, bookings or chats that need you` });
          } else {
            data.alerts.forEach(a => notify.sendNotification({ title: a.title, body: a.body }));
          }
        }
      } catch { /* offline: try again next tick */ }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };

    (async () => {
      try {
        const platform = await tauri.core.invoke('platform_id');
        await fetch(`${API_BASE}/api/desktop/register`, {
          method: 'POST', headers, body: JSON.stringify({ platform, deviceName: navigator.platform || '' }),
        });
      } catch { /* registration is best effort */ }
      poll();
    })();

    return () => { stopped = true; clearTimeout(timer); };
  }, [API_BASE, token, user?._id, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
