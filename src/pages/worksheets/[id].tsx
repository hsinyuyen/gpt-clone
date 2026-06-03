import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import ReactMarkdown from "react-markdown";
import {
  getWorksheet,
  getStudentWorksheetProgress,
  recordWorksheetOpened,
  onStudentProgressChange,
} from "@/lib/firestore";
import { Worksheet, StudentWorksheetProgress } from "@/types/Worksheet";

// Convert any gamma.app URL to the embed format
// e.g. https://gamma.app/docs/S5-W13--nrrfbs7svs8h2el → https://gamma.app/embed/S5-W13--nrrfbs7svs8h2el
function toGammaEmbedUrl(url: string): string {
  if (url.includes("/embed/")) return url;
  // Extract the slug from /docs/SLUG or just use the last path segment
  const match = url.match(/gamma\.app\/(?:docs|public)\/([^/?#]+)/);
  if (match) return `https://gamma.app/embed/${match[1]}`;
  // Fallback: just replace /docs/ with /embed/
  return url.replace(/\/docs\//, "/embed/");
}

export default function WorksheetViewPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [progress, setProgress] = useState<StudentWorksheetProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"styled" | "markdown">("styled");

  const loadData = useCallback(async () => {
    if (!id || typeof id !== "string" || !user) return;
    setLoading(true);

    const ws = await getWorksheet(id);
    if (!ws) { setLoading(false); return; }
    setWorksheet(ws);

    const prog = await getStudentWorksheetProgress(user.id, id);
    setProgress(prog);

    await recordWorksheetOpened(user.id, ws);

    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    if (!isLoading && !user) { router.replace("/login"); return; }
    if (user && id) loadData();
  }, [user, isLoading, id, router, loadData]);

  // Real-time listener for progress changes (teacher awards coins)
  useEffect(() => {
    if (!user || !id || typeof id !== "string") return;
    const prevTasksRef = { current: progress?.tasks || {} };

    const unsub = onStudentProgressChange(user.id, id, (newProgress) => {
      if (!newProgress) return;

      // Check for newly completed tasks → show toast
      const prevTasks = prevTasksRef.current;
      for (const [taskId, taskProg] of Object.entries(newProgress.tasks || {})) {
        if (taskProg.completed && !prevTasks[taskId]?.completed) {
          const ws = worksheet;
          const task = ws?.tasks.find((t) => t.taskId === taskId);
          if (task) {
            setToast(`${task.label} 完成！+${taskProg.coinsAwarded} 金幣`);
            setTimeout(() => setToast(null), 4000);
          }
        }
      }

      prevTasksRef.current = newProgress.tasks || {};
      setProgress(newProgress);
    });

    return unsub;
  }, [user, id, worksheet]);

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary)]">
        載入中...
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

  const completedCount = progress?.completedTaskCount || 0;
  const totalTasks = worksheet.tasks.length;

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)]">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-800 text-green-100 px-4 py-3 border border-green-500 shadow-lg animate-slide-in-right">
          <div className="flex items-center gap-2">
            <span className="text-lg">🪙</span>
            <span className="font-bold">{toast}</span>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto p-4">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/worksheets")}
            className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] mb-2 block"
          >
            ← 返回學習單列表
          </button>
          <h1 className="text-xl font-bold">{worksheet.title}</h1>
          <div className="text-sm text-[var(--terminal-primary-dim)] mt-1">
            {worksheet.semester} W{String(worksheet.week).padStart(2, "0")} ·
            {completedCount}/{totalTasks} 任務完成
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-2 bg-[var(--terminal-primary-dim)]/20 overflow-hidden">
            <div
              className={`h-full transition-all ${
                completedCount >= totalTasks ? "bg-green-500" : "bg-yellow-500"
              }`}
              style={{ width: `${totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Task status cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
          {worksheet.tasks.map((task) => {
            const taskProg = progress?.tasks?.[task.taskId];
            const completed = taskProg?.completed;

            return (
              <div
                key={task.taskId}
                className={`p-3 border text-center ${
                  completed
                    ? "border-green-700 bg-green-900/20"
                    : "border-[var(--terminal-primary-dim)]"
                }`}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className={completed ? "text-green-400" : "text-[var(--terminal-primary-dim)]"}>
                    {completed ? "✓" : "○"}
                  </span>
                  <span className="font-bold text-sm">任務 {task.taskId}</span>
                </div>
                <div className={`text-xs ${completed ? "text-green-400" : "text-[var(--terminal-primary-dim)]"}`}>
                  {completed ? `+${taskProg?.coinsAwarded} 金幣` : `${task.coins} 金幣`}
                </div>
                {task.isOptional && (
                  <div className="text-xs text-blue-400 mt-0.5">選修</div>
                )}
              </div>
            );
          })}
        </div>

        {/* View mode toggle — show when Gamma or styled HTML is available */}
        {(worksheet.gammaUrl || (worksheet.styledHtmlStatus === "ready" && worksheet.styledHtmlUrl)) && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setViewMode("styled")}
              className={`px-3 py-1.5 text-sm border transition-colors ${
                viewMode === "styled"
                  ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/10 font-bold"
                  : "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
              }`}
            >
              {worksheet.gammaUrl ? "Gamma 版本" : "樣式版本"}
            </button>
            <button
              onClick={() => setViewMode("markdown")}
              className={`px-3 py-1.5 text-sm border transition-colors ${
                viewMode === "markdown"
                  ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/10 font-bold"
                  : "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
              }`}
            >
              純文字版本
            </button>
          </div>
        )}

        {/* Gamma iframe view — fullscreen immersive */}
        {viewMode === "styled" && worksheet.gammaUrl && (
          <div className="fixed inset-0 z-40 bg-white flex flex-col">
            {/* Minimal top bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--terminal-bg)] border-b border-[var(--terminal-primary-dim)] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => router.push("/worksheets")}
                  className="text-xs text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] shrink-0"
                >
                  ← 返回
                </button>
                <span className="text-xs text-[var(--terminal-primary)] truncate">
                  {worksheet.title}
                </span>
                <span className="text-xs text-[var(--terminal-primary-dim)] shrink-0">
                  {completedCount}/{totalTasks} 完成
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {worksheet.tasks.map((task) => {
                  const done = progress?.tasks?.[task.taskId]?.completed;
                  return (
                    <span
                      key={task.taskId}
                      className={`text-xs px-1.5 py-0.5 ${
                        done
                          ? "bg-green-900/50 text-green-400 border border-green-700"
                          : "text-[var(--terminal-primary-dim)] border border-[var(--terminal-primary-dim)]/30"
                      }`}
                      title={`${task.label} — ${done ? "已完成" : "未完成"}`}
                    >
                      {done ? "✓" : "○"}{task.taskId}
                    </span>
                  );
                })}
                <button
                  onClick={() => setViewMode("markdown")}
                  className="text-xs text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] ml-2"
                >
                  純文字
                </button>
              </div>
            </div>
            {/* Gamma iframe — fills remaining space */}
            <iframe
              src={toGammaEmbedUrl(worksheet.gammaUrl)}
              className="flex-1 w-full"
              title={worksheet.title}
              allow="fullscreen"
            />
          </div>
        )}

        {/* Styled HTML view (fallback when no Gamma URL) */}
        {viewMode === "styled" && !worksheet.gammaUrl && worksheet.styledHtmlStatus === "ready" && worksheet.styledHtmlUrl && (
          <div className="border border-[var(--terminal-primary-dim)] mb-6 bg-white rounded overflow-hidden">
            <iframe
              srcDoc={decodeURIComponent(worksheet.styledHtmlUrl.replace("data:text/html;charset=utf-8,", ""))}
              className="w-full bg-white"
              style={{ minHeight: "80vh" }}
              title={worksheet.title}
              sandbox="allow-same-origin"
              onLoad={(e) => {
                const iframe = e.target as HTMLIFrameElement;
                if (iframe.contentDocument) {
                  iframe.style.height = iframe.contentDocument.body.scrollHeight + 40 + "px";
                }
              }}
            />
          </div>
        )}

        {/* Markdown content (fallback or explicit toggle) */}
        {(viewMode === "markdown" || (!worksheet.gammaUrl && worksheet.styledHtmlStatus !== "ready")) && (
        <div className="worksheet-markdown border border-[var(--terminal-primary-dim)] p-6">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold mb-4 text-[var(--terminal-primary)]">{children}</h1>
              ),
              h2: ({ children }) => {
                const text = String(children);
                const taskMatch = text.match(/任務\s*([A-Z])/);
                const taskId = taskMatch?.[1];
                const taskProg = taskId ? progress?.tasks?.[taskId] : null;

                return (
                  <h2 className="text-xl font-bold mt-8 mb-3 text-[var(--terminal-primary)] flex items-center gap-2">
                    {taskProg?.completed && (
                      <span className="text-green-400 text-base bg-green-900/30 px-1.5 py-0.5 border border-green-700">
                        ✓ 已完成
                      </span>
                    )}
                    {children}
                  </h2>
                );
              },
              h3: ({ children }) => {
                const text = String(children);
                const taskMatch = text.match(/任務\s*([A-Z])/);
                const taskId = taskMatch?.[1];
                const taskProg = taskId ? progress?.tasks?.[taskId] : null;

                return (
                  <h3 className="text-lg font-bold mt-6 mb-2 text-[var(--terminal-primary)] flex items-center gap-2">
                    {taskProg?.completed && (
                      <span className="text-green-400 text-sm bg-green-900/30 px-1.5 py-0.5 border border-green-700">
                        ✓
                      </span>
                    )}
                    {children}
                  </h3>
                );
              },
              p: ({ children }) => (
                <p className="mb-3 leading-relaxed text-[var(--terminal-primary)]/90">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-3 space-y-1 text-[var(--terminal-primary)]/90">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside mb-3 space-y-1 text-[var(--terminal-primary)]/90">{children}</ol>
              ),
              code: ({ children, className }) => {
                const isBlock = className?.includes("language-");
                if (isBlock) {
                  return (
                    <code className="block bg-[var(--terminal-primary)]/5 border border-[var(--terminal-primary-dim)]/30 p-3 mb-3 text-sm overflow-x-auto">
                      {children}
                    </code>
                  );
                }
                return (
                  <code className="bg-[var(--terminal-primary)]/10 px-1.5 py-0.5 text-sm">
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => (
                <pre className="mb-3">{children}</pre>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-[var(--terminal-primary-dim)] pl-4 mb-3 text-[var(--terminal-primary-dim)]">
                  {children}
                </blockquote>
              ),
              strong: ({ children }) => (
                <strong className="font-bold text-[var(--terminal-primary)]">{children}</strong>
              ),
            }}
          >
            {worksheet.markdownContent}
          </ReactMarkdown>
        </div>
        )}

        {/* Bottom summary */}
        <div className="mt-6 mb-12 p-4 border border-[var(--terminal-primary-dim)] text-center">
          <div className="text-lg font-bold mb-1">
            {completedCount >= totalTasks
              ? "🎉 全部任務完成！"
              : `${completedCount}/${totalTasks} 任務完成`}
          </div>
          <div className="text-sm text-[var(--terminal-primary-dim)]">
            已獲得 {progress?.totalCoinsAwarded || 0} /{" "}
            {worksheet.tasks.reduce((s, t) => s + t.coins, 0)} 金幣
          </div>
        </div>
      </div>
    </div>
  );
}
