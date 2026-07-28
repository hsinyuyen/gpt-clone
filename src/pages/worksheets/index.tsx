import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPublishedWorksheetsForClass,
  getAllProgressForStudent,
  getStudentClassId,
  getGameProgress,
  getLessonCompletions,
} from "@/lib/firestore";
import { Worksheet, StudentWorksheetProgress } from "@/types/Worksheet";
import {
  LessonCompletionMap,
  lessonKeys,
  isLockedByDerived,
} from "@/types/LessonCompletion";

const S3W01_MVP_URL = "/courses/gamma-mixed-worksheet-demo.html?back=/worksheets";

interface S3W01MvpCardProps {
  onOpen: () => void;
}

function S3W01MvpCard({ onOpen }: S3W01MvpCardProps) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left border-2 border-[var(--terminal-highlight)] bg-[var(--terminal-primary)]/10 p-4 hover:bg-[var(--terminal-primary)]/20 transition-colors block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">◆</span>
            <span className="text-xs text-[var(--terminal-highlight)] font-bold">
              S3W01 MVP TEST
            </span>
            <span className="text-[10px] px-1.5 py-0.5 border border-[var(--terminal-highlight)] text-[var(--terminal-highlight)]">
              本機測試
            </span>
          </div>
          <h2 className="font-bold truncate">S3 W01｜工具選擇與初次使用</h2>
          <div className="text-xs text-[var(--terminal-primary-dim)] mt-1">
            從主頁進入學習單後，再回 Lab Terminal 主頁測試圖片、影片、音樂生成。
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[var(--terminal-highlight)] font-bold text-sm">OPEN</div>
          <div className="text-xs text-[var(--terminal-primary-dim)]">固定入口</div>
        </div>
      </div>
      <div className="mt-3 h-1.5 bg-[var(--terminal-primary-dim)]/20 overflow-hidden">
        <div className="h-full bg-[var(--terminal-highlight)]" style={{ width: "15%" }} />
      </div>
    </button>
  );
}

export default function WorksheetBrowsePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, StudentWorksheetProgress>>({});
  const [gameProgress, setGameProgress] = useState<Record<string, any> | null>(null);
  const [completions, setCompletions] = useState<LessonCompletionMap>({});
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [activeSemester, setActiveSemester] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const cid = await getStudentClassId(user.id);
    setClassId(cid);

    if (!cid) {
      setLoading(false);
      return;
    }

    const [ws, allProgress, gp, comp] = await Promise.all([
      getPublishedWorksheetsForClass(cid),
      getAllProgressForStudent(user.id),
      getGameProgress(user.id),
      getLessonCompletions(user.id),
    ]);

    const pMap: Record<string, StudentWorksheetProgress> = {};
    allProgress.forEach((p) => { pMap[p.worksheetId] = p; });
    setProgressMap(pMap);
    setGameProgress(gp);
    setCompletions(comp);

    const sorted = ws.sort((a, b) => {
      if (a.semester !== b.semester) return a.semester.localeCompare(b.semester);
      return a.week - b.week;
    });
    setWorksheets(sorted);

    const sems = Array.from(new Set(sorted.map((w) => w.semester))).sort();
    setSemesters(sems);
    if (sems.length > 0 && !activeSemester) {
      setActiveSemester(sems[sems.length - 1]);
    }

    setLoading(false);
  }, [user, activeSemester]);

  useEffect(() => {
    if (!isLoading && !user) { router.replace("/login"); return; }
    if (user) loadData();
  }, [user, isLoading, router, loadData]);

  // 遊戲型學習單的進度（讀 gameProgress[gameKey]）
  const gameState = (ws: Worksheet) =>
    ws.externalGameUrl && ws.gameKey && gameProgress ? gameProgress[ws.gameKey] : null;

  const getStatus = (ws: Worksheet) => {
    if (ws.externalGameUrl) {
      const g = gameState(ws);
      if (g?.done) return "completed";
      if (g && ((g.pct || 0) > 0 || (g.coins || 0) > 0)) return "in_progress";
      return "not_started";
    }
    const progress = progressMap[ws.id];
    if (!progress || progress.completedTaskCount === 0) return "not_started";
    if (progress.completedTaskCount >= ws.tasks.length) return "completed";
    return "in_progress";
  };

  // 完成後鎖死：遊戲型不能再玩，一般學習單進去只看得到成果展示
  const isLocked = (ws: Worksheet) => {
    if (ws.externalGameUrl) {
      if (!ws.gameKey) return false;
      return isLockedByDerived(completions, lessonKeys.game(ws.gameKey), !!gameState(ws)?.done);
    }
    const p = progressMap[ws.id];
    const allDone = ws.tasks.length > 0 && (p?.completedTaskCount || 0) >= ws.tasks.length;
    return isLockedByDerived(completions, lessonKeys.worksheet(ws.id), allDone);
  };

  const getCoinsInfo = (ws: Worksheet) => {
    const totalPossible = ws.tasks.reduce((s, t) => s + t.coins, 0);
    if (ws.externalGameUrl) {
      const g = gameState(ws);
      return { earned: g?.coins || 0, total: totalPossible };
    }
    const progress = progressMap[ws.id];
    const earned = progress?.totalCoinsAwarded || 0;
    return { earned, total: totalPossible };
  };

  // 卡片進度條比例（0~1）
  const getRatio = (ws: Worksheet) => {
    if (ws.externalGameUrl) {
      const g = gameState(ws);
      if (!g) return 0;
      if (g.done) return 1;
      if (typeof g.pct === "number") return Math.min(1, g.pct);
      const total = ws.tasks.reduce((s, t) => s + t.coins, 0) || 1;
      return Math.min(1, (g.coins || 0) / total);
    }
    if (ws.tasks.length === 0) return 0;
    const progress = progressMap[ws.id];
    return (progress?.completedTaskCount || 0) / ws.tasks.length;
  };

  const filtered = worksheets.filter(
    (ws) => !activeSemester || ws.semester === activeSemester
  );

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary)]">
        載入中...
      </div>
    );
  }

  if (!classId) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary-dim)] p-4">
        <div className="w-full max-w-2xl text-center">
          <p className="text-lg mb-2">尚未加入班級</p>
          <p className="text-sm">請聯絡老師將你加入班級</p>
          <div className="mt-6 text-left">
            <S3W01MvpCard onOpen={() => { window.location.href = S3W01_MVP_URL; }} />
          </div>
          <button
            onClick={() => router.push("/")}
            className="mt-4 px-4 py-2 border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
          >
            返回首頁
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push("/")}
              className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] mb-2 block"
            >
              ← 返回首頁
            </button>
            <h1 className="text-xl font-bold">我的學習單</h1>
          </div>
          <button
            onClick={() => router.push("/profile/history")}
            className="px-3 py-1.5 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
          >
            學習歷程
          </button>
        </div>

        <div className="mb-4">
          <S3W01MvpCard onOpen={() => { window.location.href = S3W01_MVP_URL; }} />
        </div>

        {/* Semester tabs */}
        {semesters.length > 1 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {semesters.map((sem) => (
              <button
                key={sem}
                onClick={() => setActiveSemester(sem)}
                className={`px-3 py-1.5 text-sm border transition-colors ${
                  activeSemester === sem
                    ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/10 font-bold"
                    : "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
                }`}
              >
                {sem}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--terminal-primary-dim)]">
            目前沒有學習單
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((ws) => {
              const status = getStatus(ws);
              const { earned, total } = getCoinsInfo(ws);
              const progress = progressMap[ws.id];
              const completedCount = progress?.completedTaskCount || 0;
              const isGame = !!ws.externalGameUrl;
              const ratio = getRatio(ws);
              const locked = isLocked(ws);
              // 遊戲型完成後就地鎖死（沒有詳細頁可去）；一般學習單仍可進入，由詳細頁顯示成果展示
              const clickDisabled = locked && isGame;

              return (
                <button
                  key={ws.id}
                  disabled={clickDisabled}
                  onClick={() => {
                    if (clickDisabled) return;
                    if (isGame) window.location.href = ws.externalGameUrl as string;
                    else router.push(`/worksheets/${ws.id}`);
                  }}
                  className={`w-full text-left border p-4 transition-colors block ${
                    locked
                      ? "border-green-700 bg-green-900/10" +
                        (clickDisabled ? " cursor-not-allowed" : " hover:border-green-500")
                      : "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">
                          {status === "completed" ? "✅" :
                           status === "in_progress" ? "🟡" : "⬜"}
                        </span>
                        <span className="text-xs text-[var(--terminal-primary-dim)]">
                          W{String(ws.week).padStart(2, "0")}
                        </span>
                        {isGame && (
                          <span className="text-[10px] px-1.5 py-0.5 border border-[var(--terminal-primary)] text-[var(--terminal-primary)] rounded-sm">
                            🎮 動作闖關
                          </span>
                        )}
                      </div>
                      <h2 className="font-bold truncate">{ws.title}</h2>
                      <div className="text-xs text-[var(--terminal-primary-dim)] mt-1">
                        {isGame ? (
                          locked
                            ? "🔒 已完成 · 不能再玩了"
                            : status === "completed"
                            ? "▶ 已完成"
                            : status === "in_progress"
                            ? "▶ 繼續闖關（自動接續上次進度）"
                            : "▶ 滑鼠大冒險 · 點我開始"
                        ) : locked ? (
                          "🔒 已完成 · 點我看成果"
                        ) : (
                          <>
                            {ws.tasks.length} 個任務
                            {status === "in_progress" && ` · ${completedCount}/${ws.tasks.length} 完成`}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {status === "completed" ? (
                        <div>
                          <div className="text-green-400 font-bold text-sm">全部完成</div>
                          <div className="text-xs text-green-400">+{earned} 金幣</div>
                        </div>
                      ) : status === "in_progress" ? (
                        <div>
                          <div className="text-yellow-400 text-sm">+{earned}/{total}</div>
                          <div className="text-xs text-[var(--terminal-primary-dim)]">金幣</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[var(--terminal-primary-dim)] text-sm">可得 {total}</div>
                          <div className="text-xs text-[var(--terminal-primary-dim)]">金幣</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {(ws.tasks.length > 0 || isGame) && (
                    <div className="mt-3 h-1.5 bg-[var(--terminal-primary-dim)]/20 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          status === "completed"
                            ? "bg-green-500"
                            : status === "in_progress"
                            ? "bg-yellow-500"
                            : "bg-transparent"
                        }`}
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
