'use client';

import UnsplashBanner from './UnsplashBanner';
import { useBanner, bannerSrc, abstractColor } from '../lib/banners';
import { useAmbientImage } from './AmbientBackground';

/**
 * Wide Unsplash photo behind the top of a page (same look as a person's profile page).
 * It fades into the page, and the page colours follow the photo.
 * Use the same `seed` as the page's cover square so both show the same photo.
 * `tint={false}` when the page sets the ambient colours itself (People list).
 */
export default function PageCover({ seed, topic = 'abstract', tint = true, photo: chosen }) {
  const given = chosen !== undefined; // `photo`: the page picked it (Home: a new one every open)
  const seeded = useBanner(given ? null : seed, topic);
  const photo = given ? chosen : seeded;
  // Until the photo is read (or if it cannot be), the page takes its artwork colour, never the app green
  useAmbientImage(tint ? bannerSrc(photo, 400) : null, { fallbackColor: tint ? (photo?.color || abstractColor(seed)) : null });
  return <UnsplashBanner seed={seed} topic={topic} photo={given ? chosen : undefined} className="page-cover" />;
}
