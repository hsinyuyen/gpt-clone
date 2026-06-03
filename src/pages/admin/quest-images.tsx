// Admin: generate "boss portrait" art for the 11 PvE quest cards using
// Gemini (same /api/generate-card-image route as battle cards) and persist
// the URLs in Firestore (system/questImages).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { PVE_OPPONENTS } from '@/data/cards/pve-opponents';
import { PveOpponent } from '@/types/Card';
import { getQuestImages, saveQuestImages, QuestImageMap } from '@/lib/firestore';
import { storage, ref, uploadString, getDownloadURL } from '@/lib/firebase';
import { compressBlobToDataUrl, fetchBlobWithTimeout } from '@/utils/imageCompression';

const ADMIN_USERNAMES = ['admin', 'teacher', '老師'];

// Build a SUBJECT-ONLY description. The /api/generate-card-image route
// already wraps this in its own card-game style block, so we just describe
// WHO/WHAT to draw, not HOW to draw it (avoids style conflicts).
function getQuestArtPrompt(opp: PveOpponent): string {
  const vibe =
    opp.difficulty === 'easy' ? 'friendly cheerful character, bright colors, kid-friendly mood'
    : opp.difficulty === 'medium' ? 'confident warrior with intense gaze, dramatic colors'
    : opp.difficulty === 'hard' ? 'fearsome boss with powerful aura, dark dramatic palette'
    : 'apocalyptic void lord with terrifying presence, swirling dark energy';

  return `${opp.name} (${opp.description}). Full-body portrait of the character in a heroic battle pose, ${vibe}.`;
}

interface Status {
  status: 'pending' | 'generating' | 'uploading' | 'done' | 'error';
  error?: string;
}

export default function QuestImagesAdmin() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [questImages, setQuestImages] = useState<QuestImageMap>({});
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [stopFlag, setStopFlag] = useState({ stop: false });
  // Style reference image — same pattern as /admin/card-images so quest art
  // matches the battle-card art style 1:1
  const [styleRefBase64, setStyleRefBase64] = useState<string | null>(null);
  const [styleRefMimeType, setStyleRefMimeType] = useState<string>('image/png');
  const [styleRefPreview, setStyleRefPreview] = useState<string | null>(null);

  // CRITICAL: keep a ref of the latest questImages map. Without this, the
  // batch loop captures stale state in closures — each successive save would
  // overwrite earlier ones with an old map, making images "disappear".
  const questImagesRef = useRef<QuestImageMap>({});
  useEffect(() => { questImagesRef.current = questImages; }, [questImages]);

  const isAdmin = user && ADMIN_USERNAMES.includes(user.username.toLowerCase());

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) router.replace('/');
  }, [user, isLoading, isAdmin, router]);

  useEffect(() => {
    getQuestImages().then((m) => {
      setQuestImages(m);
      questImagesRef.current = m;
    });
  }, []);

  const handleStyleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setStyleRefPreview(dataUrl);
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        setStyleRefMimeType(m[1]);
        setStyleRefBase64(m[2]);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearStyleRef = () => {
    setStyleRefBase64(null);
    setStyleRefPreview(null);
    setStyleRefMimeType('image/png');
  };

  const updateStatus = (id: string, s: Partial<Status>) =>
    setStatuses((prev) => ({ ...prev, [id]: { ...prev[id], ...s } as Status }));

  const generateOne = async (opp: PveOpponent): Promise<string | null> => {
    updateStatus(opp.id, { status: 'generating', error: undefined });

    try {
      // Call image gen — pass style reference if uploaded for consistent look
      const res = await fetch('/api/generate-card-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: getQuestArtPrompt(opp),
          cardId: opp.id,
          cardName: opp.name,
          styleReferenceBase64: styleRefBase64 || undefined,
          styleReferenceMimeType: styleRefBase64 ? styleRefMimeType : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.text || 'Gemini failed');
      }

      // Upload to Firebase Storage
      updateStatus(opp.id, { status: 'uploading' });
      const dataUrl = `data:${data.mimeType};base64,${data.image}`;
      const blob = await fetchBlobWithTimeout(dataUrl, 15000);
      const compressed = await compressBlobToDataUrl(blob, { maxSize: 720, quality: 0.85, mimeType: 'image/jpeg' });

      const storageRef = ref(storage, `quest-images/${opp.id}.jpg`);
      await uploadString(storageRef, compressed.dataUrl, 'data_url');
      const url = await getDownloadURL(storageRef);

      // === MERGE with the LATEST map (via ref), not a stale closure ===
      // Otherwise consecutive batch saves would overwrite each other.
      const next = { ...questImagesRef.current, [opp.id]: url };
      await saveQuestImages(next);
      questImagesRef.current = next;
      setQuestImages(next);

      updateStatus(opp.id, { status: 'done' });
      return url;
    } catch (err: any) {
      updateStatus(opp.id, { status: 'error', error: err.message || String(err) });
      return null;
    }
  };

  const runBatch = async (mode: 'all' | 'missing') => {
    setBatchRunning(true);
    stopFlag.stop = false;
    const queue = mode === 'all'
      ? PVE_OPPONENTS
      : PVE_OPPONENTS.filter((o) => !questImages[o.id]);

    for (const opp of queue) {
      if (stopFlag.stop) break;
      await generateOne(opp);
      // small delay between calls to avoid rate-limit
      await new Promise((r) => setTimeout(r, 2000));
    }
    setBatchRunning(false);
  };

  const clearOne = async (opp: PveOpponent) => {
    const next = { ...questImagesRef.current };
    delete next[opp.id];
    await saveQuestImages(next);
    questImagesRef.current = next;
    setQuestImages(next);
    updateStatus(opp.id, { status: 'pending' });
  };

  if (isLoading || !user) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-purple-300">載入中...</div>;
  }

  const doneCount = Object.keys(questImages).length;
  const totalCount = PVE_OPPONENTS.length;

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-purple-300">🎴 任務卡圖生成</h1>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 text-sm border border-gray-600 hover:bg-gray-800"
          >
            ← 返回 Admin
          </button>
        </div>

        <div className="border border-purple-700 bg-purple-900/10 p-3 mb-4 text-xs">
          <p className="font-bold text-purple-300 mb-1">⚠ 操作說明</p>
          <ul className="list-disc ml-5 text-purple-200/80 space-y-0.5">
            <li>使用 Gemini 為 11 個 PvE 任務 BOSS 生成卡圖（每張 ~15 秒）</li>
            <li>產生的圖會壓縮後存進 Firebase Storage，URL 寫到 Firestore</li>
            <li>對戰頁的任務卡會即時套用</li>
            <li>進度：<b>{doneCount} / {totalCount}</b> 張已完成</li>
          </ul>
        </div>

        {/* Style reference uploader — match battle-card art style 1:1 */}
        <div className="border border-cyan-700 bg-cyan-900/10 p-3 mb-4 rounded">
          <div className="text-xs text-cyan-300 font-bold mb-2">
            🎨 風格參考圖（強烈建議）
          </div>
          <p className="text-[11px] text-gray-400 mb-2">
            上傳一張你已經滿意的卡牌圖（例如戰鬥卡或之前生成的卡圖），所有任務卡都會以這張的畫風為基準生成，確保視覺一致。
          </p>
          <div className="flex items-center gap-3">
            {styleRefPreview ? (
              <div className="relative">
                <img src={styleRefPreview} alt="style ref" className="w-20 h-20 rounded object-cover border-2 border-cyan-500" />
                <button
                  onClick={clearStyleRef}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full text-[10px]"
                  title="移除"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded border-2 border-dashed border-gray-600 flex items-center justify-center text-3xl text-gray-600">
                +
              </div>
            )}
            <label className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleStyleRefUpload}
                className="hidden"
              />
              <span className="inline-block px-3 py-2 text-xs border border-cyan-500 text-cyan-300 rounded cursor-pointer hover:bg-cyan-900/30">
                {styleRefPreview ? '🔄 換一張' : '📁 選擇圖片'}
              </span>
            </label>
          </div>
        </div>

        {/* Batch controls */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => runBatch('missing')}
            disabled={batchRunning}
            className="px-4 py-2 text-sm font-bold border-2 border-cyan-500 text-cyan-300 rounded hover:bg-cyan-500 hover:text-black disabled:opacity-50"
          >
            {batchRunning ? '處理中...' : `🪄 一鍵生成缺少的 (${PVE_OPPONENTS.filter(o => !questImages[o.id]).length} 張)`}
          </button>
          <button
            onClick={() => runBatch('all')}
            disabled={batchRunning}
            className="px-4 py-2 text-sm font-bold border-2 border-orange-500 text-orange-300 rounded hover:bg-orange-500 hover:text-black disabled:opacity-50"
          >
            🔁 全部重新生成（覆蓋）
          </button>
          {batchRunning && (
            <button
              onClick={() => { stopFlag.stop = true; }}
              className="px-4 py-2 text-sm font-bold border-2 border-red-500 text-red-300 rounded hover:bg-red-500 hover:text-white"
            >
              ⏹ 停止
            </button>
          )}
        </div>

        {/* Quest grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PVE_OPPONENTS.map((opp, idx) => {
            const url = questImages[opp.id];
            const s = statuses[opp.id];
            const generating = s?.status === 'generating' || s?.status === 'uploading';
            return (
              <div key={opp.id} className="border-2 border-gray-700 rounded-lg p-3 bg-gray-950">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate text-purple-200">{opp.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">{opp.id}</div>
                  </div>
                </div>

                {/* Image preview */}
                <div className="aspect-[4/3] mb-2 bg-black rounded overflow-hidden border border-gray-800 relative flex items-center justify-center">
                  {url ? (
                    <img src={url} alt={opp.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-5xl">{opp.emoji}</span>
                  )}
                  {generating && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-xs text-purple-300 animate-pulse">
                      🎨 {s?.status === 'uploading' ? '上傳中...' : '生成中...'}
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-1">
                  <button
                    onClick={() => generateOne(opp)}
                    disabled={generating || batchRunning}
                    className={`flex-1 py-1.5 text-[11px] font-bold border rounded transition-colors ${
                      generating || batchRunning
                        ? 'border-gray-700 text-gray-500'
                        : url
                        ? 'border-orange-500 text-orange-300 hover:bg-orange-900/30'
                        : 'border-cyan-500 text-cyan-300 hover:bg-cyan-900/30'
                    }`}
                  >
                    {url ? '🔁 重生' : '🎨 生成'}
                  </button>
                  {url && (
                    <button
                      onClick={() => clearOne(opp)}
                      disabled={batchRunning}
                      className="px-2 py-1.5 text-[11px] border border-red-700 text-red-400 rounded hover:bg-red-900/30"
                    >
                      🗑
                    </button>
                  )}
                </div>

                {s?.status === 'error' && (
                  <div className="mt-1 text-[10px] text-red-400 break-words">✗ {s.error}</div>
                )}
                {s?.status === 'done' && (
                  <div className="mt-1 text-[10px] text-green-400">✓ 完成</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
