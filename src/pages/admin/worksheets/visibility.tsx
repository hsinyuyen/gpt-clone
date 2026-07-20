import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getWorksheets,
  getClassrooms,
  getSeriesVisibility,
  saveSeriesVisibility,
  Classroom,
  SeriesVisibility,
} from "@/lib/firestore";
import { Worksheet } from "@/types/Worksheet";

const ADMIN_USERNAMES = ["admin", "teacher", "老師"];

// 系列（學期）排序：P1 最前，接著 S1…S6，其他放最後
const SERIES_RANK: Record<string, number> = { P1: 0, P2: 0.5, S1: 1, S2: 2, S3: 3, S4: 4, S5: 5, S6: 6 };
const seriesRank = (s: string) => (s in SERIES_RANK ? SERIES_RANK[s] : 99);

// 舊資料的逐份可見班級（種初值 / 顯示用）
const visIds = (w: Worksheet): string[] =>
  w.classIds && w.classIds.length > 0 ? w.classIds : w.classId ? [w.classId] : [];

export default function WorksheetVisibilityPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [config, setConfig] = useState<SeriesVisibility>({}); // 系列 → 開放班級（單一真相）
  const [loading, setLoading] = useState(true);
  // 待儲存的變更：key = `${semester}|${classId}` → 目標是否開放
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const isAdmin = user && ADMIN_USERNAMES.includes(user.username.toLowerCase());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ws, cls, vis] = await Promise.all([getWorksheets(), getClassrooms(), getSeriesVisibility()]);
    setWorksheets(ws);
    setClassrooms(cls.sort((a, b) => a.name.localeCompare(b.name)));

    // 首次沒有設定 → 從「現有已發布學習單的班級」推算並種一份，保留目前的可見現況
    let cfg = vis;
    if (!vis || Object.keys(vis).length === 0) {
      const seeded: SeriesVisibility = {};
      ws.forEach((w) => {
        if (!w.isPublished) return;
        const set = new Set(seeded[w.semester] || []);
        visIds(w).forEach((id) => set.add(id));
        seeded[w.semester] = Array.from(set);
      });
      if (Object.keys(seeded).length > 0) {
        try {
          await saveSeriesVisibility(seeded);
          cfg = seeded;
        } catch {
          cfg = seeded; // 種入失敗也先用推算值顯示
        }
      }
    }
    setConfig(cfg);
    setChanges({});
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
      return;
    }
    if (user && isAdmin) loadData();
  }, [user, isLoading, isAdmin, router, loadData]);

  // 系列 → 該系列的所有學習單（供顯示份數/展開明細）
  const perSeries = useMemo(() => {
    const m: Record<string, Worksheet[]> = {};
    worksheets.forEach((w) => {
      (m[w.semester] = m[w.semester] || []).push(w);
    });
    Object.values(m).forEach((arr) => arr.sort((a, b) => a.week - b.week));
    return m;
  }, [worksheets]);

  const seriesList = useMemo(
    () => Object.keys(perSeries).sort((a, b) => seriesRank(a) - seriesRank(b) || a.localeCompare(b)),
    [perSeries]
  );

  const baseOpen = useCallback((sem: string, cid: string) => (config[sem] || []).includes(cid), [config]);
  const effOpen = useCallback(
    (sem: string, cid: string) => {
      const k = `${sem}|${cid}`;
      return k in changes ? changes[k] : baseOpen(sem, cid);
    },
    [changes, baseOpen]
  );

  const toggleCell = (sem: string, cid: string) => {
    const target = !effOpen(sem, cid);
    const k = `${sem}|${cid}`;
    setChanges((prev) => {
      const next = { ...prev };
      if (target === baseOpen(sem, cid)) delete next[k];
      else next[k] = target;
      return next;
    });
    setSavedMsg("");
  };

  const pendingKeys = Object.keys(changes);

  const handleSave = async () => {
    if (pendingKeys.length === 0) return;
    const next: SeriesVisibility = {};
    seriesList.forEach((sem) => {
      next[sem] = [...(config[sem] || [])];
    });
    for (const [k, open] of Object.entries(changes)) {
      const [sem, cid] = k.split("|");
      const set = new Set(next[sem] || []);
      if (open) set.add(cid);
      else set.delete(cid);
      next[sem] = Array.from(set);
    }
    setSaving(true);
    try {
      await saveSeriesVisibility(next);
      setConfig(next);
      setChanges({});
      setSavedMsg("已儲存：更新了系列開放設定（同系列之後新出的學習單一發布就會自動套用）");
    } catch (e: any) {
      alert(`儲存失敗：${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (semester: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(semester)) next.delete(semester);
      else next.add(semester);
      return next;
    });

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary)]">
        載入中...
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-red-400">
        無權限存取
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4">
          <button
            onClick={() => router.push("/admin/worksheets")}
            className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] mb-2 block"
          >
            ← 返回學習單管理
          </button>
          <h1 className="text-xl font-bold">班級 × 系列 開放設定</h1>
          <p className="text-sm text-[var(--terminal-primary-dim)] mt-1">
            設定「哪些班級可以看到哪個系列（學期）」。開放後，
            <span className="text-cyan-400">該系列之後新出的學習單，一發布就自動對這班可見，不用再逐份指派</span>。
            <br />
            <span className="text-yellow-500">（是否發布〔草稿／發布〕仍維持逐份設定。）</span>
          </p>
        </div>

        {/* 圖例 */}
        <div className="flex flex-wrap gap-3 text-xs mb-4">
          <span className="px-2 py-1 border border-green-600 text-green-400">✓ 全開＝這班看得到整個系列</span>
          <span className="px-2 py-1 border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)]">✕ 未開＝這班看不到</span>
          <span className="px-2 py-1 border border-cyan-500 text-cyan-300">外框亮起＝有未儲存變更</span>
        </div>

        {seriesList.length === 0 || classrooms.length === 0 ? (
          <div className="text-center py-12 text-[var(--terminal-primary-dim)]">
            {classrooms.length === 0 ? "尚無班級，請先到班級管理建立班級" : "尚無學習單"}
          </div>
        ) : (
          <div className="overflow-x-auto border border-[var(--terminal-primary-dim)]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--terminal-primary-dim)] bg-[var(--terminal-primary)]/5">
                  <th className="text-left p-3 sticky left-0 bg-[var(--terminal-bg)] z-10 min-w-[180px]">系列（學期）</th>
                  {classrooms.map((c) => (
                    <th key={c.id} className="p-3 text-center min-w-[120px] whitespace-nowrap">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seriesList.map((sem) => {
                  const arr = perSeries[sem];
                  const publishedCount = arr.filter((w) => w.isPublished).length;
                  const isOpen = expanded.has(sem);
                  return (
                    <React.Fragment key={sem}>
                      <tr className="border-b border-[var(--terminal-primary-dim)]/30 hover:bg-[var(--terminal-primary)]/5">
                        <td className="p-3 sticky left-0 bg-[var(--terminal-bg)] z-10">
                          <button onClick={() => toggleExpand(sem)} className="flex items-center gap-2 text-left">
                            <span className="text-[var(--terminal-primary-dim)]">{isOpen ? "▾" : "▸"}</span>
                            <span className="font-bold">{sem} 系列</span>
                          </button>
                          <div className="text-xs text-[var(--terminal-primary-dim)] mt-0.5 pl-5">
                            {arr.length} 份 · {publishedCount} 已發布
                            {publishedCount < arr.length && (
                              <span className="text-yellow-500">（{arr.length - publishedCount} 草稿）</span>
                            )}
                          </div>
                        </td>
                        {classrooms.map((c) => {
                          const k = `${sem}|${c.id}`;
                          const open = effOpen(sem, c.id);
                          const pending = k in changes;
                          const color = open
                            ? "border-green-600 text-green-400 bg-green-900/20"
                            : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)]";
                          return (
                            <td key={c.id} className="p-2 text-center">
                              <button
                                onClick={() => toggleCell(sem, c.id)}
                                title={pending ? "有未儲存變更（點擊切換 全開/未開）" : "點擊切換 全開/未開"}
                                className={`w-full px-2 py-2 border text-xs font-bold transition-colors hover:brightness-125 ${color} ${
                                  pending ? "ring-2 ring-cyan-400" : ""
                                }`}
                              >
                                {open ? "✓ 全開" : "✕ 未開"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                      {isOpen && (
                        <tr className="bg-black/20">
                          <td colSpan={1 + classrooms.length} className="px-4 py-2">
                            <div className="text-xs text-[var(--terminal-primary-dim)] space-y-1">
                              {arr.map((w) => (
                                <div key={w.id} className="flex items-center gap-2">
                                  <span className={w.isPublished ? "text-green-500" : "text-yellow-500"}>
                                    {w.isPublished ? "●" : "○"}
                                  </span>
                                  <span>W{String(w.week).padStart(2, "0")}</span>
                                  <span className="text-[var(--terminal-primary)]">{w.title}</span>
                                  {!w.isPublished && <span className="text-yellow-500">（草稿，未發布）</span>}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {savedMsg && <div className="mt-4 text-sm text-green-400">{savedMsg}</div>}
      </div>

      {/* 儲存列（有變更才出現） */}
      {pendingKeys.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t-2 border-cyan-500 bg-[var(--terminal-bg)] p-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <span className="text-sm text-cyan-300">有 {pendingKeys.length} 項待儲存的開放變更</span>
            <div className="flex gap-2">
              <button
                onClick={() => setChanges({})}
                disabled={saving}
                className="px-4 py-2 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 disabled:opacity-40"
              >
                放棄變更
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm bg-cyan-600 text-black font-bold hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "儲存中..." : "儲存變更"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
