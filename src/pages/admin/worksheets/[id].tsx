import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getWorksheet,
  getClassroom,
  Classroom,
  getAllStudentProgressForWorksheet,
  approveTask,
  revokeTask,
  getAuditLogs,
  getUser,
} from "@/lib/firestore";
import { Worksheet, StudentWorksheetProgress, AuditLogEntry } from "@/types/Worksheet";
import { User } from "@/types/User";

const ADMIN_USERNAMES = ["admin", "teacher", "老師"];

interface StudentRow {
  user: User;
  progress: StudentWorksheetProgress | null;
}

export default function ProgressPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingOps, setPendingOps] = useState<Set<string>>(new Set());
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const isAdmin = user && ADMIN_USERNAMES.includes(user.username.toLowerCase());
  const teacherName = user?.displayName || user?.username || "";

  const loadData = useCallback(async () => {
    if (!id || typeof id !== "string") return;
    setLoading(true);

    const ws = await getWorksheet(id);
    if (!ws) { setLoading(false); return; }
    setWorksheet(ws);

    const cls = await getClassroom(ws.classId);
    setClassroom(cls);

    if (cls && cls.studentIds.length > 0) {
      const [progressMap, users] = await Promise.all([
        getAllStudentProgressForWorksheet(cls.studentIds, ws.id),
        Promise.all(cls.studentIds.map((sid) => getUser(sid))),
      ]);

      const rows: StudentRow[] = users
        .filter((u): u is User => u !== null)
        .map((u) => ({
          user: u,
          progress: progressMap[u.id] || null,
        }))
        .sort((a, b) =>
          (a.user.displayName || a.user.username).localeCompare(
            b.user.displayName || b.user.username
          )
        );

      setStudents(rows);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!isLoading && !user) { router.replace("/login"); return; }
    if (user && isAdmin && id) loadData();
  }, [user, isLoading, isAdmin, id, router, loadData]);

  const cellKey = (studentId: string, taskId: string) => `${studentId}:${taskId}`;

  const isCompleted = (row: StudentRow, taskId: string) =>
    row.progress?.tasks?.[taskId]?.completed === true;

  const handleToggle = async (studentId: string, studentName: string, taskId: string) => {
    if (!worksheet || !user) return;
    const key = cellKey(studentId, taskId);
    if (pendingOps.has(key)) return;

    const row = students.find((s) => s.user.id === studentId);
    const wasCompleted = row && isCompleted(row, taskId);

    // Optimistic update
    setStudents((prev) =>
      prev.map((s) => {
        if (s.user.id !== studentId) return s;
        const existingTasks = s.progress?.tasks || {};
        const newTasks = {
          ...existingTasks,
          [taskId]: wasCompleted
            ? { completed: false, completedAt: null, approvedBy: null, approverName: null, coinsAwarded: 0 }
            : {
                completed: true,
                completedAt: new Date().toISOString(),
                approvedBy: user.id,
                approverName: teacherName,
                coinsAwarded: worksheet.tasks.find((t) => t.taskId === taskId)?.coins || 0,
              },
        };
        const completedCount = Object.values(newTasks).filter((t: any) => t.completed).length;
        const totalCoins = Object.values(newTasks).reduce(
          (sum: number, t: any) => sum + (t.completed ? t.coinsAwarded : 0), 0
        );
        return {
          ...s,
          progress: {
            studentId,
            worksheetId: worksheet.id,
            semester: worksheet.semester,
            week: worksheet.week,
            classId: worksheet.classId,
            firstOpenedAt: s.progress?.firstOpenedAt || null,
            tasks: newTasks,
            totalCoinsAwarded: totalCoins,
            completedTaskCount: completedCount,
            lastUpdatedAt: new Date().toISOString(),
          },
        };
      })
    );

    setPendingOps((prev) => new Set(prev).add(key));

    try {
      if (wasCompleted) {
        await revokeTask({
          studentId, studentName, worksheetId: worksheet.id, taskId,
          teacherId: user.id, teacherName,
        });
      } else {
        await approveTask({
          studentId, studentName, worksheetId: worksheet.id, taskId,
          teacherId: user.id, teacherName,
        });
      }
    } catch (err: any) {
      console.error("Toggle failed:", err);
      alert(err.message || "操作失敗");
      await loadData();
    } finally {
      setPendingOps((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllForTask = (taskId: string) => {
    const allKeys = students.map((s) => cellKey(s.user.id, taskId));
    const incompleteKeys = allKeys.filter((key) => {
      const [sid] = key.split(":");
      const row = students.find((s) => s.user.id === sid);
      return row && !isCompleted(row, taskId);
    });

    if (incompleteKeys.length === 0) return;

    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = incompleteKeys.every((k) => next.has(k));
      if (allSelected) {
        incompleteKeys.forEach((k) => next.delete(k));
      } else {
        incompleteKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const handleBatchApprove = async () => {
    if (!worksheet || !user || selected.size === 0) return;
    const ops = Array.from(selected).map((key) => {
      const [studentId, taskId] = key.split(":");
      const row = students.find((s) => s.user.id === studentId);
      if (!row || isCompleted(row, taskId)) return null;
      return { studentId, studentName: row.user.displayName || row.user.username, taskId };
    }).filter(Boolean) as { studentId: string; studentName: string; taskId: string }[];

    if (ops.length === 0) { setSelected(new Set()); return; }

    for (const op of ops) {
      try {
        await approveTask({
          ...op,
          worksheetId: worksheet.id,
          teacherId: user.id,
          teacherName,
        });
      } catch (err) {
        console.error("Batch approve error:", err);
      }
    }

    setSelected(new Set());
    await loadData();
  };

  const loadAuditLog = async () => {
    if (!worksheet) return;
    setAuditLoading(true);
    const logs = await getAuditLogs({ worksheetId: worksheet.id });
    setAuditLogs(logs);
    setAuditLoading(false);
    setShowAuditLog(true);
  };

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

  if (!worksheet) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary-dim)]">
        學習單不存在
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push("/admin/worksheets")}
              className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] mb-2 block"
            >
              ← 返回學習單列表
            </button>
            <h1 className="text-xl font-bold">{worksheet.title}</h1>
            <div className="text-sm text-[var(--terminal-primary-dim)] mt-1">
              {worksheet.semester} W{String(worksheet.week).padStart(2, "0")} ·
              {classroom?.name || worksheet.classId} ·
              {worksheet.tasks.length} 個任務
            </div>
          </div>
          <button
            onClick={loadAuditLog}
            className="px-4 py-2 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
          >
            操作紀錄
          </button>
        </div>

        {/* Progress Matrix */}
        {students.length === 0 ? (
          <div className="text-center py-12 text-[var(--terminal-primary-dim)]">
            此班級尚無學生
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-[var(--terminal-primary)]">
                  <th className="text-left p-3 whitespace-nowrap min-w-[120px]">
                    學生姓名
                  </th>
                  {worksheet.tasks.map((task) => (
                    <th
                      key={task.taskId}
                      className="p-3 text-center whitespace-nowrap cursor-pointer hover:bg-[var(--terminal-primary)]/5"
                      onClick={() => selectAllForTask(task.taskId)}
                    >
                      <div>
                        {task.isOptional && <span className="text-yellow-400">★</span>}
                        任務 {task.taskId}
                      </div>
                      <div className="text-xs text-[var(--terminal-primary-dim)] font-normal">
                        {task.coins} 金幣
                      </div>
                      <div className="text-xs text-[var(--terminal-primary-dim)] font-normal">
                        {students.filter((s) => isCompleted(s, task.taskId)).length}/{students.length}
                      </div>
                    </th>
                  ))}
                  <th className="p-3 text-center whitespace-nowrap">
                    本週金幣
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => {
                  const totalCoins = row.progress?.totalCoinsAwarded || 0;
                  const completedCount = row.progress?.completedTaskCount || 0;
                  const requiredTasks = worksheet.tasks.filter((t) => !t.isOptional);
                  const allRequiredDone = requiredTasks.every((t) =>
                    isCompleted(row, t.taskId)
                  );

                  return (
                    <tr
                      key={row.user.id}
                      className="border-b border-[var(--terminal-primary-dim)]/30 hover:bg-[var(--terminal-primary)]/5"
                    >
                      <td className="p-3 whitespace-nowrap">
                        <button
                          onClick={() => router.push(`/admin/students/${row.user.id}`)}
                          className="hover:text-[var(--terminal-accent)] underline underline-offset-2 decoration-[var(--terminal-primary-dim)]"
                          title="查看學習歷程"
                        >
                          {row.user.displayName || row.user.username}
                        </button>
                      </td>
                      {worksheet.tasks.map((task) => {
                        const completed = isCompleted(row, task.taskId);
                        const key = cellKey(row.user.id, task.taskId);
                        const isPending = pendingOps.has(key);
                        const isSelected = selected.has(key);

                        return (
                          <td key={task.taskId} className="p-3 text-center">
                            <button
                              onClick={() => {
                                if (selected.size > 0 && !completed) {
                                  toggleSelect(key);
                                } else {
                                  handleToggle(
                                    row.user.id,
                                    row.user.displayName || row.user.username,
                                    task.taskId
                                  );
                                }
                              }}
                              disabled={isPending}
                              className={`w-8 h-8 border-2 inline-flex items-center justify-center transition-all ${
                                isPending
                                  ? "opacity-50 animate-pulse border-[var(--terminal-primary-dim)]"
                                  : completed
                                  ? "border-green-500 bg-green-900/30 text-green-400"
                                  : isSelected
                                  ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/20"
                                  : "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
                              }`}
                            >
                              {completed ? "✓" : isSelected ? "○" : ""}
                            </button>
                            {completed && (
                              <div className="text-xs text-green-400 mt-0.5">
                                +{row.progress?.tasks?.[task.taskId]?.coinsAwarded || task.coins}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className="font-bold">{totalCoins} 金幣</span>
                        {allRequiredDone && (
                          <span className="ml-1 text-green-400" title="主線任務全部完成">
                            ✦
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Batch Approve Bar */}
        {selected.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-[var(--terminal-bg)] border-t-2 border-[var(--terminal-primary)] p-4 flex items-center justify-between z-40">
            <span>已選擇 {selected.size} 個待核准項目</span>
            <div className="flex gap-3">
              <button
                onClick={() => setSelected(new Set())}
                className="px-4 py-2 border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
              >
                取消選擇
              </button>
              <button
                onClick={handleBatchApprove}
                className="px-4 py-2 bg-green-700 text-white font-bold hover:bg-green-600"
              >
                批次核准 ({selected.size})
              </button>
            </div>
          </div>
        )}

        {/* Audit Log Drawer */}
        {showAuditLog && (
          <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
            <div className="w-full max-w-md bg-[var(--terminal-bg)] border-l-2 border-[var(--terminal-primary)] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-[var(--terminal-primary-dim)]">
                <h2 className="font-bold">操作紀錄</h2>
                <button
                  onClick={() => setShowAuditLog(false)}
                  className="text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)]"
                >
                  ✕
                </button>
              </div>

              {auditLoading ? (
                <div className="p-4 text-center text-[var(--terminal-primary-dim)]">載入中...</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-4 text-center text-[var(--terminal-primary-dim)]">尚無操作紀錄</div>
              ) : (
                <div className="divide-y divide-[var(--terminal-primary-dim)]/20">
                  {auditLogs.map((log, i) => (
                    <div key={i} className="p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 ${
                          log.action === "award_coins"
                            ? "bg-green-900/50 text-green-400"
                            : "bg-red-900/50 text-red-400"
                        }`}>
                          {log.action === "award_coins" ? "+加分" : "−撤銷"}
                        </span>
                        <span className="text-[var(--terminal-primary-dim)]">
                          {new Date(log.timestamp).toLocaleString("zh-TW")}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold">{log.teacherName}</span>
                        {" → "}
                        <span>{log.studentName}</span>
                        {" · "}
                        <span>{log.taskLabel}</span>
                        {" · "}
                        <span className={log.coins > 0 ? "text-green-400" : "text-red-400"}>
                          {log.coins > 0 ? "+" : ""}{log.coins} 金幣
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
