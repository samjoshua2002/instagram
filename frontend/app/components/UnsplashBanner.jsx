'use client';

import { useState } from 'react';
import { useMatchedBanner, bannerSrc, abstractArt, toneArt, UTM } from '../lib/banners';
import { usePalette } from './AmbientBackground';

/**
 * A banner filled with an Unsplash photo picked by `seed`.
 * `matchImage` (a contact's photo link): the banner photo follows that photo's main colour,
 * the same colour that tints the page, so the top of the page matches the profile.
 * The abstract gradient shows first, so there is never an empty or plain green box.
 * `credit` shows the photographer line Unsplash asks for; turn it off only where the
 * banner sits inside a link (cards), where it moves to the tooltip instead.
 */
export default function UnsplashBanner({
  seed, topic = 'abstract', width = 1600, credit = true, matchImage = null, className = '', style, children, as: Tag = 'div',
}) {
  const palette = usePalette(matchImage);
  const color = palette ? palette.dominant : null;
  // Wait for the profile photo's colour before choosing, so the wrong photo never flashes in
  const waiting = Boolean(matchImage) && palette === undefined;
  const matched = useMatchedBanner(waiting ? null : seed, color, topic);
  const photo = waiting ? null : matched;
  const src = bannerSrc(photo, width);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const title = photo && !credit ? `Photo by ${photo.author} on Unsplash` : undefined;

  return (
    <Tag
      className={`ub ${className}`}
      style={{ backgroundImage: color ? toneArt(color, seed) : abstractArt(seed), ...style }}
      title={title}
    >
      {src && (
        <img
          key={src}
          className={`ub-img${loadedSrc === src ? ' in' : ''}`}
          src={src}
          alt=""
          decoding="async"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setLoadedSrc(null)}
        />
      )}
      <span className="ub-shade" aria-hidden="true" />
      {children}
      {credit && photo && (
        <span className="ub-credit">
          Photo by <a href={`${photo.authorUrl}?${UTM}`} target="_blank" rel="noopener noreferrer">{photo.author}</a>
          {' '}on <a href={`https://unsplash.com/?${UTM}`} target="_blank" rel="noopener noreferrer">Unsplash</a>
        </span>
      )}
    </Tag>
  );
}
