export interface Task {
  taskId: string;
  label: string;
  description: string;
  coins: number;
  isOptional: boolean;
}

export interface Worksheet {
  id: string;
  title: string;
  semester: string;
  week: number;
  markdownContent: string;
  tasks: Task[];
  classId: string;              // 主帶班級（進度歸屬 / 顯示用；classIds 的第一個）
  classIds?: string[];          // 可看見此學習單的所有班級（含 classId）。舊資料可能沒有此欄位，查詢時以 classId 後援。
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  styledHtmlUrl: string | null;
  styledHtmlGeneratedAt: string | null;
  styledHtmlStatus: 'pending' | 'generating' | 'ready' | 'error';
  gammaUrl: string | null;
  // P1（動作技能）等互動遊戲型學習單：卡片點擊後直接開這個單檔遊戲，
  // 進度/金幣由遊戲自己寫入 gameProgress/{uid} 的 gameKey 欄位（不走 studentProgress 逐任務審核）。
  externalGameUrl?: string | null;
  gameKey?: string | null;
}

export interface TaskProgress {
  completed: boolean;
  completedAt: string | null;
  approvedBy: string | null;
  approverName: string | null;
  coinsAwarded: number;
}

export interface StudentWorksheetProgress {
  studentId: string;
  worksheetId: string;
  semester: string;
  week: number;
  classId: string;
  firstOpenedAt: string | null;
  tasks: Record<string, TaskProgress>;
  totalCoinsAwarded: number;
  completedTaskCount: number;
  lastUpdatedAt: string;
}

export interface AuditLogEntry {
  action: 'award_coins' | 'revoke_coins';
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  worksheetId: string;
  worksheetTitle: string;
  semester: string;
  week: number;
  taskId: string;
  taskLabel: string;
  coins: number;
  timestamp: string;
}

export interface ParsedTask {
  taskId: string;
  label: string;
  description: string;
  coins: number;
  isOptional: boolean;
  coinsMissing: boolean;
}

export interface ParseResult {
  success: boolean;
  tasks: ParsedTask[];
  errors: string[];
  warnings: string[];
}
