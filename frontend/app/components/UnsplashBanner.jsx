'use client';

import { useState } from 'react';
import { useBanner, bannerSrc, abstractArt, UTM } from '../lib/banners';

/**
 * A banner filled with an Unsplash photo picked by `seed`.
 * The abstract gradient shows first, so there is never an empty or plain green box.
 * `credit` shows the photographer line Unsplash asks for; turn it off only where the
 * banner sits inside a link (cards), where it moves to the tooltip instead.
 */
export default function UnsplashBanner({
  seed, topic = 'abstract', width = 1600, credit = true, className = '', style, children, as: Tag = 'div',
}) {
  const photo = useBanner(seed, topic);
  const src = bannerSrc(photo, width);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const title = photo && !credit ? `Photo by ${photo.author} on Unsplash` : undefined;

  return (
    <Tag
      className={`ub ${className}`}
      style={{ backgroundImage: abstractArt(seed), ...style }}
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
