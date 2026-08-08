import React, { useEffect, useMemo, useState } from "react";
import { FiBookOpen, FiClipboard, FiCopy, FiTrash2, FiX } from "react-icons/fi";
import {
  readWorksheetNotebook,
  WORKSHEET_NOTEBOOK_CHANGE_EVENT,
  worksheetNotebookKey,
  writeWorksheetNotebook,
} from "@/utils/worksheetNotebook";

interface WorksheetNotebookProps {
  userId?: string;
  worksheetId: string;
  variant?: "worksheet" | "session";
}

export default function WorksheetNotebook({
  userId,
  worksheetId,
  variant = "worksheet",
}: WorksheetNotebookProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const [clearPending, setClearPending] = useState(false);
  const notebookKey = useMemo(
    () => (userId ? worksheetNotebookKey(userId, worksheetId) : ""),
    [userId, worksheetId]
  );

  useEffect(() => {
    if (!userId) return;
    setContent(readWorksheetNotebook(userId, worksheetId).content);
    setStatus("");
  }, [userId, worksheetId]);

  useEffect(() => {
    if (!userId || !notebookKey) return;
    const refresh = () => setContent(readWorksheetNotebook(userId, worksheetId).content);
    const onStorage = (event: StorageEvent) => {
      if (event.key === notebookKey) refresh();
    };
    const onNotebookChange = (event: Event) => {
      if ((event as CustomEvent<{ key?: string }>).detail?.key === notebookKey) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(WORKSHEET_NOTEBOOK_CHANGE_EVENT, onNotebookChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WORKSHEET_NOTEBOOK_CHANGE_EVENT, onNotebookChange);
    };
  }, [notebookKey, userId, worksheetId]);

  if (!userId || !worksheetId) return null;

  const updateContent = (nextContent: string) => {
    setContent(nextContent);
    setClearPending(false);
    writeWorksheetNotebook(userId, worksheetId, nextContent);
    setStatus("已儲存");
  };

  const copyNotebook = async () => {
    if (!content.trim()) {
      setStatus("先記下一條線索，再複製。 ");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setStatus("已複製，可貼到 Lab Terminal。 ");
    } catch {
      setStatus("無法直接複製，請在筆記區按 Ctrl+C。 ");
    }
  };

  const pasteNotebook = async () => {
    try {
      const pasted = await navigator.clipboard.readText();
      if (!pasted) {
        setStatus("剪貼簿目前沒有文字。 ");
        return;
      }
      updateContent(content ? `${content}\n${pasted}` : pasted);
      setStatus("已貼到筆記本。 ");
    } catch {
      setStatus("請點筆記區後按 Ctrl+V 貼上。 ");
    }
  };

  const clearNotebook = () => {
    if (!content.trim()) {
      setClearPending(false);
      setStatus("筆記本已經是空白的。");
      return;
    }
    if (!clearPending) {
      setClearPending(true);
      setStatus("再按一次垃圾桶才會清除筆記。");
      return;
    }
    updateContent("");
    setClearPending(false);
    setStatus("筆記已清除。");
  };

  const compact = variant === "session";

  return (
    <div className={`relative ${compact ? "shrink-0" : ""}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
        className={`inline-flex items-center gap-2 border-2 border-dashed px-3 py-2 text-xs font-black tracking-normal transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-300 ${
          compact
            ? "border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-100 hover:bg-fuchsia-500/20"
            : "border-amber-300 bg-sky-500/10 text-amber-100 shadow-[0_0_0_3px_rgba(56,189,248,0.18)] hover:bg-amber-400/15"
        }`}
        title="開啟線索筆記本，可複製到 Lab Terminal"
      >
        <FiBookOpen className="h-4 w-4" />
        <span>{compact ? "筆記" : "線索筆記本"}</span>
      </button>

      {isOpen ? (
        <section className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(96vw,560px)] border-2 border-dashed border-sky-300 bg-[#12243d] p-4 text-left text-slate-50 shadow-[0_0_0_3px_rgba(244,114,182,0.18),0_14px_34px_rgba(0,0,0,0.48)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-amber-200">線索筆記本</div>
              <div className="text-[11px] text-sky-100">整理任務、規則和你發現的線索</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setClearPending(false);
              }}
              className="p-1 text-slate-200 hover:text-white"
              title="關閉筆記本"
              aria-label="關閉筆記本"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>

          <textarea
            value={content}
            onChange={(event) => updateContent(event.target.value)}
            placeholder="例如：\n- 這題要找的關鍵字\n- 不能出現的內容\n- 下一步要使用的工具"
            className="min-h-[280px] w-full resize-y border border-dashed border-amber-300/80 bg-slate-950/70 p-3 text-base leading-7 text-slate-50 outline-none placeholder:text-slate-400 focus:border-fuchsia-300 focus:ring-1 focus:ring-fuchsia-300"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-h-[18px] text-[11px] text-sky-100" aria-live="polite">
              {status}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearNotebook}
                className={`inline-flex h-8 w-8 items-center justify-center border text-xs transition-colors ${
                  clearPending
                    ? "border-red-300 bg-red-500/25 text-red-100"
                    : "border-slate-500 text-slate-200 hover:border-red-300 hover:text-red-100"
                }`}
                title={clearPending ? "再按一次清除全部筆記" : "清除筆記"}
                aria-label={clearPending ? "再按一次清除全部筆記" : "清除筆記"}
              >
                <FiTrash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={pasteNotebook}
                className="inline-flex items-center gap-1 border border-dashed border-fuchsia-300 px-2 py-1.5 text-xs font-bold text-fuchsia-100 hover:bg-fuchsia-500/15"
              >
                <FiClipboard className="h-3.5 w-3.5" /> 貼上
              </button>
              <button
                type="button"
                onClick={copyNotebook}
                className="inline-flex items-center gap-1 border border-dashed border-amber-300 px-2 py-1.5 text-xs font-bold text-amber-100 hover:bg-amber-400/15"
              >
                <FiCopy className="h-3.5 w-3.5" /> 複製
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
