// Admin page - Batch generate card images using Gemini API
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { ALL_CARDS } from '@/data/cards/pools';
import { getCardImages, saveCardImages, CardImageMap } from '@/lib/firestore';
import { storage, ref, uploadString, getDownloadURL } from '@/lib/firebase';
import { CardDefinition } from '@/types/Card';
import { getRarityColor, getRarityLabel } from '@/utils/cardStats';
import { compressImageToDataUrl, compressBlobToDataUrl, fetchBlobWithTimeout } from '@/utils/imageCompression';
import ImageCropModal from '@/components/cards/ImageCropModal';

const ADMIN_USERNAMES = ['admin', 'teacher', '老師'];

// Generate art prompt for a card
function getArtPrompt(card: CardDefinition): string {
  const elementColors: Record<string, string> = {
    fire: 'warm reds, oranges, and yellows, flame effects',
    water: 'cool blues, cyans, and aqua, water splash effects',
    earth: 'greens, browns, and gold, nature/crystal effects',
    wind: 'whites, light greens, and silver, wind/feather effects',
    electric: 'bright yellows, electric blues, lightning effects',
    neutral: 'grays, whites, and soft purples, neutral energy',
  };

  const rarityStyle: Record<string, string> = {
    common: 'simple design, clean look',
    rare: 'detailed design, slight glow effect',
    epic: 'elaborate design, strong glow aura, impressive pose',
    legendary: 'extremely detailed, powerful golden aura, majestic pose, epic scale',
  };

  const setTheme = card.setId === 'hightech-city'
    ? 'cyberpunk futuristic setting, neon lights, high-tech machinery, circuit patterns'
    : '';

  return `${card.name} (${card.nameEn || card.name}). ${card.description} Element: ${card.element} with ${elementColors[card.element] || elementColors.neutral}. ${rarityStyle[card.rarity] || rarityStyle.common}. ${setTheme}`.trim();
}

interface CardStatus {
  cardId: string;
  status: 'pending' | 'generating' | 'uploading' | 'done' | 'error';
  error?: string;
  imageUrl?: string;
}

export default function CardImagesAdmin() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [cardImages, setCardImages] = useState<CardImageMap>({});
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [batchMode, setBatchMode] = useState<'all' | 'missing'>('missing');
  const [delayMs, setDelayMs] = useState(3000);
  const [styleRefBase64, setStyleRefBase64] = useState<string | null>(null);
  const [styleRefMimeType, setStyleRefMimeType] = useState<string>('image/png');
  const [styleRefPreview, setStyleRefPreview] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<CardDefinition | null>(null);
  const stopRef = useState({ stopped: false })[0];

  const isAdmin = user && ADMIN_USERNAMES.includes(user.username.toLowerCase());

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      router.replace('/');
    }
  }, [user, isLoading, isAdmin, router]);

  // Load existing card images
  useEffect(() => {
    getCardImages().then((images) => {
      setCardImages(images);
    });
  }, []);

  const cardsToProcess = batchMode === 'all'
    ? ALL_CARDS
    : ALL_CARDS.filter((c) => !cardImages[c.id]);

  const totalCards = ALL_CARDS.length;
  const doneCards = Object.keys(cardImages).length;

  const updateStatus = (cardId: string, update: Partial<CardStatus>) => {
    setStatuses((prev) => ({
      ...prev,
      [cardId]: { ...prev[cardId], cardId, ...update } as CardStatus,
    }));
  };

  // Handle style reference image upload
  const handleStyleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setStyleRefPreview(dataUrl);
      // Extract base64 and mime type
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        setStyleRefMimeType(match[1]);
        setStyleRefBase64(match[2]);
      }
    };
    reader.readAsDataURL(file);
  };

  const generateSingleCard = useCallback(async (card: CardDefinition): Promise<string | null> => {
    const prompt = getArtPrompt(card);

    updateStatus(card.id, { status: 'generating' });

    try {
      // Call Gemini API with optional style reference
      const requestBody: any = {
        prompt,
        cardId: card.id,
        cardName: card.name,
      };

      if (styleRefBase64) {
        requestBody.styleReferenceBase64 = styleRefBase64;
        requestBody.styleReferenceMimeType = styleRefMimeType;
      }

      const response = await fetch('/api/generate-card-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.details || 'API error');
      }

      updateStatus(card.id, { status: 'uploading' });

      // Compress the image (Gemini usually returns 1024x1024 PNG ~1 MB) → 512x512 WebP ~50 KB
      const rawDataUrl = `data:${data.mimeType};base64,${data.image}`;
      const { dataUrl: compressedDataUrl } = await compressImageToDataUrl(rawDataUrl, {
        maxSize: 300,
        mimeType: 'image/webp',
        quality: 0.82,
      });

      // Upload to Firebase Storage (use .webp extension)
      const storagePath = `card-images/${card.id}.webp`;
      const storageRef = ref(storage, storagePath);
      await uploadString(storageRef, compressedDataUrl, 'data_url');
      const downloadUrl = await getDownloadURL(storageRef);

      updateStatus(card.id, { status: 'done', imageUrl: downloadUrl });
      return downloadUrl;
    } catch (error: any) {
      console.error(`Error generating image for ${card.name}:`, error);
      updateStatus(card.id, { status: 'error', error: error.message || 'Unknown error' });
      return null;
    }
  }, []);

  const handleBatchGenerate = async () => {
    setIsRunning(true);
    stopRef.stopped = false;
    const updatedImages = { ...cardImages };

    for (let i = 0; i < cardsToProcess.length; i++) {
      if (stopRef.stopped) break;

      const card = cardsToProcess[i];
      setCurrentIndex(i);

      const url = await generateSingleCard(card);
      if (url) {
        updatedImages[card.id] = url;
        await saveCardImages(updatedImages);
        setCardImages({ ...updatedImages });
      }

      if (i < cardsToProcess.length - 1 && !stopRef.stopped) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    setIsRunning(false);
  };

  const handleSingleGenerate = async (card: CardDefinition) => {
    const url = await generateSingleCard(card);
    if (url) {
      const updated = { ...cardImages, [card.id]: url };
      await saveCardImages(updated);
      setCardImages(updated);
    }
  };

  const handleStop = () => {
    stopRef.stopped = true;
    setIsRunning(false);
  };

  // Save cropped image back to Firebase Storage (overwrites existing).
  // The crop modal gives us a 512×512 PNG; we re-encode as 300px WebP to keep it tiny.
  const handleSaveCrop = async (card: CardDefinition, dataUrl: string) => {
    const { dataUrl: compressedDataUrl } = await compressImageToDataUrl(dataUrl, {
      maxSize: 300,
      mimeType: 'image/webp',
      quality: 0.82,
    });
    const storagePath = `card-images/${card.id}.webp`;
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, compressedDataUrl, 'data_url');
    const downloadUrl = await getDownloadURL(storageRef);
    // Append cache-busting param so <img> tags refresh immediately
    const bustedUrl = `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const updated = { ...cardImages, [card.id]: bustedUrl };
    await saveCardImages(updated);
    setCardImages(updated);
  };

  // Batch recompress ALL existing images — downloads each one, reencodes to WebP, reuploads
  const [isRecompressing, setIsRecompressing] = useState(false);
  const [recompressProgress, setRecompressProgress] = useState({
    done: 0,
    total: 0,
    saved: 0,
    skipped: 0,
    failed: 0,
    currentCardId: '',
  });
  const recompressStopRef = useState({ stopped: false })[0];

  const handleStopRecompress = () => {
    recompressStopRef.stopped = true;
  };

  const handleRecompressAll = async () => {
    const entries = Object.entries(cardImages);
    if (entries.length === 0) {
      alert('沒有可以壓縮的圖片');
      return;
    }
    if (!confirm(`將重新壓縮 ${entries.length} 張已上傳的圖片為 WebP (300×300),覆寫原檔。確定?`)) {
      return;
    }

    recompressStopRef.stopped = false;
    setIsRecompressing(true);
    setRecompressProgress({ done: 0, total: entries.length, saved: 0, skipped: 0, failed: 0, currentCardId: '' });
    const updated = { ...cardImages };
    let bytesSaved = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < entries.length; i++) {
      if (recompressStopRef.stopped) break;

      const [cardId, currentUrl] = entries[i];
      setRecompressProgress((p) => ({ ...p, currentCardId: cardId }));

      try {
        // Single fetch with 15s timeout
        const origBlob = await fetchBlobWithTimeout(currentUrl, 15000);
        const origSize = origBlob.size;

        // Compress directly from the blob (no second network round-trip)
        const { dataUrl: compressedDataUrl, approxBytes } = await compressBlobToDataUrl(origBlob, {
          maxSize: 300,
          mimeType: 'image/webp',
          quality: 0.82,
        });

        // Skip if new file would be bigger (already small)
        if (approxBytes >= origSize * 0.95) {
          skipped++;
          setRecompressProgress({ done: i + 1, total: entries.length, saved: bytesSaved, skipped, failed, currentCardId: cardId });
          continue;
        }

        const storagePath = `card-images/${cardId}.webp`;
        const storageRef = ref(storage, storagePath);
        await uploadString(storageRef, compressedDataUrl, 'data_url');
        const newUrl = await getDownloadURL(storageRef);
        const busted = `${newUrl}${newUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
        updated[cardId] = busted;
        bytesSaved += origSize - approxBytes;

        // Save to Firestore progressively so a mid-run crash doesn't lose work
        await saveCardImages(updated);
        setCardImages({ ...updated });
      } catch (err) {
        failed++;
        console.error(`Recompress failed for ${cardId}:`, err);
      }
      setRecompressProgress({ done: i + 1, total: entries.length, saved: bytesSaved, skipped, failed, currentCardId: cardId });
    }

    setIsRecompressing(false);
    const stopped = recompressStopRef.stopped;
    alert(
      `${stopped ? '已停止' : '完成'}!\n` +
      `節省 ${(bytesSaved / 1024 / 1024).toFixed(2)} MB\n` +
      `跳過 ${skipped} 張 (已經夠小)\n` +
      `失敗 ${failed} 張`
    );
  };

  if (isLoading || !user || !isAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: 'var(--terminal-color)' }}>載入中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin')}
              className="text-sm hover:underline"
              style={{ color: 'var(--terminal-color)' }}
            >
              {"<-"} 返回管理
            </button>
            <h1 className="text-xl font-bold" style={{ color: 'var(--terminal-color)' }}>
              🎨 卡片圖片生成器
            </h1>
          </div>
          <div className="text-sm text-gray-400">
            已生成: {doneCards}/{totalCards}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="w-full bg-gray-800 rounded h-4">
            <div
              className="h-4 rounded transition-all duration-300"
              style={{
                width: `${(doneCards / totalCards) * 100}%`,
                backgroundColor: 'var(--terminal-color)',
              }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1 text-right">
            {Math.round((doneCards / totalCards) * 100)}% 完成
          </div>
        </div>

        {/* Style Reference */}
        <div className="mb-6 p-4 border border-purple-700 rounded-lg bg-purple-900/10">
          <h3 className="text-sm font-bold text-purple-400 mb-3">🎨 風格參考圖片</h3>
          <div className="flex items-start gap-4">
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={handleStyleRefUpload}
                className="text-xs text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border file:border-purple-500 file:text-purple-400 file:bg-transparent file:text-xs file:cursor-pointer hover:file:bg-purple-900/30"
                disabled={isRunning}
              />
              <p className="text-xs text-gray-500 mt-2">
                {styleRefBase64
                  ? '✓ 已載入風格參考圖片 — 所有生成的卡片會模仿此風格'
                  : '上傳一張圖片作為風格參考，Gemini 會模仿該風格生成卡片'}
              </p>
              {styleRefBase64 && (
                <button
                  onClick={() => {
                    setStyleRefBase64(null);
                    setStyleRefPreview(null);
                  }}
                  className="text-xs text-red-400 mt-1 hover:underline"
                  disabled={isRunning}
                >
                  移除參考圖片
                </button>
              )}
            </div>
            {styleRefPreview && (
              <img
                src={styleRefPreview}
                alt="Style reference"
                className="w-24 h-24 object-cover rounded border border-purple-500"
              />
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-6 p-4 border border-gray-700 rounded-lg">
          <select
            value={batchMode}
            onChange={(e) => setBatchMode(e.target.value as 'all' | 'missing')}
            className="bg-black border border-gray-600 rounded px-3 py-1 text-sm"
            style={{ color: 'var(--terminal-color)' }}
            disabled={isRunning}
          >
            <option value="missing">只生成缺少圖片的卡牌 ({cardsToProcess.length} 張)</option>
            <option value="all">重新生成全部 ({ALL_CARDS.length} 張)</option>
          </select>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">間隔 (ms):</label>
            <input
              type="number"
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              className="bg-black border border-gray-600 rounded px-2 py-1 text-sm w-20"
              style={{ color: 'var(--terminal-color)' }}
              min={1000}
              max={30000}
              step={500}
              disabled={isRunning}
            />
          </div>

          {!isRunning ? (
            <button
              onClick={handleBatchGenerate}
              disabled={cardsToProcess.length === 0}
              className="px-4 py-1 border-2 rounded font-bold text-sm transition-colors hover:bg-[var(--terminal-color)] hover:text-black disabled:opacity-50"
              style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
            >
              🚀 開始批次生成 ({cardsToProcess.length} 張)
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-4 py-1 border-2 border-red-500 text-red-400 rounded font-bold text-sm hover:bg-red-900/30"
            >
              ⏹ 停止
            </button>
          )}

          {isRunning && (
            <span className="text-sm text-yellow-400 animate-pulse self-center">
              生成中... ({currentIndex + 1}/{cardsToProcess.length})
            </span>
          )}

          <div className="w-full" />

          {!isRecompressing ? (
            <button
              onClick={handleRecompressAll}
              disabled={isRunning || doneCards === 0}
              className="px-4 py-1 border-2 border-cyan-500 text-cyan-400 rounded font-bold text-sm hover:bg-cyan-900/30 disabled:opacity-40"
              title="把所有已上傳的圖片重新壓縮為 WebP 300x300"
            >
              🗜️ 重新壓縮全部 ({doneCards} 張)
            </button>
          ) : (
            <button
              onClick={handleStopRecompress}
              className="px-4 py-1 border-2 border-red-500 text-red-400 rounded font-bold text-sm hover:bg-red-900/30"
            >
              ⏹ 停止壓縮
            </button>
          )}
          {isRecompressing && (
            <div className="flex flex-col text-xs self-center">
              <span className="text-cyan-300 animate-pulse">
                壓縮中 {recompressProgress.done}/{recompressProgress.total} · {recompressProgress.currentCardId}
              </span>
              <span className="text-gray-400">
                節省 {(recompressProgress.saved / 1024 / 1024).toFixed(2)} MB · 跳過 {recompressProgress.skipped} · 失敗 {recompressProgress.failed}
              </span>
            </div>
          )}
        </div>

        {/* Card list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_CARDS.map((card) => {
            const status = statuses[card.id];
            const hasImage = !!cardImages[card.id];
            const rarityColor = getRarityColor(card.rarity);

            return (
              <div
                key={card.id}
                className={`p-3 border rounded-lg flex items-center gap-3 ${
                  hasImage ? 'border-green-800 bg-green-900/10' : 'border-gray-700 bg-black/50'
                }`}
              >
                {/* Card image or emoji */}
                <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center rounded bg-gray-800 overflow-hidden">
                  {cardImages[card.id] ? (
                    <img
                      src={cardImages[card.id]}
                      alt={card.name}
                      className="w-16 h-16 object-cover"
                    />
                  ) : (
                    <span className="text-3xl">{card.emoji}</span>
                  )}
                </div>

                {/* Card info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold truncate" style={{ color: 'var(--terminal-color)' }}>
                      {card.name}
                    </span>
                    <span className={`text-xs ${rarityColor}`}>{getRarityLabel(card.rarity)}</span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{card.id}</div>

                  {/* Status */}
                  {status?.status === 'generating' && (
                    <span className="text-xs text-yellow-400 animate-pulse">生成中...</span>
                  )}
                  {status?.status === 'uploading' && (
                    <span className="text-xs text-blue-400 animate-pulse">上傳中...</span>
                  )}
                  {status?.status === 'done' && (
                    <span className="text-xs text-green-400">✓ 完成</span>
                  )}
                  {status?.status === 'error' && (
                    <span className="text-xs text-red-400" title={status.error}>✗ {status.error?.slice(0, 30)}</span>
                  )}
                  {!status && hasImage && (
                    <span className="text-xs text-green-600">已有圖片</span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-1">
                  {hasImage && (
                    <button
                      onClick={() => setCropTarget(card)}
                      disabled={isRunning}
                      className="px-2 py-1 text-xs border border-gray-600 rounded hover:border-yellow-400 transition-colors disabled:opacity-30"
                      style={{ color: '#facc15' }}
                      title="放大 / 裁切此圖片"
                    >
                      🔍
                    </button>
                  )}
                  <button
                    onClick={() => handleSingleGenerate(card)}
                    disabled={isRunning || status?.status === 'generating' || status?.status === 'uploading'}
                    className="px-2 py-1 text-xs border border-gray-600 rounded hover:border-[var(--terminal-color)] transition-colors disabled:opacity-30"
                    style={{ color: 'var(--terminal-color)' }}
                    title="單獨生成此卡片"
                  >
                    🔄
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Crop / zoom modal */}
      {cropTarget && cardImages[cropTarget.id] && (
        <ImageCropModal
          cardId={cropTarget.id}
          cardName={cropTarget.name}
          sourceUrl={cardImages[cropTarget.id]}
          onSave={(dataUrl) => handleSaveCrop(cropTarget, dataUrl)}
          onClose={() => setCropTarget(null)}
        />
      )}
    </div>
  );
}
