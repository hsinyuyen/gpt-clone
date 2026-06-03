import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { getAllProgressForStudent, getAuditLogs } from "@/lib/firestore";
import { AuditLogEntry } from "@/types/Worksheet";

export default function LearningHistoryPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [activeSemester, setActiveSemester] = useState<string | null>(null);
  const [totalCoins, setTotalCoins] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const auditLogs = await getAuditLogs({ studentId: user.id, limitCount: 500 });
    const awarded = auditLogs.filter((l) => l.action === "award_coins");
    setLogs(awarded);

    const sems = Array.from(new Set(awarded.map((l) => l.semester))).sort();
    setSemesters(sems);
    if (sems.length > 0 && !activeSemester) {
      setActiveSemester(null); // show all by default
    }

    const total = awarded.reduce((sum, l) => sum + l.coins, 0);
    setTotalCoins(total);

    setLoading(false);
  }, [user, activeSemester]);

  useEffect(() => {
    if (!isLoading && !user) { router.replace("/login"); return; }
    if (user) loadData();
  }, [user, isLoading, router, loadData]);

  const filtered = activeSemester
    ? logs.filter((l) => l.semester === activeSemester)
    : logs;

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary)]">
        載入中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push("/worksheets")}
              className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] mb-2 block"
            >
              ← 返回學習單
            </button>
            <h1 className="text-xl font-bold">我的學習歷程</h1>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{totalCoins}</div>
            <div className="text-xs text-[var(--terminal-primary-dim)]">累積金幣 🪙</div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="border border-[var(--terminal-primary-dim)] p-3 text-center">
            <div className="text-xl font-bold">{logs.length}</div>
            <div className="text-xs text-[var(--terminal-primary-dim)]">完成任務數</div>
          </div>
          <div className="border border-[var(--terminal-primary-dim)] p-3 text-center">
            <div className="text-xl font-bold">
              {Array.from(new Set(logs.map((l) => l.worksheetId))).length}
            </div>
            <div className="text-xs text-[var(--terminal-primary-dim)]">參與學習單</div>
          </div>
        </div>

        {/* Semester filter */}
        {semesters.length > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setActiveSemester(null)}
              className={`px-3 py-1.5 text-sm border transition-colors ${
                !activeSemester
                  ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/10 font-bold"
                  : "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
              }`}
            >
              全部
            </button>
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

        {/* Timeline */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--terminal-primary-dim)]">
            尚無學習紀錄
          </div>
        ) : (
          <div className="space-y-0">
            {filtered.map((log, i) => {
              const prevLog = i > 0 ? filtered[i - 1] : null;
              const showWeekHeader =
                !prevLog ||
                prevLog.semester !== log.semester ||
                prevLog.week !== log.week;

              return (
                <React.Fragment key={i}>
                  {showWeekHeader && (
                    <div className="py-2 mt-4 first:mt-0">
                      <span className="text-xs font-bold text-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] pr-2">
                        {log.semester} W{String(log.week).padStart(2, "0")} — {log.worksheetTitle}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 py-2 border-l-2 border-[var(--terminal-primary-dim)]/30 pl-4 ml-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full shrink-0 -ml-[21px]" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm truncate">{log.taskLabel}</span>
                        <span className="text-sm text-green-400 font-bold shrink-0 ml-2">
                          +{log.coins} 金幣
                        </span>
                      </div>
                      <div className="text-xs text-[var(--terminal-primary-dim)]">
                        {new Date(log.timestamp).toLocaleDateString("zh-TW")}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
