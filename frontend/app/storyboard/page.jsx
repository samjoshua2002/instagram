'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageSkeleton from '../components/Skeletons';

/** /storyboard opens the business storyboard. */
export default function StoryboardIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/storyboard/business');
  }, [router]);
  return <PageSkeleton variant="cards" label="Opening storyboard" />;
}
