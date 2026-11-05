'use client';

import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { isFeatureOn } from '../lib/workspaceFeatures';

const POLL_MS = 15 * 1000;
const SINCE_KEY = 'chatter_alerts_since';

const readSince = () => { try { return localStorage.getItem(SINCE_KEY); } catch { return null; } };
const writeSince = v => { try { localStorage.setItem(SINCE_KEY, v); } catch { /* storage blocked */ } };

/**
 * Browser notifications (Web Notification API). Renders nothing.
 * Polls /api/alerts for new DMs (first-time senders flagged as "New person"),
 * leads, bookings and handoffs. Paused while the tab is hidden or offline.
 */
export default function BrowserAlerts() {
  const { API_BASE, token, user, workspaceFeatures } = useApp();
  const enabled = isFeatureOn(workspaceFeatures, 'desktopPushAlerts');

  useEffect(() => {
    if (typeof window === 'undefined' || !token || !user || !enabled) return;
    if (!('Notification' in window)) return;
    const WebN = window.Notification;

    const headers = { Authorization: `Bearer ${token}` };
    let timer;
    let stopped = false;

    // Browsers only show the permission prompt after a click, so ask on the first one
    const askOnClick = () => { WebN.requestPermission().catch(() => {}); };
    if (WebN.permission === 'default') window.addEventListener('click', askOnClick, { once: true });

    const send = ({ title, body, tag }) => {
      try {
        const n = new WebN(title, { body, tag, icon: '/favicon.svg' });
        n.onclick = () => { window.focus(); window.location.href = '/relationships'; n.close(); };
      } catch { /* some mobile browsers need a service worker */ }
    };

    const poll = async () => {
      if (!document.hidden && navigator.onLine !== false) {
        try {
          const since = readSince() || new Date().toISOString();
          const res = await fetch(`${API_BASE}/api/alerts?since=${encodeURIComponent(since)}`, { headers });
          if (res.ok) {
            const data = await res.json();
            writeSince(new Date(data.now).toISOString());
            if (data.alerts?.length && WebN.permission === 'granted') {
              // Many at once (e.g. after sleep): one summary instead of a flood
              if (data.alerts.length > 3) {
                const msgs = data.alerts.filter(a => a.kind === 'message' || a.kind === 'new_contact').length;
                send({ title: 'Chatter OS', body: msgs ? `${msgs} people messaged you${data.alerts.length > msgs ? `, plus ${data.alerts.length - msgs} other updates` : ''}` : `${data.alerts.length} new updates: leads, bookings or chats that need you` });
              } else {
                data.alerts.forEach(a => send({ title: a.title, body: a.body, tag: a.id }));
              }
            }
          }
        } catch { /* offline or slow: try again next tick */ }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    poll();

    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('click', askOnClick); };
  }, [API_BASE, token, user?._id, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
