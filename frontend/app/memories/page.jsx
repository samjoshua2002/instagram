'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import RelationshipsPage from '../relationships/page';

export default function MemoriesPage() {
  const router = useRouter();

  useEffect(() => {
    // Seamless redirect to unified people directory table
    router.replace('/relationships');
  }, [router]);

  return <RelationshipsPage />;
}
