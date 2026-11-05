'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Activity, BarChart3, ChevronRight } from 'lucide-react';
import SpotlightHome, { StatStrip } from './components/SpotlightHome';
import { useApp } from './context/AppContext';
import PageCover from './components/PageCover';
import { useFreshBanner } from './lib/banners';

// Home: a welcome page with a few headline numbers for every user.
// The full analytics dashboard is secondary and lives at /analytics (Settings > Analytics).
export default function HomePage() {
  const { user, isImpersonating } = useApp();
  const isPureSuperadmin = user?.role === 'superadmin' && !isImpersonating;
  return isPureSuperadmin ? <PlatformWelcome /> : <SpotlightHome />;
}

/** Superadmin outside any workspace: greeting, four platform numbers, shortcuts. */
function PlatformWelcome() {
  const { user, token, API_BASE } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const coverPhoto = useFreshBanner('home-cover', 'abstract');

  useEffect(() => {
    const activeToken = token || localStorage.getItem('chatter_jwt_token');
    if (!activeToken) return;
    let alive = true;
    fetch(`${API_BASE}/api/admin/accounts`, { headers: { Authorization: `Bearer ${activeToken}` } })
      .then(r => r.json().then(d => (r.ok ? d : Promise.reject(new Error(d.error || 'Could not load accounts.')))))
      .then(d => alive && setData(d))
      .catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [API_BASE, token]);

  const accounts = data?.accounts || [];
  const firstName = (user?.firstName || user?.username || '').split(' ')[0];
  const shortcuts = [
    { href: '/admin', label: 'User Workspaces', sub: 'Open, ban or make superadmin', icon: Users },
    { href: '/admin/tokens', label: 'Token Health Radar', sub: 'Instagram token status', icon: Activity },
    { href: '/analytics', label: 'Platform Analytics', sub: 'Full dashboard', icon: BarChart3 },
  ];

  return (
    <div className={`sh-home${coverPhoto ? ' sh-tinted' : ''}`}>
      <PageCover seed="home-cover" photo={coverPhoto} />
      <header className="sh-top">
        <h1 className="sh-hello">Hello, {firstName || 'there'}!</h1>
      </header>

      <div className="sh-row-head">
        <h2>At a glance</h2>
        <Link href="/analytics" className="sh-link">Full analytics</Link>
      </div>
      {error ? (
        <div className="sh-empty"><p>{error}</p></div>
      ) : (
        <StatStrip stats={[
          { label: 'Accounts', value: data ? accounts.length : null, href: '/admin' },
          { label: 'Instagram connected', value: data ? accounts.filter(a => a.isInstagramConnected).length : null, href: '/admin/tokens' },
          { label: 'Superadmins', value: data ? accounts.filter(a => a.role === 'superadmin').length : null, href: '/admin' },
          { label: 'People tracked', value: data ? data.totalContacts : null, href: '/analytics' },
        ]} />
      )}

      <div className="sh-row-head"><h2>Shortcuts</h2></div>
      <ul className="sh-list">
        {shortcuts.map(s => (
          <li key={s.href}>
            <Link href={s.href} className="sh-list-item">
              <span className="sh-icon-btn" aria-hidden="true"><s.icon size={18} /></span>
              <span className="sh-list-main">
                <span className="sh-list-name">{s.label}</span>
                <span className="sh-list-sub">{s.sub}</span>
              </span>
              <ChevronRight size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
