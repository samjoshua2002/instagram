'use client';

import { Compass, Home, ArrowLeft } from 'lucide-react';
import StatusScreen from './components/StatusScreen';

export default function NotFound() {
  return (
    <StatusScreen
      icon={Compass}
      code="404"
      title="Page not found"
      message="We can't find the page you're looking for. It may have moved, or the link is wrong."
      actions={[
        { label: 'Go home', href: '/', icon: Home },
        { label: 'Go back', variant: 'ghost', icon: ArrowLeft, onClick: () => (window.history.length > 1 ? window.history.back() : (window.location.href = '/')) },
      ]}
    />
  );
}
