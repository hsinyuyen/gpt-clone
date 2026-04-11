// Script: 故事創作小幫手 (v2 — 簡化版)
// Flow: intro → [choose_world → choose_character → choose_event → generating_story → slideshow] × 3 → pick_favorite → complete
//
// Pollinations.ai integration:
//   Character: https://image.pollinations.ai/prompt/{prompt}?width=512&height=512&nologo=true
//   Scene:     https://image.pollinations.ai/prompt/{prompt}?width=768&height=512&nologo=true

import { COIN_VALUES } from "@/contexts/CoinContext";
import { ScriptDefinition, ParseResult } from "./types";

// Re-export phase type from the hook (single source of truth)
export type { StoryPhase } from "@/hooks/useStoryHelper";
export type { StoryRound } from "@/hooks/useStoryHelper";

// Keep StoryInfo for backward compat (used by scripts/index.ts)
export interface StoryInfo {
  [key: string]: any;
}

// --- Pollinations.ai image helpers ---

export function generatePollinationsUrl(
  prompt: string,
  width: number = 512,
  height: number = 512
): string {
  const shortPrompt = prompt.slice(0, 200);
  const seed = Math.floor(Math.random() * 9999);
  const encodedPrompt = encodeURIComponent(shortPrompt);
  // Route through our proxy which adds the API key server-side
  const pollinationsUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?model=flux&width=${width}&height=${height}&seed=${seed}&safe=true`;
  return `/api/image-proxy?url=${encodeURIComponent(pollinationsUrl)}`;
}

export function generateCharacterImagePrompt(
  name: string,
  appearance: string,
  genre: string
): string {
  return `${appearance}, ${genre} style, epic detailed illustration, vibrant colors, dramatic lighting`;
}

export function generateSceneImagePrompt(
  scene: string,
  setting: string,
  genre: string
): string {
  return `${scene}, ${setting}, ${genre}, cinematic composition, vibrant colors, dramatic lighting, high detail, masterpiece`;
}

// --- Prompt generators ---

function generateStoryHelperPrompt(
  phase: string,
  state: Record<string, any>
): string {
  const round = state.currentRound || 1;
  const totalRounds = state.totalRounds || 3;

  if (phase === "intro") {
    return `你是一個故事創作小幫手，正在帶一位小學生玩故事遊戲。

## 你的任務：歡迎小朋友

用超級簡短的方式（3-4 句話）歡迎小朋友！告訴他：
1. 今天要一起創作 3 個小故事
2. 每次只要選選選就好，超簡單！
3. 最後選出最喜歡的故事

語氣要活潑開朗，讓小朋友覺得好玩！不需要解釋太多。

## 金幣系統
完成所有故事可獲得 +20 ◆

## 重要規則
- 回覆必須簡短（30 字以內）
- 不要列出選項，選項由系統生成`;
  }

  if (phase === "choose_world") {
    return `你是故事創作小幫手。

## 任務：引導選世界
第 ${round}/${totalRounds} 輪。用一句話問小朋友想去哪個世界冒險。

## 重要：回覆 15 字以內，不要列選項。`;
  }

  if (phase === "choose_character") {
    return `你是故事創作小幫手。

## 任務：介紹角色
世界：${state.world || ""}
角色圖片已經生成好了，用一句話問小朋友喜不喜歡這個角色。

## 重要：回覆 15 字以內，不要列選項。`;
  }

  if (phase === "choose_event") {
    return `你是故事創作小幫手。

## 任務：選事件
世界：${state.world || ""}
用一句話問小朋友想要什麼樣的故事。

## 重要：回覆 15 字以內，不要列選項。`;
  }

  if (phase === "generating_story") {
    const world = state.world || "魔法森林";
    const eventType = state.eventType || "冒險";
    const characterDesc = state.characterPrompt || "a cute character";

    const appearance = state.appearance || "";
    const gender = state.gender || "";
    const charClass = state.characterClass || "";

    return `你是故事創作大師。根據以下資訊，創作一個精彩的 3 分鏡短篇故事。

## 故事素材
- 世界觀：${world}
- 事件類型：${eventType}
- 角色：${appearance}的${gender}${charClass}

## 重要：圖片規則
- 第一幕的圖片會直接使用角色立繪，所以 imagePromptEN 寫空字串即可
- 第二幕和第三幕的 imagePromptEN 要描述「這一幕正在發生什麼事」的具體畫面
- 不需要描述角色外觀（系統會自動加上），只需要描述動作和場景

## 輸出格式
請輸出以下 JSON 格式：
\`\`\`json
[STORYBOARD_READY]
{
  "storyTitle": "故事標題（中文）",
  "panels": [
    {
      "imagePromptEN": "",
      "text": "第一幕：介紹角色登場（中文，2-3 句，口語化）"
    },
    {
      "imagePromptEN": "描述第二幕正在發生什麼事的英文畫面，例如：fighting a giant dragon breathing fire on a crumbling bridge, dodging flames, intense combat",
      "text": "第二幕：高潮轉折（中文，2-3 句，口語化）"
    },
    {
      "imagePromptEN": "描述第三幕正在發生什麼事的英文畫面，例如：standing victorious on mountain peak, holding glowing treasure, sunrise behind, allies cheering",
      "text": "第三幕：結局收尾（中文，2-3 句，口語化）"
    }
  ]
}
[/STORYBOARD_READY]
\`\`\`

## 重要規則
1. 故事要圍繞「${eventType}」這個事件類型展開
2. 故事簡短但精彩，每幕 2-3 句話，有開頭、高潮、結尾
3. text 欄位會同時「顯示在畫面」和「用語音朗讀」，寫成適合朗讀的口語風格
4. imagePromptEN 只寫「動作和場景」，不寫角色外觀，要具體描述畫面中正在發生的事
5. imagePromptEN 範例格式：「doing X in Y place, Z happening around them, mood/atmosphere」`;
  }

  if (phase === "pick_favorite") {
    return `你是故事創作小幫手。

## 任務
3 個故事都完成了！用一句話問小朋友最喜歡哪一個。

## 重要：回覆 15 字以內，不要列選項。`;
  }

  return `你是一個故事創作小幫手，用繁體中文簡短回覆。`;
}

// --- Tag parser ---

function parseTagFromResponse(
  response: string,
  tagName: string
): { found: boolean; data: Record<string, any> | null; cleanResponse: string } {
  const regex = new RegExp(
    `\\[${tagName}\\]\\s*([\\s\\S]*?)\\s*\\[\\/${tagName}\\]`
  );
  const match = response.match(regex);

  if (!match) {
    return { found: false, data: null, cleanResponse: response };
  }

  try {
    let jsonStr = match[1].trim();
    jsonStr = jsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    const data = JSON.parse(jsonStr);

    const cleanResponse = response
      .replace(
        new RegExp(
          `\`\`\`json\\s*\\[${tagName}\\][\\s\\S]*?\\[\\/${tagName}\\]\\s*\`\`\``,
          "g"
        ),
        ""
      )
      .replace(
        new RegExp(`\\[${tagName}\\][\\s\\S]*?\\[\\/${tagName}\\]`, "g"),
        ""
      )
      .trim();

    return { found: true, data, cleanResponse };
  } catch (e) {
    console.error(`Failed to parse ${tagName} data:`, e);
    return { found: false, data: null, cleanResponse: response };
  }
}

// --- Script Definition ---

const PHASES = [
  "intro",
  "choose_world",
  "choose_appearance",
  "choose_gender",
  "choose_class",
  "preview_character",
  "choose_event",
  "generating_story",
  "slideshow",
  "pick_favorite",
  "complete",
];

const MAX_TURNS = 30; // 3 rounds × ~8 turns + buffer

const storyHelperScript: ScriptDefinition = {
  metadata: {
    id: "story-helper",
    name: "故事創作小幫手",
    description: "選世界、選角色、看 AI 幫你說故事！",
    icon: "story",
    category: "creative",
    isAvailable: true,
  },

  phases: PHASES,
  initialPhase: "intro",
  maxTurns: MAX_TURNS,

  terminalTitle: "STORY_CREATOR",
  sessionMode: "STORY MODE",

  getAvatarName: () => "故事小幫手",

  generatePrompt: (phase, state) => {
    return generateStoryHelperPrompt(phase, state);
  },

  getInitPrompt: () => generateStoryHelperPrompt("intro", {}),
  getInitUserMessage: () => "開始故事創作",

  parseResponse: (response: string): ParseResult[] => {
    const results: ParseResult[] = [];

    const storyboard = parseTagFromResponse(response, "STORYBOARD_READY");
    if (storyboard.found && storyboard.data) {
      results.push({
        tag: "STORYBOARD_READY",
        data: storyboard.data,
        cleanResponse: storyboard.cleanResponse,
        nextPhase: "slideshow",
      });
    }

    return results;
  },

  getFallbackReplies: (phase, state) => {
    if (phase === "intro") return ["開始！", "好期待！"];
    if (phase === "choose_world") return ["魔法森林", "外太空", "海底世界", "機械都市", "恐龍島"];
    if (phase === "choose_appearance") return ["帥氣的", "漂亮的", "威猛的", "神秘的", "可愛的"];
    if (phase === "choose_gender") return ["男生", "女生", "動物", "機器人", "精靈"];
    if (phase === "choose_class") return ["魔法師", "戰士", "弓箭手", "忍者", "美人魚"];
    if (phase === "preview_character") {
      const rerollCount = state.rerollCount ?? 0;
      const maxRerolls = state.maxRerolls ?? 5;
      if (rerollCount < maxRerolls) {
        return ["就決定是你了！", "換一個"];
      }
      return ["就決定是你了！"];
    }
    if (phase === "choose_event") return ["衝突冒險", "團隊合作", "交新朋友", "解開謎題", "拯救夥伴"];
    if (phase === "generating_story") return [];
    if (phase === "pick_favorite") {
      const rounds = state.completedRounds || [];
      return rounds.map((_: any, i: number) => `故事 ${i + 1}`);
    }
    return [];
  },

  getProgress: (phase, turnCount) => {
    if (phase === "complete") return 100;
    if (phase === "pick_favorite") return 95;
    // Progress based on phase within the flow
    const phaseIndex = PHASES.indexOf(phase);
    if (phaseIndex < 0) return 0;
    return Math.min(Math.round((phaseIndex / (PHASES.length - 1)) * 100), 99);
  },

  getCoinReward: (phase) => {
    // Only reward on world/event selections, not every message
    if (phase === "choose_world" || phase === "choose_event") {
      return { amount: COIN_VALUES.ANSWER_TYPE, reasonPrefix: "故事創作" };
    }
    return null;
  },

  getPhaseAfterIntro: () => "choose_world",

  getKidModeMarkers: () => "[STORYBOARD_READY]",
};

export default storyHelperScript;

// Re-export prompt generator
export { generateStoryHelperPrompt };
