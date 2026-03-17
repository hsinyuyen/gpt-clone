import React, { useEffect, useState, useRef } from "react";

interface SpriteAnimatorProps {
  // 獨立幀模式
  frames?: string[];
  // Sprite sheet 模式
  spriteSheetUrl?: string;
  gridCols?: number;
  gridRows?: number;
  // 共用屬性
  frameCount?: number;
  fps?: number;
  width?: number;
  height?: number;
  className?: string;
  playing?: boolean;
}

const SpriteAnimator: React.FC<SpriteAnimatorProps> = ({
  frames,
  spriteSheetUrl,
  frameCount: propFrameCount,
  gridCols = 4,
  gridRows = 2,
  fps = 8,
  width = 128,
  height = 128,
  className = "",
  playing = true,
}) => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const spriteSheetRef = useRef<HTMLImageElement | null>(null);

  // 判斷使用哪種模式
  const useFramesMode = frames && frames.length > 0;
  const frameCount = useFramesMode ? frames.length : (propFrameCount || 8);

  // 載入獨立幀
  useEffect(() => {
    if (!useFramesMode || !frames) return;

    setImagesLoaded(false);
    setLoadError(false);
    imagesRef.current = [];

    let loadedCount = 0;
    const totalFrames = frames.length;

    frames.forEach((src, index) => {
      const img = new Image();
      img.onload = () => {
        imagesRef.current[index] = img;
        loadedCount++;
        if (loadedCount === totalFrames) {
          setImagesLoaded(true);
        }
      };
      img.onerror = () => {
        console.error(`Failed to load frame ${index}`);
        setLoadError(true);
      };
      img.src = src;
    });

    return () => {
      imagesRef.current = [];
    };
  }, [frames, useFramesMode]);

  // 載入 sprite sheet
  useEffect(() => {
    if (useFramesMode || !spriteSheetUrl) return;

    setImagesLoaded(false);
    setLoadError(false);

    const img = new Image();

    img.onload = () => {
      spriteSheetRef.current = img;
      setImageDimensions({ width: img.width, height: img.height });
      setImagesLoaded(true);
    };

    img.onerror = (e) => {
      console.error("Failed to load sprite sheet:", e);
      setLoadError(true);
    };

    img.src = spriteSheetUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [spriteSheetUrl, useFramesMode]);

  // 動畫循環
  useEffect(() => {
    if (!playing || !imagesLoaded) return;

    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % frameCount);
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [playing, imagesLoaded, frameCount, fps]);

  // 繪製當前幀 - 獨立幀模式
  useEffect(() => {
    if (!useFramesMode || !imagesLoaded || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imagesRef.current[currentFrame];
    if (!img) return;

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, width, height);
  }, [currentFrame, imagesLoaded, useFramesMode, width, height]);

  // 繪製當前幀 - Sprite sheet 模式
  useEffect(() => {
    if (useFramesMode || !imagesLoaded || !canvasRef.current || !spriteSheetRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frameWidth = imageDimensions.width / gridCols;
    const frameHeight = imageDimensions.height / gridRows;
    const col = currentFrame % gridCols;
    const row = Math.floor(currentFrame / gridCols);
    const sourceX = col * frameWidth;
    const sourceY = row * frameHeight;

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      spriteSheetRef.current,
      sourceX,
      sourceY,
      frameWidth,
      frameHeight,
      0,
      0,
      width,
      height
    );
  }, [currentFrame, imagesLoaded, imageDimensions, gridCols, gridRows, width, height, useFramesMode]);

  // 錯誤狀態
  if (loadError) {
    return (
      <div
        className={`flex items-center justify-center bg-white text-red-500 ${className}`}
        style={{ width, height }}
      >
        <span className="text-xs text-center">載入失敗</span>
      </div>
    );
  }

  // 載入中狀態
  if (!imagesLoaded) {
    return (
      <div
        className={`flex items-center justify-center bg-white ${className}`}
        style={{ width, height }}
      >
        <span className="text-2xl animate-spin text-gray-400">*</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`bg-white ${className}`}
      style={{
        imageRendering: "pixelated",
        width,
        height,
      }}
    />
  );
};

export default SpriteAnimator;
