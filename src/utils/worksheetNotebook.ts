const NOTEBOOK_PREFIX = "worksheet-notebook:";
export const WORKSHEET_NOTEBOOK_CHANGE_EVENT = "worksheet-notebook-change";

export interface WorksheetNotebookEntry {
  content: string;
  updatedAt: string;
}

export function worksheetNotebookKey(userId: string, worksheetId: string) {
  return `${NOTEBOOK_PREFIX}${userId}:${worksheetId.toUpperCase().replace(/[-_\s]/g, "")}`;
}

export function readWorksheetNotebook(userId: string, worksheetId: string): WorksheetNotebookEntry {
  if (typeof window === "undefined") return { content: "", updatedAt: "" };
  try {
    const raw = window.localStorage.getItem(worksheetNotebookKey(userId, worksheetId));
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      content: typeof parsed?.content === "string" ? parsed.content : "",
      updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return { content: "", updatedAt: "" };
  }
}

export function writeWorksheetNotebook(
  userId: string,
  worksheetId: string,
  content: string
) {
  if (typeof window === "undefined") return;
  const key = worksheetNotebookKey(userId, worksheetId);
  const entry: WorksheetNotebookEntry = {
    content,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
    window.dispatchEvent(new CustomEvent(WORKSHEET_NOTEBOOK_CHANGE_EVENT, { detail: { key } }));
  } catch {
    // Notebook is a local learning aid and remains usable until the next refresh.
  }
}
