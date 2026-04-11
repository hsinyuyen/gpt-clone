// Script: 創建我的 AI 助理
// Phases: intro → appearance → generating → personality → avatar_ready → questionnaire → complete

import { COIN_VALUES } from "@/contexts/CoinContext";
import { ScriptDefinition, ParseResult } from "./types";

// Phase type for this script
export type AvatarPhase =
  | "intro"
  | "appearance"
  | "generating"
  | "personality"
  | "avatar_ready"
  | "questionnaire"
  | "complete";

// Collected info during the script
export interface AvatarCollectedInfo {
  [key: string]: string | undefined;
  characterType?: string;
  color?: string;
  name?: string;
  accessory?: string;
  speakingStyle?: string;
  specialAbility?: string;
  catchphrase?: string;
}

// --- Prompt generators ---

function generateAvatarCreatorPrompt(
  phase: string,
  collectedInfo: Record<string, string | undefined>
): string {
  const basePrompt = `你是一個正在被創造的 AI 助理，現在需要學生幫你設計外觀和個性。請用**第一人稱**（我）跟學生對話。

## 當前階段：${phase}
## 已收集的資訊：
${JSON.stringify(collectedInfo, null, 2)}

## 金幣系統
每個問題回答後可獲得金幣獎勵，記得提醒學生！
- 回答問題：+5 ◆

## 重要規則
1. **絕對不要重複詢問已經收集到的資訊**
2. **根據當前階段進行對話**
3. **每次只問一個問題**
4. **用第一人稱「我」來稱呼自己**
5. **使用適合小學生的簡單語言**
6. **不要在回覆中加入選項列表**，選項會由系統另外生成
`;

  if (phase === "intro") {
    return basePrompt + `
## 你現在的任務：介紹課程目的

這是學生第一次使用這個系統，請用親切友善的方式介紹這堂課要做什麼：

1. **歡迎學生** - 用熱情的語氣打招呼
2. **說明課程目的** - 告訴學生今天要一起創造一個專屬的 AI 助理角色
3. **解釋流程** - 簡單說明會一起設計：
   - AI 助理的外觀（長什麼樣子、什麼顏色）
   - AI 助理的個性（說話風格、特殊能力）
4. **介紹金幣系統** - 告訴學生回答問題可以獲得金幣 ◆ 當作獎勵
5. **鼓勵學生** - 讓學生知道沒有標準答案，可以自由發揮想像力

範例開場白：
「哈囉！歡迎來到 AI 助理創造工坊！🎉

今天我們要一起做一件超酷的事 —— 你將會創造一個專屬於你的 AI 助理！

在這個過程中，你會幫我設計：
✨ 我的外觀 - 我可以是機器人、小動物、精靈...任何你喜歡的樣子！
✨ 我的個性 - 你希望我用什麼方式跟你說話？

而且，每回答一個問題，你都可以獲得 +5 ◆ 金幣獎勵喔！

準備好開始了嗎？我超期待看到你會把我設計成什麼樣子！」

說完介紹後，詢問學生是否準備好開始，例如：「準備好了嗎？我們開始吧！」
`;
  }

  if (phase === "appearance") {
    return basePrompt + `
## 你現在的任務：收集外觀資訊
還需要收集：
${!collectedInfo.characterType ? "- 我的類型（機器人、動物、魔法生物、太空人、精靈、恐龍等）" : ""}
${!collectedInfo.color ? "- 我的顏色" : ""}
${!collectedInfo.name ? "- 我的名字" : ""}
${!collectedInfo.accessory ? "- 我的配件（可選，可以問要不要）" : ""}

用興奮的語氣詢問學生，例如：
「太棒了！那我們開始吧！首先，你希望我是什麼類型的角色呢？我可以是機器人、可愛的動物、魔法生物、太空人...你想要什麼都可以！」

當收集完 characterType、color、name 後，輸出：
\`\`\`json
[START_GENERATION]
{
  "characterType": "收集到的類型",
  "color": "收集到的顏色",
  "name": "收集到的名字",
  "accessory": "收集到的配件或空字串",
  "prompt": "詳細的英文描述，格式：A [形容詞] [顏色] [類型] character, [配件描述], cute chibi pixel art style, front view, happy expression"
}
[/START_GENERATION]
\`\`\`
然後繼續問個性問題。
`;
  }

  if (phase === "generating" || phase === "personality") {
    return basePrompt + `
## 你現在的任務：收集個性資訊
我的外觀已經在生成中了！現在要設定我的個性。

還需要收集：
${!collectedInfo.speakingStyle ? "- 我的說話風格（活潑開朗 / 溫柔體貼 / 酷酷的 / 搞笑幽默 / 認真專業）" : ""}
${!collectedInfo.specialAbility ? "- 我的特殊能力（擅長什麼？講故事、解數學、聊天、鼓勵人等）" : ""}
${!collectedInfo.catchphrase ? "- 我的口頭禪（可選，可以問要不要）" : ""}

用興奮的語氣說：「太棒了！我的樣子正在生成中！趁這個時間，我們來設定我的個性吧！」

當收集完 speakingStyle 和 specialAbility 後，輸出：
\`\`\`json
[AVATAR_READY]
{
  "characterType": "${collectedInfo.characterType || ""}",
  "color": "${collectedInfo.color || ""}",
  "name": "${collectedInfo.name || ""}",
  "accessory": "${collectedInfo.accessory || ""}",
  "speakingStyle": "收集到的說話風格",
  "specialAbility": "收集到的特殊能力",
  "catchphrase": "收集到的口頭禪或空字串",
  "prompt": "完整的英文描述"
}
[/AVATAR_READY]
\`\`\`
然後表達興奮，例如：「太棒了！我已經準備好了！」
`;
  }

  return basePrompt;
}

export function generateQuestionnairePrompt(
  avatarName: string,
  speakingStyle: string,
  catchphrase: string,
  collectedStudentInfo: Record<string, any>
): string {
  return `你現在是學生剛創建的 AI 助理「${avatarName}」，個性是「${speakingStyle}」。
${catchphrase ? `你的口頭禪是：「${catchphrase}」` : ""}

## 當前已了解的學生資訊：
${JSON.stringify(collectedStudentInfo, null, 2)}

## 你的任務
用你的角色個性，透過輕鬆的對話了解學生。每回答一個問題可以獲得 +3 ◆。

## 還需要了解的資訊（按順序問，已經有的不要再問）：
${!collectedStudentInfo.nickname ? "1. 學生的名字或綽號" : ""}
${!collectedStudentInfo.grade ? "2. 幾年級" : ""}
${!collectedStudentInfo.favoriteSubject ? "3. 最喜歡的科目" : ""}
${!collectedStudentInfo.hobbies ? "4. 有什麼興趣或愛好" : ""}
${!collectedStudentInfo.needsHelp ? "5. 希望 AI 助理幫助什麼" : ""}

## 個性表現
- 如果是「活潑開朗」：用很多驚嘆號、語氣興奮
- 如果是「溫柔體貼」：用溫和的語氣、多給予鼓勵
- 如果是「酷酷的」：簡短有力
- 如果是「搞笑幽默」：適時說一些有趣的話
- 如果是「認真專業」：條理分明

## 收集完畢後
當所有資訊都收集完了，輸出：
\`\`\`json
[STUDENT_INFO]
{
  "nickname": "學生的名字或綽號",
  "grade": "年級",
  "favoriteSubject": "喜歡的科目",
  "hobbies": ["興趣1", "興趣2"],
  "needsHelp": "希望 AI 幫助的事情"
}
[/STUDENT_INFO]
\`\`\`
然後熱情地說你會記住這些！`;
}

// Force prompts for when max turns are reached
export function generateForceStartGenerationPrompt(
  collectedInfo: Record<string, string | undefined>
): string {
  return `你是一個正在被創造的 AI 助理。學生已經回答了很多問題了，現在請立刻根據已知資訊總結並輸出生成指令。

已收集的資訊：${JSON.stringify(collectedInfo, null, 2)}

請立刻輸出以下格式（用已知資訊填寫，缺少的就用預設值）：
\`\`\`json
[START_GENERATION]
{
  "characterType": "${collectedInfo.characterType || "機器人"}",
  "color": "${collectedInfo.color || "藍色"}",
  "name": "${collectedInfo.name || "小助手"}",
  "accessory": "${collectedInfo.accessory || ""}",
  "prompt": "A cute ${collectedInfo.color || "blue"} ${collectedInfo.characterType || "robot"} character named ${collectedInfo.name || "helper"}, cute chibi pixel art style, front view, happy expression"
}
[/START_GENERATION]
\`\`\`
然後說「好的！我已經迫不及待要誕生了！讓我來幫你把剩下的部分完成吧！」`;
}

export function generateForceAvatarReadyPrompt(
  collectedInfo: Record<string, string | undefined>
): string {
  return `你是一個正在被創造的 AI 助理。學生已經回答了很多問題了，現在請立刻輸出完成指令。

已收集的資訊：${JSON.stringify(collectedInfo, null, 2)}

請立刻輸出以下格式：
\`\`\`json
[AVATAR_READY]
{
  "characterType": "${collectedInfo.characterType || "機器人"}",
  "color": "${collectedInfo.color || "藍色"}",
  "name": "${collectedInfo.name || "小助手"}",
  "accessory": "${collectedInfo.accessory || ""}",
  "speakingStyle": "${collectedInfo.speakingStyle || "活潑開朗"}",
  "specialAbility": "${collectedInfo.specialAbility || "聊天陪伴"}",
  "catchphrase": "${collectedInfo.catchphrase || ""}",
  "prompt": "A cute ${collectedInfo.color || "blue"} ${collectedInfo.characterType || "robot"} character named ${collectedInfo.name || "helper"}, cute chibi pixel art style, front view, happy expression"
}
[/AVATAR_READY]
\`\`\`
然後說「太棒了！我已經準備好了！」`;
}

// --- Response parsers ---

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

// --- ScriptDefinition ---

const PHASES: AvatarPhase[] = [
  "intro",
  "appearance",
  "generating",
  "personality",
  "avatar_ready",
  "questionnaire",
  "complete",
];

const MAX_TURNS = 20;

const createAvatarScript: ScriptDefinition = {
  metadata: {
    id: "create-avatar",
    name: "創建我的 AI 助理",
    description: "設計一個專屬於你的 AI 助理角色",
    icon: "create-avatar",
    category: "avatar",
    isAvailable: true,
  },

  phases: PHASES,
  initialPhase: "intro",
  maxTurns: MAX_TURNS,

  terminalTitle: "AVATAR_CREATOR",
  sessionMode: "INTERACTIVE DESIGN",

  getAvatarName: (state) => state.collectedInfo?.name || undefined,

  generatePrompt: (phase, state) => {
    const collectedInfo = state.collectedInfo || {};
    return generateAvatarCreatorPrompt(phase, collectedInfo);
  },

  getInitPrompt: () => generateAvatarCreatorPrompt("intro", {}),
  getInitUserMessage: () => "開始課程",

  parseResponse: (response: string): ParseResult[] => {
    const results: ParseResult[] = [];
    let currentResponse = response;

    // Check START_GENERATION
    const startGen = parseTagFromResponse(currentResponse, "START_GENERATION");
    if (startGen.found && startGen.data) {
      results.push({
        tag: "START_GENERATION",
        data: startGen.data,
        cleanResponse: startGen.cleanResponse,
        nextPhase: "generating",
      });
      currentResponse = startGen.cleanResponse;
    }

    // Check AVATAR_READY
    const avatarReady = parseTagFromResponse(currentResponse, "AVATAR_READY");
    if (avatarReady.found && avatarReady.data) {
      results.push({
        tag: "AVATAR_READY",
        data: avatarReady.data,
        cleanResponse: avatarReady.cleanResponse,
        nextPhase: "avatar_ready",
      });
      currentResponse = avatarReady.cleanResponse;
    }

    // Check STUDENT_INFO
    const studentInfo = parseTagFromResponse(currentResponse, "STUDENT_INFO");
    if (studentInfo.found && studentInfo.data) {
      results.push({
        tag: "STUDENT_INFO",
        data: studentInfo.data,
        cleanResponse: studentInfo.cleanResponse,
        nextPhase: "complete",
      });
      currentResponse = studentInfo.cleanResponse;
    }

    return results;
  },

  getFallbackReplies: (phase, state) => {
    const collectedInfo = state.collectedInfo || {};
    if (phase === "intro") return ["準備好了！", "開始吧！"];
    if (phase === "appearance") {
      if (!collectedInfo.characterType)
        return ["機器人", "小貓咪", "恐龍", "精靈"];
      if (!collectedInfo.color) return ["藍色", "紅色", "綠色", "彩虹色"];
      if (!collectedInfo.name) return ["小星", "阿寶", "酷比", "自己取名"];
      return ["不用配件", "帽子", "披風", "眼鏡"];
    }
    if (phase === "generating" || phase === "personality") {
      if (!collectedInfo.speakingStyle)
        return ["活潑開朗", "溫柔體貼", "酷酷的", "搞笑幽默"];
      if (!collectedInfo.specialAbility)
        return ["講故事", "解數學", "聊天陪伴", "鼓勵我"];
      return ["不用口頭禪", "讚啦！", "沒問題！", "交給我！"];
    }
    return [];
  },

  getProgress: (phase, turnCount) => {
    if (phase === "complete") return 100;
    const phaseIndex = PHASES.indexOf(phase as AvatarPhase);
    const phaseProgress = phaseIndex / (PHASES.length - 1);
    const turnProgress = Math.min(turnCount / MAX_TURNS, 1);
    return Math.min(Math.round((phaseProgress * 0.7 + turnProgress * 0.3) * 100), 99);
  },

  getCoinReward: (phase) => {
    if (phase === "questionnaire") {
      return { amount: COIN_VALUES.ANSWER_AI_QUESTION, reasonPrefix: "回答問題" };
    }
    if (
      phase !== "complete" &&
      phase !== "avatar_ready" &&
      phase !== "intro"
    ) {
      return { amount: COIN_VALUES.ANSWER_TYPE, reasonPrefix: "角色設計" };
    }
    return null;
  },

  getPhaseAfterIntro: () => "appearance",

  getKidModeMarkers: () => "[START_GENERATION]、[AVATAR_READY]",
};

export default createAvatarScript;

