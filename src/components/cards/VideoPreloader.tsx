// Hidden component that triggers browser-side preloading of video URLs.
// Renders <video preload="auto"> elements offscreen — browser will start
// downloading immediately, so when the same URL is later played in a visible
// <video>, it streams from cache with zero delay.
import React, { useEffect, useRef } from 'react';

interface VideoPreloaderProps {
  urls: (string | undefined)[];
}

export default function VideoPreloader({ urls }: VideoPreloaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unique = Array.from(new Set(urls.filter((u): u is string => !!u)));
    for (const url of unique) {
      if (loadedRef.current.has(url)) continue;
      loadedRef.current.add(url);
      // Hidden video element forces browser to start fetching
      const v = document.createElement('video');
      v.src = url;
      v.preload = 'auto';
      v.muted = true;
      v.playsInline = true;
      v.style.display = 'none';
      v.crossOrigin = 'anonymous';
      // Trigger load
      v.load();
      containerRef.current?.appendChild(v);
    }
  }, [urls]);

  return <div ref={containerRef} aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />;
}
