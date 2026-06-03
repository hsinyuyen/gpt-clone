import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getUser,
  getAuditLogs,
  getAllProgressForStudent,
  getCoinState,
  CoinState,
} from "@/lib/firestore";
import { User } from "@/types/User";
import { AuditLogEntry, StudentWorksheetProgress } from "@/types/Worksheet";

const ADMIN_USERNAMES = ["admin", "teacher", "老師"];

export default function StudentHistoryPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const [student, setStudent] = useState<User | null>(null);
  const [coinState, setCoinState] = useState<CoinState | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [allProgress, setAllProgress] = useState<StudentWorksheetProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [activeSemester, setActiveSemester] = useState<string | null>(null);

  const isAdmin = user && ADMIN_USERNAMES.includes(user.username.toLowerCase());

  const loadData = useCallback(async () => {
    if (!id || typeof id !== "string") return;
    setLoading(true);

    const [studentData, coins, auditLogs, progress] = await Promise.all([
      getUser(id),
      getCoinState(id),
      getAuditLogs({ studentId: id, limitCount: 500 }),
      getAllProgressForStudent(id),
    ]);

    setStudent(studentData);
    setCoinState(coins);

    const awarded = auditLogs.filter((l) => l.action === "award_coins");
    setLogs(awarded);
    setAllProgress(progress);

    const sems = Array.from(new Set(awarded.map((l) => l.semester))).sort();
    setSemesters(sems);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!isLoading && !user) { router.replace("/login"); return; }
    if (user && isAdmin && id) loadData();
  }, [user, isLoading, isAdmin, id, router, loadData]);

  const filtered = activeSemester
    ? logs.filter((l) => l.semester === activeSemester)
    : logs;

  const totalWorksheetCoins = logs.reduce((sum, l) => sum + l.coins, 0);
  const completedTasks = logs.length;
  const worksheetCount = new Set(logs.map((l) => l.worksheetId)).size;

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

  if (!student) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary-dim)]">
        找不到此學生
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] mb-2 block"
          >
            ← 返回
          </button>
          <h1 className="text-xl font-bold">
            {student.displayName || student.username} 的學習歷程
          </h1>
          <div className="text-sm text-[var(--terminal-primary-dim)] mt-1">
            帳號：{student.username}
            {student.studentId && ` · 學號：${student.studentId}`}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="border border-[var(--terminal-primary-dim)] p-3 text-center">
            <div className="text-xl font-bold">{coinState?.balance ?? 0}</div>
            <div className="text-xs text-[var(--terminal-primary-dim)]">目前金幣</div>
          </div>
          <div className="border border-[var(--terminal-primary-dim)] p-3 text-center">
            <div className="text-xl font-bold">{totalWorksheetCoins}</div>
            <div className="text-xs text-[var(--terminal-primary-dim)]">學習單金幣</div>
          </div>
          <div className="border border-[var(--terminal-primary-dim)] p-3 text-center">
            <div className="text-xl font-bold">{completedTasks}</div>
            <div className="text-xs text-[var(--terminal-primary-dim)]">完成任務數</div>
          </div>
          <div className="border border-[var(--terminal-primary-dim)] p-3 text-center">
            <div className="text-xl font-bold">{worksheetCount}</div>
            <div className="text-xs text-[var(--terminal-primary-dim)]">參與學習單</div>
          </div>
        </div>

        {/* Worksheet progress overview */}
        {allProgress.length > 0 && (
          <div className="mb-6">
            <h2 className="font-bold mb-3">學習單進度</h2>
            <div className="space-y-2">
              {allProgress
                .sort((a, b) => {
                  if (a.semester !== b.semester) return b.semester.localeCompare(a.semester);
                  return b.week - a.week;
                })
                .map((p) => (
                  <div
                    key={p.worksheetId}
                    className="flex items-center justify-between border border-[var(--terminal-primary-dim)] p-3 cursor-pointer hover:border-[var(--terminal-primary)]"
                    onClick={() => router.push(`/admin/worksheets/${p.worksheetId}`)}
                  >
                    <div>
                      <span className="text-xs text-[var(--terminal-primary-dim)] mr-2">
                        {p.semester} W{String(p.week).padStart(2, "0")}
                      </span>
                      <span className="text-sm">
                        {p.completedTaskCount} 個任務完成
                      </span>
                    </div>
                    <span className="text-sm font-bold text-green-400">
                      +{p.totalCoinsAwarded} 金幣
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

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
        <h2 className="font-bold mb-3">完成紀錄</h2>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-[var(--terminal-primary-dim)]">
            尚無完成紀錄
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
                      <span className="text-xs font-bold text-[var(--terminal-primary-dim)]">
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
                        {new Date(log.timestamp).toLocaleString("zh-TW")} · 核准者：{log.teacherName}
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
