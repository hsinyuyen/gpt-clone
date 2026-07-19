import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getWorksheets,
  saveWorksheet,
  deleteWorksheet,
  getClassrooms,
  Classroom,
} from "@/lib/firestore";
import { Worksheet, Task } from "@/types/Worksheet";
import { parseWorksheetMarkdown, extractWorksheetTitle, extractSemesterAndWeek } from "@/utils/worksheetParser";
import { ParsedTask, ParseResult } from "@/types/Worksheet";

const ADMIN_USERNAMES = ["admin", "teacher", "老師"];

export default function WorksheetsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<{ id: string; html: string } | null>(null);
  const [editingGammaId, setEditingGammaId] = useState<string | null>(null);
  const [gammaUrlInput, setGammaUrlInput] = useState("");
  const [editingClassesId, setEditingClassesId] = useState<string | null>(null);
  const [classSel, setClassSel] = useState<string[]>([]);
  const [savingClasses, setSavingClasses] = useState(false);

  const isAdmin = user && ADMIN_USERNAMES.includes(user.username.toLowerCase());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ws, cls] = await Promise.all([getWorksheets(), getClassrooms()]);
    setWorksheets(ws.sort((a, b) => {
      if (a.semester !== b.semester) return b.semester.localeCompare(a.semester);
      return b.week - a.week;
    }));
    setClassrooms(cls.sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) { router.replace("/login"); return; }
    if (user && isAdmin) loadData();
  }, [user, isLoading, isAdmin, router, loadData]);

  const togglePublish = async (ws: Worksheet) => {
    const updated: Worksheet = {
      ...ws,
      isPublished: !ws.isPublished,
      publishedAt: !ws.isPublished ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    await saveWorksheet(updated);
    await loadData();
  };

  const handleDelete = async (ws: Worksheet) => {
    if (!confirm(`確定要刪除「${ws.title}」？此操作無法復原。`)) return;
    await deleteWorksheet(ws.id);
    await loadData();
  };

  const getClassName = (classId: string) =>
    classrooms.find((c) => c.id === classId)?.name || classId;

  // 可看見班級：新資料讀 classIds，舊資料退回單一 classId
  const visibleClassIds = (ws: Worksheet): string[] =>
    ws.classIds && ws.classIds.length > 0 ? ws.classIds : [ws.classId];

  const openClassEditor = (ws: Worksheet) => {
    setEditingClassesId(editingClassesId === ws.id ? null : ws.id);
    setClassSel(visibleClassIds(ws));
  };

  const handleSaveClasses = async (ws: Worksheet) => {
    if (classSel.length === 0) { alert("至少要選一個班級"); return; }
    setSavingClasses(true);
    // 保留原主帶班級為第一個（若仍在勾選中），否則以第一個勾選者為主帶
    const primary = classSel.includes(ws.classId) ? ws.classId : classSel[0];
    const ordered = [primary, ...classSel.filter((c) => c !== primary)];
    await saveWorksheet({ ...ws, classId: primary, classIds: ordered, updatedAt: new Date().toISOString() });
    setSavingClasses(false);
    setEditingClassesId(null);
    await loadData();
  };

  const handleSaveGammaUrl = async (ws: Worksheet) => {
    const url = gammaUrlInput.trim();
    if (url && !url.includes("gamma.app")) {
      alert("請貼上有效的 Gamma 連結（包含 gamma.app）");
      return;
    }
    await saveWorksheet({
      ...ws,
      gammaUrl: url || null,
      updatedAt: new Date().toISOString(),
    });
    setEditingGammaId(null);
    setGammaUrlInput("");
    await loadData();
  };

  const handleGenerate = async (ws: Worksheet) => {
    setGeneratingId(ws.id);
    try {
      await saveWorksheet({ ...ws, styledHtmlStatus: "generating", updatedAt: new Date().toISOString() });

      const res = await fetch("/api/generate-worksheet-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdownContent: ws.markdownContent, title: ws.title }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || "Generation failed");
      }

      const { html } = await res.json();

      await saveWorksheet({
        ...ws,
        styledHtmlUrl: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
        styledHtmlStatus: "ready",
        styledHtmlGeneratedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setPreviewHtml({ id: ws.id, html });
      await loadData();
    } catch (err: any) {
      console.error("Generate failed:", err);
      await saveWorksheet({ ...ws, styledHtmlStatus: "error", updatedAt: new Date().toISOString() });
      alert(`生成失敗：${err.message}`);
      await loadData();
    } finally {
      setGeneratingId(null);
    }
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

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push("/admin")}
              className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] mb-2 block"
            >
              ← 返回後台
            </button>
            <h1 className="text-xl font-bold">學習單管理</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/admin/worksheets/visibility")}
              className="px-4 py-2 border border-cyan-500 text-cyan-400 hover:bg-cyan-900/20 transition-colors"
            >
              🏫 班級 × 系列
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-2 bg-[var(--terminal-primary)] text-[var(--terminal-bg)] font-bold hover:opacity-90 transition-opacity"
            >
              + 新增學習單
            </button>
          </div>
        </div>

        {worksheets.length === 0 ? (
          <div className="text-center py-12 text-[var(--terminal-primary-dim)]">
            尚無學習單，點擊右上角新增
          </div>
        ) : (
          <div className="space-y-3">
            {worksheets.map((ws) => (
              <div
                key={ws.id}
                className="border border-[var(--terminal-primary-dim)] p-4 hover:border-[var(--terminal-primary)] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 ${
                        ws.isPublished
                          ? "bg-green-900/50 text-green-400 border border-green-700"
                          : "bg-yellow-900/50 text-yellow-400 border border-yellow-700"
                      }`}>
                        {ws.isPublished ? "已發布" : "草稿"}
                      </span>
                      <span className="text-xs text-[var(--terminal-primary-dim)]">
                        {ws.semester} W{String(ws.week).padStart(2, "0")}
                      </span>
                      <span className="text-xs text-cyan-400/90" title="可看見的班級">
                        👁 {visibleClassIds(ws).map(getClassName).join("、")}
                      </span>
                    </div>
                    <h2 className="font-bold truncate">{ws.title}</h2>
                    <div className="text-xs text-[var(--terminal-primary-dim)] mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {ws.tasks.length} 個任務 ·{" "}
                        {ws.tasks.reduce((sum, t) => sum + t.coins, 0)} 金幣
                        {ws.tasks.some((t) => t.isOptional) && " · 含選修"}
                      </span>
                      {ws.styledHtmlStatus === "ready" && (
                        <span className="px-1.5 py-0.5 bg-cyan-900/40 text-cyan-400 border border-cyan-700">
                          樣式已生成
                        </span>
                      )}
                      {ws.styledHtmlStatus === "generating" && (
                        <span className="px-1.5 py-0.5 bg-yellow-900/40 text-yellow-400 border border-yellow-700 animate-pulse">
                          生成中
                        </span>
                      )}
                      {ws.styledHtmlStatus === "error" && (
                        <span className="px-1.5 py-0.5 bg-red-900/40 text-red-400 border border-red-700">
                          生成失敗
                        </span>
                      )}
                      {ws.gammaUrl && (
                        <span className="px-1.5 py-0.5 bg-purple-900/40 text-purple-400 border border-purple-700">
                          Gamma 連結
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <button
                      onClick={() => router.push(`/admin/worksheets/${ws.id}`)}
                      className="px-3 py-1.5 text-xs border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
                    >
                      進度矩陣
                    </button>
                    <button
                      onClick={() => openClassEditor(ws)}
                      className={`px-3 py-1.5 text-xs border ${
                        editingClassesId === ws.id
                          ? "border-cyan-500 text-cyan-300 bg-cyan-900/30"
                          : "border-cyan-700 text-cyan-400 hover:bg-cyan-900/20"
                      }`}
                    >
                      可看見班級
                    </button>
                    <button
                      onClick={() => {
                        setEditingGammaId(editingGammaId === ws.id ? null : ws.id);
                        setGammaUrlInput(ws.gammaUrl || "");
                      }}
                      className={`px-3 py-1.5 text-xs border ${
                        ws.gammaUrl
                          ? "border-purple-600 text-purple-400 hover:bg-purple-900/30"
                          : "border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
                      }`}
                    >
                      {ws.gammaUrl ? "編輯 Gamma" : "貼 Gamma 連結"}
                    </button>
                    {ws.styledHtmlStatus === "ready" ? (
                      <button
                        onClick={() => {
                          if (ws.styledHtmlUrl) {
                            const html = decodeURIComponent(ws.styledHtmlUrl.replace("data:text/html;charset=utf-8,", ""));
                            setPreviewHtml({ id: ws.id, html });
                          }
                        }}
                        className="px-3 py-1.5 text-xs border border-blue-600 text-blue-400 hover:bg-blue-900/30"
                      >
                        預覽樣式
                      </button>
                    ) : null}
                    <button
                      onClick={() => handleGenerate(ws)}
                      disabled={generatingId === ws.id}
                      className={`px-3 py-1.5 text-xs border ${
                        generatingId === ws.id
                          ? "border-[var(--terminal-primary-dim)] opacity-50 animate-pulse"
                          : "border-cyan-600 text-cyan-400 hover:bg-cyan-900/30"
                      }`}
                    >
                      {generatingId === ws.id
                        ? "生成中..."
                        : ws.styledHtmlStatus === "ready"
                        ? "重新生成"
                        : "生成樣式"}
                    </button>
                    <button
                      onClick={() => togglePublish(ws)}
                      className={`px-3 py-1.5 text-xs border ${
                        ws.isPublished
                          ? "border-yellow-600 text-yellow-400 hover:bg-yellow-900/30"
                          : "border-green-600 text-green-400 hover:bg-green-900/30"
                      }`}
                    >
                      {ws.isPublished ? "下架" : "發布"}
                    </button>
                    <button
                      onClick={() => handleDelete(ws)}
                      className="px-3 py-1.5 text-xs border border-red-700 text-red-400 hover:bg-red-900/30"
                    >
                      刪除
                    </button>
                  </div>
                </div>
                {/* Inline 可看見班級 editor */}
                {editingClassesId === ws.id && (
                  <div className="mt-3 pt-3 border-t border-[var(--terminal-primary-dim)]/30">
                    <p className="text-xs text-[var(--terminal-primary-dim)] mb-2">
                      勾選可看見這份學習單的班級（可多選）：
                    </p>
                    {classrooms.length === 0 ? (
                      <p className="text-yellow-400 text-sm">尚無班級</p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {classrooms.map((c) => {
                          const checked = classSel.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className={`flex items-center gap-2 px-3 py-2 border cursor-pointer text-sm ${
                                checked
                                  ? "border-cyan-500 bg-cyan-900/20 text-cyan-300"
                                  : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)] hover:border-cyan-600"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setClassSel((prev) =>
                                    prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                                  )
                                }
                                className="accent-cyan-500"
                              />
                              <span className="truncate">{c.name}</span>
                              {checked && (classSel.includes(ws.classId) ? ws.classId : classSel[0]) === c.id && (
                                <span className="ml-auto text-[10px] px-1 bg-cyan-500/20 border border-cyan-700">主帶</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => handleSaveClasses(ws)}
                        disabled={savingClasses || classSel.length === 0}
                        className="px-3 py-1.5 text-xs bg-cyan-600 text-black font-bold hover:opacity-90 disabled:opacity-40"
                      >
                        {savingClasses ? "儲存中..." : "儲存"}
                      </button>
                      <button
                        onClick={() => setEditingClassesId(null)}
                        className="px-3 py-1.5 text-xs border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
                {/* Inline Gamma URL editor */}
                {editingGammaId === ws.id && (
                  <div className="mt-3 pt-3 border-t border-[var(--terminal-primary-dim)]/30">
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={gammaUrlInput}
                        onChange={(e) => setGammaUrlInput(e.target.value)}
                        placeholder="貼上 Gamma 分享連結，例：https://gamma.app/docs/xxxxx"
                        className="flex-1 bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-1.5 text-xs outline-none focus:border-purple-500"
                      />
                      <button
                        onClick={() => handleSaveGammaUrl(ws)}
                        className="px-3 py-1.5 text-xs bg-purple-700 text-white hover:bg-purple-600"
                      >
                        儲存
                      </button>
                      {ws.gammaUrl && (
                        <button
                          onClick={() => { setGammaUrlInput(""); handleSaveGammaUrl({ ...ws, gammaUrl: null } as any); }}
                          className="px-3 py-1.5 text-xs border border-red-700 text-red-400 hover:bg-red-900/30"
                        >
                          移除
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[var(--terminal-primary-dim)] mt-1">
                      在 Gamma 建好學習單後，點右上角「Share」→ 複製連結貼到這裡
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HTML Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="flex items-center justify-between p-3 bg-[var(--terminal-bg)] border-b border-[var(--terminal-primary)]">
            <span className="text-sm text-[var(--terminal-primary)]">樣式版本預覽</span>
            <button
              onClick={() => setPreviewHtml(null)}
              className="px-3 py-1 text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] border border-[var(--terminal-primary-dim)]"
            >
              關閉預覽
            </button>
          </div>
          <iframe
            srcDoc={previewHtml.html}
            className="flex-1 w-full bg-white"
            title="Worksheet Preview"
            sandbox="allow-same-origin"
          />
        </div>
      )}

      {showUpload && (
        <UploadModal
          classrooms={classrooms}
          userId={user!.id}
          userName={user!.displayName || user!.username}
          onClose={() => setShowUpload(false)}
          onSaved={() => { setShowUpload(false); loadData(); }}
        />
      )}
    </div>
  );
}

// ─── Upload Modal ────────────────────────────────────────

function UploadModal({
  classrooms,
  userId,
  userName,
  onClose,
  onSaved,
}: {
  classrooms: Classroom[];
  userId: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [markdown, setMarkdown] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [editedTasks, setEditedTasks] = useState<ParsedTask[]>([]);
  const [title, setTitle] = useState("");
  const [semester, setSemester] = useState("S1");
  const [week, setWeek] = useState(1);
  const [classIds, setClassIds] = useState<string[]>(classrooms[0] ? [classrooms[0].id] : []);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [gammaUrl, setGammaUrl] = useState("");

  const toggleClass = (cid: string) =>
    setClassIds((prev) => (prev.includes(cid) ? prev.filter((c) => c !== cid) : [...prev, cid]));

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".md")) {
      alert("請上傳 .md（Markdown）格式檔案");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setMarkdown(text);
      const result = parseWorksheetMarkdown(text);
      setParseResult(result);
      setEditedTasks(result.tasks.map((t) => ({ ...t })));
      const detectedTitle = extractWorksheetTitle(text);
      setTitle(detectedTitle);
      // Auto-detect semester/week from title or filename (e.g. "S5 W14")
      const detected = extractSemesterAndWeek(`${detectedTitle} ${file.name}`);
      if (detected.semester) setSemester(detected.semester);
      if (detected.week) setWeek(detected.week);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const updateTaskCoins = (idx: number, coins: number) => {
    setEditedTasks((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, coins, coinsMissing: false } : t))
    );
  };

  const hasMissingCoins = editedTasks.some((t) => t.coinsMissing);

  const handleSave = async (publish: boolean) => {
    if (!title.trim() || classIds.length === 0 || editedTasks.length === 0) return;
    if (hasMissingCoins) {
      alert("請先補填所有缺少金幣數的任務");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const tasks: Task[] = editedTasks.map((t) => ({
      taskId: t.taskId,
      label: t.label,
      description: t.description,
      coins: t.coins,
      isOptional: t.isOptional,
    }));

    const worksheet: Worksheet = {
      id,
      title: title.trim(),
      semester,
      week,
      markdownContent: markdown,
      tasks,
      classId: classIds[0],
      classIds,
      isPublished: publish,
      publishedAt: publish ? now : null,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      styledHtmlUrl: null,
      styledHtmlGeneratedAt: null,
      styledHtmlStatus: "pending",
      gammaUrl: gammaUrl.trim() || null,
    };

    await saveWorksheet(worksheet);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-[var(--terminal-bg)] border-2 border-[var(--terminal-primary)] w-full max-w-3xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--terminal-primary-dim)]">
          <h2 className="font-bold text-lg">新增學習單</h2>
          <button onClick={onClose} className="text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] text-xl">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Step 1: Upload */}
          {!parseResult && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/5"
                  : "border-[var(--terminal-primary-dim)]"
              }`}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <div className="text-4xl mb-3">📄</div>
              <p>拖放 .md 檔案到此處，或點擊選擇檔案</p>
              <p className="text-sm text-[var(--terminal-primary-dim)] mt-2">
                支援格式：### 任務 A｜任務名稱（10 金幣）
              </p>
            </div>
          )}

          {/* Step 2: Preview & Edit */}
          {parseResult && (
            <>
              {parseResult.errors.length > 0 && (
                <div className="border border-red-700 bg-red-900/20 p-3">
                  {parseResult.errors.map((e, i) => (
                    <p key={i} className="text-red-400 text-sm">⛔ {e}</p>
                  ))}
                  <button
                    onClick={() => { setParseResult(null); setMarkdown(""); }}
                    className="mt-2 text-xs text-[var(--terminal-primary-dim)] underline"
                  >
                    重新上傳
                  </button>
                </div>
              )}

              {parseResult.warnings.length > 0 && (
                <div className="border border-yellow-700 bg-yellow-900/20 p-3">
                  {parseResult.warnings.map((w, i) => (
                    <p key={i} className="text-yellow-400 text-sm">⚠️ {w}</p>
                  ))}
                </div>
              )}

              {parseResult.success && (
                <>
                  {/* Title & metadata */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        標題
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2 focus:border-[var(--terminal-primary)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        學期
                      </label>
                      <select
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2 outline-none"
                      >
                        {["S1", "S2", "S3", "S4", "S5", "S6"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        週次
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={week}
                        onChange={(e) => setWeek(parseInt(e.target.value) || 1)}
                        className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2 outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        可看見的班級（可多選）
                      </label>
                      {classrooms.length === 0 ? (
                        <p className="text-yellow-400 text-sm">
                          尚無班級，請先到班級管理建立班級
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            {classrooms.map((c) => {
                              const checked = classIds.includes(c.id);
                              return (
                                <label
                                  key={c.id}
                                  className={`flex items-center gap-2 px-3 py-2 border cursor-pointer text-sm ${
                                    checked
                                      ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/10 text-[var(--terminal-primary)]"
                                      : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleClass(c.id)}
                                    className="accent-[var(--terminal-primary)]"
                                  />
                                  <span className="truncate">{c.name}</span>
                                  {checked && classIds[0] === c.id && (
                                    <span className="ml-auto text-[10px] px-1 bg-[var(--terminal-primary)]/20 border border-[var(--terminal-primary-dim)]">
                                      主帶
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                          <p className="text-xs text-[var(--terminal-primary-dim)] mt-1">
                            勾選的班級都看得到這份學習單；第一個勾選的為「主帶班級」（進度歸屬）。
                          </p>
                        </>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        Gamma 連結（選填）
                      </label>
                      <input
                        type="url"
                        value={gammaUrl}
                        onChange={(e) => setGammaUrl(e.target.value)}
                        placeholder="貼上 Gamma 分享連結，例：https://gamma.app/docs/xxxxx"
                        className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2 outline-none focus:border-purple-500"
                      />
                      <p className="text-xs text-[var(--terminal-primary-dim)] mt-1">
                        在 Gamma 建好漂亮版學習單後，複製分享連結貼到這裡。學生會優先看到 Gamma 版本。
                      </p>
                    </div>
                  </div>

                  {/* Task preview */}
                  <div>
                    <h3 className="font-bold mb-2">
                      解析結果：{editedTasks.length} 個任務
                    </h3>
                    <div className="space-y-2">
                      {editedTasks.map((task, idx) => (
                        <div
                          key={task.taskId}
                          className={`border p-3 ${
                            task.coinsMissing
                              ? "border-yellow-600 bg-yellow-900/10"
                              : "border-[var(--terminal-primary-dim)]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold">
                                任務 {task.taskId}
                              </span>
                              {task.isOptional && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-400 border border-blue-700">
                                  選修
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                value={task.coins}
                                onChange={(e) =>
                                  updateTaskCoins(idx, parseInt(e.target.value) || 0)
                                }
                                className={`w-20 bg-[var(--terminal-bg)] border px-2 py-1 text-right outline-none ${
                                  task.coinsMissing
                                    ? "border-yellow-600 text-yellow-400"
                                    : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)]"
                                }`}
                              />
                              <span className="text-sm">金幣</span>
                            </div>
                          </div>
                          <p className="text-xs text-[var(--terminal-primary-dim)]">
                            {task.label}
                          </p>
                          {task.description && (
                            <p className="text-xs text-[var(--terminal-primary-dim)] mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-sm text-[var(--terminal-primary-dim)]">
                      總金幣：{editedTasks.reduce((s, t) => s + t.coins, 0)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-[var(--terminal-primary-dim)]">
                    <button
                      onClick={() => { setParseResult(null); setMarkdown(""); }}
                      className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)]"
                    >
                      重新上傳
                    </button>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSave(false)}
                        disabled={saving || classIds.length === 0 || hasMissingCoins}
                        className="px-4 py-2 border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 disabled:opacity-40"
                      >
                        {saving ? "儲存中..." : "儲存草稿"}
                      </button>
                      <button
                        onClick={() => handleSave(true)}
                        disabled={saving || classIds.length === 0 || hasMissingCoins}
                        className="px-4 py-2 bg-[var(--terminal-primary)] text-[var(--terminal-bg)] font-bold hover:opacity-90 disabled:opacity-40"
                      >
                        {saving ? "儲存中..." : "儲存並發布"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
