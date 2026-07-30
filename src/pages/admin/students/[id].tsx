import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getUser,
  getAuditLogs,
  getAllProgressForStudent,
  getCoinState,
  CoinState,
  getLessonCompletions,
  allowLessonRedo,
  revokeLessonRedo,
} from "@/lib/firestore";
import { User } from "@/types/User";
import { AuditLogEntry, StudentWorksheetProgress } from "@/types/Worksheet";
import { LessonCompletionMap, LessonKey, lessonKeys } from "@/types/LessonCompletion";

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
  const [completions, setCompletions] = useState<LessonCompletionMap>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isAdmin = user && ADMIN_USERNAMES.includes(user.username.toLowerCase());

  const loadData = useCallback(async () => {
    if (!id || typeof id !== "string") return;
    setLoading(true);

    const [studentData, coins, auditLogs, progress, comp] = await Promise.all([
      getUser(id),
      getCoinState(id),
      getAuditLogs({ studentId: id, limitCount: 500 }),
      getAllProgressForStudent(id),
      getLessonCompletions(id),
    ]);

    setStudent(studentData);
    setCoinState(coins);
    setCompletions(comp);

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

  // ── 完成即鎖：老師可以針對單一課程開放重做 ──
  const toggleRedo = async (key: LessonKey, currentlyAllowed: boolean) => {
    if (!user || typeof id !== "string") return;
    setBusyKey(key);
    try {
      if (currentlyAllowed) await revokeLessonRedo(id, key);
      else await allowLessonRedo(id, key, user.id, user.displayName || user.username);
      setCompletions((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || { completed: false, completedAt: "" }),
          redoAllowed: !currentlyAllowed,
          redoAllowedByName: currentlyAllowed ? null : user.displayName || user.username,
        },
      }));
    } catch (e) {
      alert("設定失敗，請再試一次");
    }
    setBusyKey(null);
  };

  // 可解鎖的課程清單：學習單（學生有進度的）＋ 繪本四堂 ＋ AI 助理腳本
  const redoRows: { key: LessonKey; label: string }[] = [
    ...allProgress
      .slice()
      .sort((a, b) =>
        a.semester !== b.semester ? b.semester.localeCompare(a.semester) : b.week - a.week
      )
      .map((p) => ({
        key: lessonKeys.worksheet(p.worksheetId),
        label: `學習單 ${p.semester} W${String(p.week).padStart(2, "0")}`,
      })),
    { key: lessonKeys.picturebook("l1"), label: "AI 繪本 第 1 堂 · 認識你的主角" },
    { key: lessonKeys.picturebook("l2"), label: "AI 繪本 第 2 堂 · 你的故事" },
    { key: lessonKeys.picturebook("l3"), label: "AI 繪本 第 3 堂 · 挑出最棒的畫面" },
    { key: lessonKeys.picturebook("l4"), label: "AI 繪本 第 4 堂 · 你的書＋發表" },
    { key: lessonKeys.script("create-avatar"), label: "腳本 · 建立 AI 助理" },
    // ⚠️ 遊戲型課程接了完成鎖定就一定要在這裡有對應入口，否則學生破關即永久鎖死、
    //    老師沒有任何 UI 可放行（Firestore 規則已禁止刪除，救不回來）。
    { key: lessonKeys.game("p1uw04"), label: "P1U W04 · 突破軍團防線" },
    { key: lessonKeys.game("s2w04"), label: "S2 W04 · 阿問偵探社・語氣變身術" },
  ];

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

        {/* 課程重做開放 */}
        <div className="mb-6">
          <h2 className="font-bold mb-1">開放重做</h2>
          <p className="text-xs text-[var(--terminal-primary-dim)] mb-3">
            完成的課程預設鎖定在成果展示。按「開放重做」後，這位學生可以重做該堂課一次；
            他重新完成後會自動鎖回去。
          </p>
          <div className="space-y-2">
            {redoRows.map((row) => {
              const entry = completions[row.key];
              const allowed = !!entry?.redoAllowed;
              const done = !!entry?.completed;
              return (
                <div
                  key={row.key}
                  className={`flex items-center justify-between border p-3 gap-3 ${
                    allowed ? "border-yellow-600 bg-yellow-900/10" : "border-[var(--terminal-primary-dim)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{row.label}</div>
                    <div className="text-xs text-[var(--terminal-primary-dim)]">
                      {allowed
                        ? `已開放重做${entry?.redoAllowedByName ? `（${entry.redoAllowedByName}）` : ""}`
                        : done
                        ? `已完成 · 鎖定中${entry?.completedAt ? ` · ${entry.completedAt.slice(0, 10)}` : ""}`
                        : "尚無完成紀錄"}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleRedo(row.key, allowed)}
                    disabled={busyKey === row.key}
                    className={`shrink-0 px-3 py-1.5 text-xs border transition-colors ${
                      busyKey === row.key
                        ? "opacity-50 cursor-wait border-[var(--terminal-primary-dim)]"
                        : allowed
                        ? "border-yellow-500 text-yellow-400 hover:bg-yellow-500/10"
                        : "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
                    }`}
                  >
                    {busyKey === row.key ? "處理中…" : allowed ? "收回" : "開放重做"}
                  </button>
                </div>
              );
            })}
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
