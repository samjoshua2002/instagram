'use client';

import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { isFeatureOn } from '../lib/workspaceFeatures';

const POLL_MS = 15 * 1000;
const SINCE_KEY = 'chatter_desktop_alerts_since';

const readSince = () => { try { return localStorage.getItem(SINCE_KEY); } catch { return null; } };
const writeSince = v => { try { localStorage.setItem(SINCE_KEY, v); } catch { /* storage blocked */ } };

/**
 * Notifications (PLAN.md §13 Phase 8). Renders nothing. Inside the Tauri app
 * (window.__TAURI__ from withGlobalTauri) it registers the device and uses
 * native notifications; in a normal browser it uses the Web Notification API.
 * Polls /api/desktop/alerts for new DMs (first-time senders flagged as
 * "New person"), leads, bookings and handoffs.
 */
export default function DesktopAlerts() {
  const { API_BASE, token, user, workspaceFeatures } = useApp();
  const enabled = isFeatureOn(workspaceFeatures, 'desktopPushAlerts');

  useEffect(() => {
    if (typeof window === 'undefined' || !token || !user || !enabled) return;
    const tauri = window.__TAURI__ || null;
    const WebN = !tauri && 'Notification' in window ? window.Notification : null;
    if (!tauri && !WebN) return;

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    let timer;
    let stopped = false;

    // Browsers only show the permission prompt after a click, so ask on the first one
    const askOnClick = () => { WebN.requestPermission().catch(() => {}); };
    if (WebN && WebN.permission === 'default') window.addEventListener('click', askOnClick, { once: true });

    const notify = tauri ? tauri.notification : {
      sendNotification: ({ title, body, tag }) => {
        try {
          const n = new WebN(title, { body, tag, icon: '/favicon.svg' });
          n.onclick = () => { window.focus(); window.location.href = '/relationships'; n.close(); };
        } catch { /* some mobile browsers need a service worker */ }
      },
    };

    const allowed = async () => {
      if (WebN) return WebN.permission === 'granted';
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
            const msgs = data.alerts.filter(a => a.kind === 'message' || a.kind === 'new_contact').length;
            notify.sendNotification({ title: 'Chatter OS', body: msgs ? `${msgs} people messaged you${data.alerts.length > msgs ? `, plus ${data.alerts.length - msgs} other updates` : ''}` : `${data.alerts.length} new updates: leads, bookings or chats that need you` });
          } else {
            data.alerts.forEach(a => notify.sendNotification({ title: a.title, body: a.body, tag: a.id }));
          }
        }
      } catch { /* offline: try again next tick */ }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };

    (async () => {
      if (!tauri) { poll(); return; }
      try {
        const platform = await tauri.core.invoke('platform_id');
        await fetch(`${API_BASE}/api/desktop/register`, {
          method: 'POST', headers, body: JSON.stringify({ platform, deviceName: navigator.platform || '' }),
        });
      } catch { /* registration is best effort */ }
      poll();
    })();

    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('click', askOnClick); };
  }, [API_BASE, token, user?._id, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
