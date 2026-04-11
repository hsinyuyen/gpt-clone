// Canvas-based image crop/zoom modal
// Lets admin zoom/pan an existing card image to crop out white borders, then save
import { useEffect, useRef, useState, useCallback } from 'react';

interface ImageCropModalProps {
  cardId: string;
  cardName: string;
  sourceUrl: string;
  /** Called with a base64 data URL of the cropped image when the user clicks save */
  onSave: (dataUrl: string) => Promise<void> | void;
  onClose: () => void;
}

const CANVAS_SIZE = 300;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

export default function ImageCropModal({
  cardId,
  cardName,
  sourceUrl,
  onSave,
  onClose,
}: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const [isSaving, setIsSaving] = useState(false);

  // Load image as blob URL so the canvas is not CORS-tainted
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await fetch(sourceUrl, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          imgRef.current = img;
          setLoaded(true);
          setZoom(1);
          setOffset({ x: 0, y: 0 });
        };
        img.onerror = () => {
          if (!cancelled) setLoadError('圖片載入失敗');
        };
        img.src = objectUrl;
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || '無法取得圖片 (CORS?)');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceUrl]);

  // Redraw canvas whenever zoom/offset change
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const baseScale = Math.max(
      CANVAS_SIZE / img.naturalWidth,
      CANVAS_SIZE / img.naturalHeight
    );
    const scale = baseScale * zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const dx = (CANVAS_SIZE - drawW) / 2 + offset.x;
    const dy = (CANVAS_SIZE - drawH) / 2 + offset.y;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, drawW, drawH);
  }, [zoom, offset]);

  useEffect(() => {
    if (loaded) draw();
  }, [loaded, draw]);

  // Mouse drag to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleFactor = CANVAS_SIZE / rect.width;
    const dx = (e.clientX - dragStart.current.x) * scaleFactor;
    const dy = (e.clientY - dragStart.current.y) * scaleFactor;
    setOffset({
      x: dragStart.current.offsetX + dx,
      y: dragStart.current.offsetY + dy,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Wheel to zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsSaving(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      await onSave(dataUrl);
      onClose();
    } catch (err: any) {
      alert(`儲存失敗: ${err?.message || 'unknown'}`);
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border-2 rounded-lg p-5 max-w-2xl w-full"
        style={{ borderColor: 'var(--terminal-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--terminal-color)' }}>
              🔍 裁切圖片
            </h2>
            <div className="text-xs text-gray-400 mt-1">
              {cardName} <span className="text-gray-600">({cardId})</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
            disabled={isSaving}
          >
            ×
          </button>
        </div>

        {/* Canvas preview */}
        <div className="flex justify-center mb-3">
          <div
            className="relative border border-gray-700 rounded overflow-hidden"
            style={{ width: 'min(100%, 420px)', aspectRatio: '1 / 1' }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="w-full h-full block"
              style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            />
            {!loaded && !loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <span className="text-sm text-gray-400 animate-pulse">載入圖片中...</span>
              </div>
            )}
            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                <span className="text-sm text-red-400 text-center">
                  {loadError}
                  <br />
                  <span className="text-xs text-gray-500 mt-2 block">
                    請確認 Firebase Storage 已設定 CORS
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Zoom slider */}
        <div className="mb-4 px-2">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>縮放</span>
            <span style={{ color: 'var(--terminal-color)' }}>{zoom.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-yellow-400"
            disabled={!loaded}
          />
          <div className="text-xs text-gray-500 mt-2 text-center">
            拖曳畫面可平移 · 滾輪可縮放
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleReset}
            disabled={!loaded || isSaving}
            className="px-3 py-1 text-xs border border-gray-600 text-gray-300 rounded hover:border-gray-400 disabled:opacity-40"
          >
            重設
          </button>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-3 py-1 text-xs border border-gray-600 text-gray-300 rounded hover:border-gray-400 disabled:opacity-40"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!loaded || isSaving}
            className="px-4 py-1 text-xs border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black disabled:opacity-40"
            style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
          >
            {isSaving ? '儲存中...' : '💾 儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
