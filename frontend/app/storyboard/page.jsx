'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { currentMode } from '../lib/workspaceFeatures';

/** /storyboard opens the board that fits the current mode. */
export default function StoryboardIndex() {
  const router = useRouter();
  const { user, workspaceFeatures } = useApp();
  const mode = currentMode(workspaceFeatures, user);
  useEffect(() => {
    router.replace(mode === 'business' ? '/storyboard/business' : '/storyboard/personal');
  }, [mode, router]);
  return null;
}
