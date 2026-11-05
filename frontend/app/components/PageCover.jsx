'use client';

import UnsplashBanner from './UnsplashBanner';
import { useBanner, bannerSrc } from '../lib/banners';
import { useAmbientImage } from './AmbientBackground';

/**
 * Wide Unsplash photo behind the top of a page (same look as a person's profile page).
 * It fades into the page, and the page colours follow the photo.
 * Use the same `seed` as the page's cover square so both show the same photo.
 * `tint={false}` when the page sets the ambient colours itself (People list).
 */
export default function PageCover({ seed, topic = 'abstract', tint = true }) {
  const photo = useBanner(seed, topic);
  useAmbientImage(tint ? bannerSrc(photo, 400) : null);
  return <UnsplashBanner seed={seed} topic={topic} className="page-cover" />;
}
