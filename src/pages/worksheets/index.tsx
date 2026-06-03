import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPublishedWorksheetsByClass,
  getAllProgressForStudent,
  getStudentClassId,
  getClassrooms,
  Classroom,
} from "@/lib/firestore";
import { Worksheet, StudentWorksheetProgress } from "@/types/Worksheet";

export default function WorksheetBrowsePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, StudentWorksheetProgress>>({});
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

    const [ws, allProgress] = await Promise.all([
      getPublishedWorksheetsByClass(cid),
      getAllProgressForStudent(user.id),
    ]);

    const pMap: Record<string, StudentWorksheetProgress> = {};
    allProgress.forEach((p) => { pMap[p.worksheetId] = p; });
    setProgressMap(pMap);

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

  const getStatus = (ws: Worksheet) => {
    const progress = progressMap[ws.id];
    if (!progress || progress.completedTaskCount === 0) return "not_started";
    if (progress.completedTaskCount >= ws.tasks.length) return "completed";
    return "in_progress";
  };

  const getCoinsInfo = (ws: Worksheet) => {
    const progress = progressMap[ws.id];
    const totalPossible = ws.tasks.reduce((s, t) => s + t.coins, 0);
    const earned = progress?.totalCoinsAwarded || 0;
    return { earned, total: totalPossible };
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
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary-dim)] p-4 text-center">
        <div>
          <p className="text-lg mb-2">尚未加入班級</p>
          <p className="text-sm">請聯絡老師將你加入班級</p>
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

              return (
                <button
                  key={ws.id}
                  onClick={() => router.push(`/worksheets/${ws.id}`)}
                  className="w-full text-left border border-[var(--terminal-primary-dim)] p-4 hover:border-[var(--terminal-primary)] transition-colors block"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-lg ${
                          status === "completed" ? "" :
                          status === "in_progress" ? "" : ""
                        }`}>
                          {status === "completed" ? "✅" :
                           status === "in_progress" ? "🟡" : "⬜"}
                        </span>
                        <span className="text-xs text-[var(--terminal-primary-dim)]">
                          W{String(ws.week).padStart(2, "0")}
                        </span>
                      </div>
                      <h2 className="font-bold truncate">{ws.title}</h2>
                      <div className="text-xs text-[var(--terminal-primary-dim)] mt-1">
                        {ws.tasks.length} 個任務
                        {status === "in_progress" && ` · ${completedCount}/${ws.tasks.length} 完成`}
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
                  {ws.tasks.length > 0 && (
                    <div className="mt-3 h-1.5 bg-[var(--terminal-primary-dim)]/20 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          status === "completed"
                            ? "bg-green-500"
                            : status === "in_progress"
                            ? "bg-yellow-500"
                            : "bg-transparent"
                        }`}
                        style={{
                          width: `${(completedCount / ws.tasks.length) * 100}%`,
                        }}
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
