import { ParsedTask, ParseResult } from "@/types/Worksheet";

export function parseWorksheetMarkdown(content: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tasks: ParsedTask[] = [];

  const lines = content.split("\n");
  let currentTask: Partial<ParsedTask> | null = null;
  let descriptionLines: string[] = [];

  const flushTask = () => {
    if (!currentTask?.taskId) return;
    const description = descriptionLines
      .join("\n")
      .trim()
      .slice(0, 200);
    tasks.push({
      taskId: currentTask.taskId!,
      label: currentTask.label || `任務 ${currentTask.taskId}`,
      description,
      coins: currentTask.coins ?? 0,
      isOptional: currentTask.isOptional ?? false,
      coinsMissing: currentTask.coins === undefined || currentTask.coins === null,
    });
    currentTask = null;
    descriptionLines = [];
  };

  const taskHeaderPattern = /^#{2,3}\s*任務\s*([A-Z])\s*[｜|]/;
  const coinsPattern = /[（(](\d+)\s*金幣[）)]/;
  const optionalPattern = /可選|選修|選做|進階/;

  for (const line of lines) {
    const taskMatch = line.match(taskHeaderPattern);
    if (taskMatch) {
      flushTask();

      const taskId = taskMatch[1];
      const coinsMatch = line.match(coinsPattern);
      const isOptional = optionalPattern.test(line);

      const fullLabel = line
        .replace(/^#{2,3}\s*/, "")
        .replace(coinsPattern, "")
        .replace(/[（(][）)]/g, "")
        .trim();

      currentTask = {
        taskId,
        label: fullLabel || `任務 ${taskId}`,
        coins: coinsMatch ? parseInt(coinsMatch[1], 10) : undefined,
        isOptional,
      };

      if (!coinsMatch) {
        warnings.push(`任務 ${taskId}：找不到金幣數，已預設為 0`);
      }

      descriptionLines = [];
      continue;
    }

    if (currentTask) {
      if (/^#{1,3}\s/.test(line) && !taskHeaderPattern.test(line)) {
        flushTask();
      } else {
        descriptionLines.push(line);
      }
    }
  }

  flushTask();

  if (tasks.length === 0) {
    errors.push("請確認學習單包含「任務 A」格式的標題（例如：### 任務 A｜任務名稱（10 金幣））");
  }

  return {
    success: errors.length === 0,
    tasks,
    errors,
    warnings,
  };
}

export function extractWorksheetTitle(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)/);
    if (match) return match[1].trim();
  }
  return "未命名學習單";
}

/**
 * Auto-detect semester (e.g. "S5") and week (e.g. 14) from the worksheet title
 * or filename. Supports patterns like "S5 W14", "S5-W14", "S5W14".
 * Returns null for a field when it can't be confidently extracted.
 */
export function extractSemesterAndWeek(text: string): {
  semester: string | null;
  week: number | null;
} {
  const semMatch = text.match(/\bS(\d{1,2})\b/i);
  const weekMatch = text.match(/\bW(\d{1,2})\b/i);
  return {
    semester: semMatch ? `S${parseInt(semMatch[1], 10)}` : null,
    week: weekMatch ? parseInt(weekMatch[1], 10) : null,
  };
}
