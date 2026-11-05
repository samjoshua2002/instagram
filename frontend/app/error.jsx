'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import StatusScreen from './components/StatusScreen';

/** Shown when a page crashes. The sidebar and the rest of the app keep working. */
export default function PageError({ error, reset }) {
  useEffect(() => {
    console.error('Page crashed:', error);
  }, [error]);

  return (
    <StatusScreen
      icon={AlertTriangle}
      title="Something went wrong"
      message="This page hit an unexpected problem. Your data is safe. Try again, or go back home."
      actions={[
        { label: 'Try again', onClick: () => reset(), icon: RefreshCw },
        { label: 'Go home', href: '/', variant: 'ghost', icon: Home },
      ]}
      detail={process.env.NODE_ENV !== 'production' ? String(error?.message || error) : undefined}
    />
  );
}
