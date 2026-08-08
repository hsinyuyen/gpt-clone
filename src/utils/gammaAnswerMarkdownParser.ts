import type { GammaAnswerExpectedKind } from "@/types/GammaAnswerWorksheet";

export interface ParsedGammaAnswerMarkdownTask {
  label: string;
  title: string;
  block: string;
  prompt: string;
  coins: number;
  expectedKind: GammaAnswerExpectedKind;
}

export interface ParsedGammaAnswerMarkdown {
  tasks: ParsedGammaAnswerMarkdownTask[];
  warnings: string[];
  errors: string[];
}

const cleanInlineMarkdown = (value: string) =>
  value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~>]/g, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

function inferExpectedKind(block: string): GammaAnswerExpectedKind {
  if (/\bLab\s*Video\b/i.test(block)) return "video";
  if (/\bLab\s*Music\b/i.test(block)) return "audio";
  if (/\bLab\s*Image\b/i.test(block)) return "image";
  if (/\bLab\s*Terminal\b/i.test(block)) return "text";
  if (/影片|短片|\bvideo\b|\.mp4\b|\.webm\b|\.mov\b/i.test(block)) return "video";
  if (/音樂|音訊|聲音|歌曲|配樂|\baudio\b|\bmusic\b|\.mp3\b|\.wav\b|\.m4a\b/i.test(block)) {
    return "audio";
  }
  if (/圖片|影像|照片|圖像|插圖|\bimage\b|\bphoto\b|\.png\b|\.jpe?g\b|\.webp\b/i.test(block)) {
    return "image";
  }
  return "text";
}

function sectionBody(block: string, heading: string) {
  const pattern = new RegExp(`^#{3,6}\\s*${heading}[^\\n]*(?:\\n|$)`, "imu");
  const match = pattern.exec(block);
  if (!match) return "";
  const remainder = block.slice(match.index + match[0].length);
  const nextHeading = remainder.search(/^#{1,6}\s/mu);
  return (nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder).trim();
}

function taskPrompt(block: string, title: string) {
  const completion = sectionBody(block, "完成這一題");
  const conditions = sectionBody(block, "完成條件");
  const source = completion || conditions;
  const prompt = cleanInlineMarkdown(source);
  return prompt || `請完成「${title}」。請依照左側 GAMMA 內容作答。`;
}

/**
 * Parses the normal worksheet Markdown format without AI. A task continues until
 * the next level-two heading, so its `### 完成這一題` and `### 完成條件`
 * sections remain part of the same task.
 */
export function parseGammaAnswerMarkdown(markdown: string): ParsedGammaAnswerMarkdown {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const headings = Array.from(
    normalized.matchAll(/^##\s+(任務\s*[^\n]+)$/gimu)
  );
  const warnings: string[] = [];
  const errors: string[] = [];

  const tasks = headings.map((match, index) => {
    const start = match.index || 0;
    const end = headings[index + 1]?.index ?? normalized.length;
    const block = normalized.slice(start, end).trim();
    const rawHeading = match[1].trim();
    const coinMatch = rawHeading.match(/[（(]\s*(\d+)\s*金幣\s*[）)]/u);
    const coins = coinMatch ? Number(coinMatch[1]) : 0;
    const label = rawHeading.replace(/\s*[（(]\s*\d+\s*金幣\s*[）)]\s*$/u, "").trim();
    const title = label || `第 ${index + 1} 題`;
    const prompt = taskPrompt(block, title);

    if (!coinMatch) warnings.push(`${title} 沒有找到金幣數，請在編輯器補上。`);
    if (!sectionBody(block, "完成這一題") && !sectionBody(block, "完成條件")) {
      warnings.push(`${title} 沒有「完成這一題」或「完成條件」，已使用預設提示。`);
    }

    return {
      label,
      title,
      block,
      prompt,
      coins,
      expectedKind: inferExpectedKind(block),
    };
  });

  if (tasks.length === 0) {
    errors.push("找不到「## 任務」標題，請確認 Markdown 的任務格式。");
  }

  return { tasks, warnings, errors };
}
