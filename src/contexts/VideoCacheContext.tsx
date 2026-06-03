// In-memory video cache. Fetches every known card animation URL via fetch()
// → stores as Blob → exposes a blob: URL. Playing a blob URL is INSTANT
// (it's already in memory, no network round-trip, no progressive streaming).
//
// This solves the lingering attack/draw video lag: <video preload="auto">
// only buffers a few seconds; even with the source cached the browser still
// reads + decodes asynchronously. With a blob URL the entire clip is RAM-resident.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useCardAnimations } from './CardAnimationContext';

interface VideoCacheContextValue {
  /** Returns the blob: URL if cached, else the original URL (which still works). */
  getCachedUrl: (originalUrl: string | undefined) => string | undefined;
  /** True once every known animation URL has been fetched (or failed). */
  isReady: boolean;
  /** { loaded, total } counters for an optional UI indicator. */
  progress: { loaded: number; total: number };
}

const VideoCacheContext = createContext<VideoCacheContextValue>({
  getCachedUrl: (u) => u,
  isReady: false,
  progress: { loaded: 0, total: 0 },
});

export const VideoCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { animations } = useCardAnimations();
  const [cache, setCache] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Collect all unique animation URLs from Firestore
    const urls = new Set<string>();
    for (const anim of Object.values(animations)) {
      if (anim.attackUrl) urls.add(anim.attackUrl);
      if (anim.drawRevealUrl) urls.add(anim.drawRevealUrl);
    }

    const newUrls = Array.from(urls).filter((u) => !fetchedRef.current.has(u));
    if (newUrls.length === 0) return;

    setProgress((p) => ({ loaded: p.loaded, total: p.total + newUrls.length }));

    for (const url of newUrls) {
      fetchedRef.current.add(url);
      // Use no-cors fallback isn't useful here (we need to read the blob).
      // fal.ai CDN should have CORS open. If a particular URL fails CORS,
      // we just fall back to streaming directly from that URL.
      fetch(url, { mode: 'cors', credentials: 'omit' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        })
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          setCache((prev) => ({ ...prev, [url]: blobUrl }));
          setProgress((p) => ({ ...p, loaded: p.loaded + 1 }));
          // Touch console so it's easy to see in DevTools how many videos are cached
          // eslint-disable-next-line no-console
          console.log(`[VideoCache] cached (${(blob.size / 1024).toFixed(0)} KB):`, url);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[VideoCache] fetch failed', url, err);
          setProgress((p) => ({ ...p, loaded: p.loaded + 1 }));
        });
    }
  }, [animations]);

  const getCachedUrl = (originalUrl?: string): string | undefined => {
    if (!originalUrl) return undefined;
    return cache[originalUrl] || originalUrl;
  };

  const isReady = progress.total > 0 && progress.loaded === progress.total;

  return (
    <VideoCacheContext.Provider value={{ getCachedUrl, isReady, progress }}>
      {children}
    </VideoCacheContext.Provider>
  );
};

export const useVideoCache = () => useContext(VideoCacheContext);
