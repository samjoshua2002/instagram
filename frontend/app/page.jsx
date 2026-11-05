'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SpotlightHome from './components/SpotlightHome';
import { useApp } from './context/AppContext';

// Home: Spotify-style people feed. The analytics dashboard lives at /analytics.
// A superadmin outside any workspace has no people, so they land on the Platform Console.
export default function HomePage() {
  const { user, isImpersonating } = useApp();
  const router = useRouter();
  const isPureSuperadmin = user?.role === 'superadmin' && !isImpersonating;

  useEffect(() => {
    if (isPureSuperadmin) router.replace('/analytics');
  }, [isPureSuperadmin, router]);

  if (isPureSuperadmin) return null;
  return <SpotlightHome />;
}
