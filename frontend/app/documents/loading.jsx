import PageSkeleton from '../components/Skeletons';

// Shown instantly while this page loads (no blank screen)
export default function Loading() {
  return <PageSkeleton variant="cards" label="Loading documents" />;
}
