// Client-side image compression helpers
// Cards are displayed small (max ~400px on battlefield), so we resize + re-encode to WebP

export interface CompressOptions {
  /** max dimension (longest side) — default 300 */
  maxSize?: number;
  /** output mime — default image/webp */
  mimeType?: 'image/webp' | 'image/jpeg' | 'image/png';
  /** quality 0–1 — default 0.82 */
  quality?: number;
}

/**
 * Fetch a remote resource as a Blob with a hard timeout (aborts on expiry).
 */
export async function fetchBlobWithTimeout(url: string, timeoutMs = 15000): Promise<Blob> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: 'cors', signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compress an already-fetched Blob into a smaller data URL. This avoids re-fetching
 * when the caller already has the source bytes in memory.
 */
export async function compressBlobToDataUrl(
  blob: Blob,
  options: CompressOptions = {}
): Promise<{ dataUrl: string; width: number; height: number; approxBytes: number }> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(objectUrl);
    return encodeImage(img, options);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

/**
 * Compress a data URL or remote image URL into a smaller data URL.
 * Draws the image into a canvas at the target size then re-encodes.
 * Handles CORS by trying fetch() → blob → objectURL as a fallback.
 */
export async function compressImageToDataUrl(
  source: string,
  options: CompressOptions = {}
): Promise<{ dataUrl: string; width: number; height: number; approxBytes: number }> {
  const img = await loadImage(source);
  return encodeImage(img, options);
}

function encodeImage(
  img: HTMLImageElement,
  options: CompressOptions = {}
): { dataUrl: string; width: number; height: number; approxBytes: number } {
  const { maxSize = 300, mimeType = 'image/webp', quality = 0.82 } = options;

  // Compute target dimensions preserving aspect ratio
  const { naturalWidth: w, naturalHeight: h } = img;
  let targetW = w;
  let targetH = h;
  const longest = Math.max(w, h);
  if (longest > maxSize) {
    const scale = maxSize / longest;
    targetW = Math.round(w * scale);
    targetH = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d context unavailable');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const dataUrl = canvas.toDataURL(mimeType, quality);
  const approxBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

  return { dataUrl, width: targetW, height: targetH, approxBytes };
}

async function loadImage(source: string): Promise<HTMLImageElement> {
  // If it's a data URL, load directly
  if (source.startsWith('data:')) {
    return loadImageElement(source);
  }

  // For remote URLs, fetch as blob → objectURL to guarantee the canvas is untainted
  // (Firebase Storage now has CORS enabled, but this is more robust.)
  try {
    const res = await fetch(source, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadImageElement(objectUrl);
    } finally {
      // Revoke after the image is loaded — the browser has already rasterized it
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  } catch (err) {
    // Fallback: direct img load (will only work if the server sends proper CORS headers)
    return loadImageElement(source, true);
  }
}

function loadImageElement(src: string, withCrossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (withCrossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Image load failed'));
    img.src = src;
  });
}
