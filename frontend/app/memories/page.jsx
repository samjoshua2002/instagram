'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import RelationshipsPage from '../relationships/page';

export default function MemoriesPage() {
  const router = useRouter();

  useEffect(() => {
    // Seamless redirect to unified people directory table
    // Keep ?person=… so deep links still open that person
    router.replace(`/relationships${typeof window !== 'undefined' ? window.location.search : ''}`);
  }, [router]);

  return <RelationshipsPage />;
}
