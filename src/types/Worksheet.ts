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
  classId: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  styledHtmlUrl: string | null;
  styledHtmlGeneratedAt: string | null;
  styledHtmlStatus: 'pending' | 'generating' | 'ready' | 'error';
  gammaUrl: string | null;
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
