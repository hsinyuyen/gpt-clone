// 課程完成狀態（統一層）
//
// 為什麼要有這個檔：專案原本有四套各自為政的「完成」判定——
//   1. 對話式腳本   → localStorage 的 completedScripts
//   2. AI 繪本      → users/{uid}/picturebook/main 有沒有 imageData
//   3. 遊戲型學習單 → gameProgress/{uid}[gameKey].done
//   4. 一般學習單   → studentProgress/{uid}/worksheets/{id} 的任務審核數
// 「完成後鎖死在成果展示」這條規則要一致套用，就需要一個共同的判定與儲存位置。
//
// 儲存在 users/{uid}/progress/lessons（單一文件，欄位是 lessonKey）。
// 選這個路徑是因為 firestore.rules 的 users/{userId}/{sub=**} 已經涵蓋，
// 不必新增 collection 白名單也不必重新部署規則。

/** 課程識別碼。格式：`<型態>:<id>`，例如 script:create-avatar、picturebook:l1 */
export type LessonKey = string;

export const lessonKeys = {
  script: (scriptId: string): LessonKey => `script:${scriptId}`,
  picturebook: (lesson: string): LessonKey => `picturebook:${lesson}`,
  worksheet: (worksheetId: string): LessonKey => `worksheet:${worksheetId}`,
  game: (gameKey: string): LessonKey => `game:${gameKey}`,
};

/** 完成時保留的成品，供「已完成」畫面直接展示，不必再回頭查各自的來源 */
export interface LessonArtifact {
  /** image = 圖片（data URL 或網址）；text = 文字成品；score = 分數/金幣 */
  type: "image" | "text" | "score";
  /** type=image 時的圖片來源 */
  imageUrl?: string;
  /** type=text 時的內容 */
  text?: string;
  /** type=score 時的數值 */
  score?: number;
  /** 成品標題，例如主角名字、故事標題 */
  label?: string;
}

export interface LessonCompletion {
  completed: boolean;
  completedAt: string;
  artifact?: LessonArtifact;
  /** 老師解鎖後為 true——此時允許重做一次，學生重新完成後會被清回 false */
  redoAllowed?: boolean;
  redoAllowedBy?: string | null;
  redoAllowedByName?: string | null;
  redoAllowedAt?: string | null;
}

export type LessonCompletionMap = Record<LessonKey, LessonCompletion>;

/**
 * 這堂課現在是不是「鎖住」狀態。
 * 完成且老師沒有開放重做 → 鎖住，進入畫面只顯示成果展示。
 */
export function isLessonLocked(
  map: LessonCompletionMap | null | undefined,
  key: LessonKey
): boolean {
  const c = map?.[key];
  return !!c?.completed && !c.redoAllowed;
}

/**
 * 給「完成與否本來就能從既有資料推導」的型態用（學習單任務數、gameProgress.done、
 * 繪本有沒有存圖）。這種情況不重複寫一份完成狀態，lessons 文件只當作老師解鎖的覆寫層，
 * 避免兩邊不同步。
 */
export function isLockedByDerived(
  map: LessonCompletionMap | null | undefined,
  key: LessonKey,
  derivedCompleted: boolean
): boolean {
  return derivedCompleted && !map?.[key]?.redoAllowed;
}

export function getArtifact(
  map: LessonCompletionMap | null | undefined,
  key: LessonKey
): LessonArtifact | null {
  return map?.[key]?.artifact ?? null;
}
