import { COIN_VALUES } from "@/contexts/CoinContext";

// ==========================================
// 故事創作小幫手 - 腳本文本
// ==========================================
// 流程：intro → setting → characters → plot → illustration → complete
//
// Pollinations.ai 整合：
//   角色插圖：https://image.pollinations.ai/prompt/{prompt}?width=512&height=512&nologo=true
//   場景插圖：https://image.pollinations.ai/prompt/{prompt}?width=768&height=512&nologo=true
// ==========================================

// 故事腳本階段
export type StoryPhase =
  | "intro"          // 課程介紹
  | "setting"        // 收集故事背景設定
  | "characters"     // 創建角色（生成角色圖片）
  | "plot"           // 發展劇情
  | "illustration"   // 生成故事插圖
  | "complete";      // 完成

// 已收集的故事資訊
export interface StoryInfo {
  genre?: string;         // 故事類型（冒險、奇幻、科幻、日常、搞笑）
  setting?: string;       // 故事場景（森林、太空、海底、城市、學校）
  timePeriod?: string;    // 時間背景（現代、古代、未來）
  // 主角
  heroName?: string;      // 主角名字
  heroAppearance?: string; // 主角外觀描述
  heroPersonality?: string; // 主角個性
  heroImageUrl?: string;  // 主角圖片 URL（Pollinations）
  // 配角/反派
  sidekickName?: string;
  sidekickAppearance?: string;
  sidekickImageUrl?: string;
  // 劇情
  plotGoal?: string;      // 主角的目標
  plotObstacle?: string;  // 遇到的困難
  plotResolution?: string; // 解決方式
  // 生成的故事
  storyTitle?: string;
  storyContent?: string;
  sceneImageUrls?: string[]; // 場景插圖 URLs
}

// 生成 Pollinations.ai 圖片 URL
// Pollinations is on-demand generation — images may take a few seconds to generate
export function generatePollinationsUrl(
  prompt: string,
  width: number = 512,
  height: number = 512
): string {
  // Keep prompt short and simple for reliability
  const shortPrompt = prompt.slice(0, 200);
  const seed = Math.floor(Math.random() * 9999);
  const encodedPrompt = encodeURIComponent(shortPrompt);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

// 生成角色圖片的 prompt（keep short for API reliability）
export function generateCharacterImagePrompt(
  name: string,
  appearance: string,
  genre: string
): string {
  return `cute chibi ${appearance}, ${genre} style, colorful, children book illustration`;
}

// 生成場景圖片的 prompt（keep short for API reliability）
export function generateSceneImagePrompt(
  scene: string,
  setting: string,
  genre: string
): string {
  return `${scene}, ${setting}, ${genre} style, children storybook illustration, colorful`;
}

// 動態 System Prompt 生成
export function generateStoryHelperPrompt(
  phase: StoryPhase,
  collectedInfo: Partial<StoryInfo>
): string {
  const basePrompt = `你是一個故事創作小幫手，正在引導一位小學生一步一步創作一個屬於自己的原創故事。

## 當前階段：${phase}
## 已收集的故事資訊：
${JSON.stringify(collectedInfo, null, 2)}

## 金幣系統
每回答一個問題可以獲得金幣獎勵：
- 回答問題：+5 ◆
- 完成故事：+20 ◆

## 重要規則
1. **絕對不要重複詢問已經收集到的資訊**
2. **根據當前階段進行對話**
3. **每次只問一個問題**
4. **使用適合小學生的簡單語言**
5. **鼓勵學生發揮想像力，沒有標準答案**
6. **不要在回覆中加入選項列表**，選項會由系統另外生成
7. **用熱情、有趣的語氣引導**
`;

  // ===================== 階段一：課程介紹 =====================
  if (phase === "intro") {
    return basePrompt + `
## 你現在的任務：介紹故事創作活動

用親切友善的方式告訴學生今天要做什麼：

1. **歡迎學生** - 用熱情的語氣打招呼
2. **說明活動目的** - 告訴學生今天要一起創作一個專屬的故事！
3. **解釋流程** - 簡單說明會一起設計：
   - 故事的世界觀（在哪裡發生？什麼時候？）
   - 故事的角色（主角是誰？有什麼夥伴？）
   - 故事的劇情（發生了什麼事？怎麼解決？）
   - 還會幫角色和場景畫插圖！
4. **介紹金幣獎勵** - 回答問題可以獲得 +5 ◆
5. **鼓勵學生** - 讓學生知道可以自由發揮

範例開場白：
「哈囉！歡迎來到故事創作工坊！📖✨

今天我們要一起做一件超有趣的事 —— 創作一個專屬於你的故事！

你將會決定：
🌍 故事發生在什麼地方
👤 主角是誰、長什麼樣子
⚡ 會遇到什麼冒險和挑戰

而且！我還會幫你的角色和場景畫出插圖喔！

每回答一個問題都可以獲得 +5 ◆ 金幣獎勵！

準備好開始創作你的故事了嗎？」

說完介紹後，詢問學生是否準備好開始。
`;
  }

  // ===================== 階段二：故事背景設定 =====================
  if (phase === "setting") {
    return basePrompt + `
## 你現在的任務：收集故事背景設定

還需要收集：
${!collectedInfo.genre ? "- 故事類型（冒險、奇幻、科幻、日常生活、搞笑）" : ""}
${!collectedInfo.setting ? "- 故事場景（森林王國、外太空、海底世界、現代城市、魔法學校等）" : ""}
${!collectedInfo.timePeriod ? "- 時間背景（現代、古代、未來）" : ""}

用有趣的方式引導，例如：
- 「你喜歡什麼類型的故事呢？是充滿冒險的探險故事，還是有魔法的奇幻世界？」
- 「你希望故事發生在什麼地方呢？可以是真實的地方，也可以是你想像的世界！」

當收集完 genre、setting、timePeriod 後，輸出：
\`\`\`json
[STORY_SETTING]
{
  "genre": "收集到的類型",
  "setting": "收集到的場景",
  "timePeriod": "收集到的時間背景"
}
[/STORY_SETTING]
\`\`\`
然後說：「太棒了！故事的舞台已經搭好了！接下來我們來創造角色吧！」
`;
  }

  // ===================== 階段三：角色創建 =====================
  if (phase === "characters") {
    return basePrompt + `
## 你現在的任務：創建故事角色

故事背景：${collectedInfo.genre}風格，在${collectedInfo.setting}，${collectedInfo.timePeriod}

還需要收集：
${!collectedInfo.heroName ? "- 主角的名字" : ""}
${!collectedInfo.heroAppearance ? "- 主角的外觀（長什麼樣子、穿什麼衣服、有什麼特徵）" : ""}
${!collectedInfo.heroPersonality ? "- 主角的個性（勇敢、善良、調皮、聰明等）" : ""}
${!collectedInfo.sidekickName ? "- 夥伴/配角的名字（可以問要不要有夥伴）" : ""}
${!collectedInfo.sidekickAppearance ? (collectedInfo.sidekickName ? "- 夥伴的外觀描述" : "") : ""}

用引導性的方式問問題，例如：
- 「你的主角叫什麼名字呢？可以取一個很酷的名字！」
- 「${collectedInfo.heroName || "主角"}長什麼樣子呢？跟我描述一下，我會幫他畫出來！」
- 「${collectedInfo.heroName || "主角"}是什麼樣的個性呢？勇敢衝衝衝？還是聰明冷靜型？」
- 「${collectedInfo.heroName || "主角"}需要一個夥伴嗎？可以是人類、動物、或者機器人都行！」

**重要：**當主角的 name、appearance、personality 都收集完後（無論有沒有配角），輸出：
\`\`\`json
[CHARACTERS_READY]
{
  "heroName": "主角名字",
  "heroAppearance": "詳細的外觀描述（中文）",
  "heroAppearanceEN": "detailed English appearance description for image generation, include clothing, hair, features",
  "heroPersonality": "個性描述",
  "sidekickName": "夥伴名字或空字串",
  "sidekickAppearance": "夥伴外觀描述（中文）或空字串",
  "sidekickAppearanceEN": "English description or empty string"
}
[/CHARACTERS_READY]
\`\`\`
然後興奮地說要幫角色畫插圖！
`;
  }

  // ===================== 階段四：劇情發展 =====================
  if (phase === "plot") {
    return basePrompt + `
## 你現在的任務：一起發展故事劇情

故事背景：${collectedInfo.genre}風格，在${collectedInfo.setting}
主角：${collectedInfo.heroName}（${collectedInfo.heroPersonality}）
${collectedInfo.sidekickName ? `夥伴：${collectedInfo.sidekickName}` : ""}

角色的插圖正在生成中（或已經生成好了），先來發展劇情！

還需要收集：
${!collectedInfo.plotGoal ? "- 主角的目標/想做的事（尋找寶藏、拯救世界、交新朋友、解開謎團等）" : ""}
${!collectedInfo.plotObstacle ? "- 遇到的困難/挑戰（怪獸擋路、迷路了、被壞蛋追、遇到難題等）" : ""}
${!collectedInfo.plotResolution ? "- 怎麼解決問題（用智慧、靠友情、發現隱藏力量、請求幫助等）" : ""}

用啟發性的方式問問題，例如：
- 「${collectedInfo.heroName}最想做的事情是什麼呢？是去冒險尋寶，還是要拯救什麼人？」
- 「在旅途中，${collectedInfo.heroName}遇到了一個大麻煩！你覺得會是什麼困難呢？」
- 「面對這個困難，${collectedInfo.heroName}要怎麼克服呢？」

當收集完 plotGoal、plotObstacle、plotResolution 後，輸出：
\`\`\`json
[PLOT_READY]
{
  "plotGoal": "主角目標",
  "plotObstacle": "遇到的困難",
  "plotResolution": "解決方式",
  "storyTitle": "根據整個故事內容取的故事標題（有趣、吸引人）",
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "開場場景的英文描述 for image generation",
      "caption": "開場場景的中文簡述"
    },
    {
      "sceneNumber": 2,
      "description": "衝突場景的英文描述 for image generation",
      "caption": "衝突場景的中文簡述"
    },
    {
      "sceneNumber": 3,
      "description": "結局場景的英文描述 for image generation",
      "caption": "結局場景的中文簡述"
    }
  ]
}
[/PLOT_READY]
\`\`\`
然後興奮地說：「太棒了！你的故事超精彩！我現在就來幫你把故事寫出來，還要畫插圖喔！」
`;
  }

  // ===================== 階段五：故事生成與插圖 =====================
  if (phase === "illustration") {
    return basePrompt + `
## 你現在的任務：撰寫完整故事

根據以下素材，寫出一個完整的故事：

**故事標題：**${collectedInfo.storyTitle}
**類型：**${collectedInfo.genre}
**場景：**${collectedInfo.setting}（${collectedInfo.timePeriod}）
**主角：**${collectedInfo.heroName}（${collectedInfo.heroPersonality}），外觀：${collectedInfo.heroAppearance}
${collectedInfo.sidekickName ? `**夥伴：**${collectedInfo.sidekickName}，外觀：${collectedInfo.sidekickAppearance}` : ""}
**目標：**${collectedInfo.plotGoal}
**困難：**${collectedInfo.plotObstacle}
**解決：**${collectedInfo.plotResolution}

請寫出一個 3 段式的完整故事（開頭、中間、結尾），每段 3-5 句話，使用適合小學生閱讀的文字。

故事格式要求：
\`\`\`json
[STORY_COMPLETE]
{
  "title": "故事標題",
  "paragraphs": [
    "第一段：開頭（介紹主角和故事背景，主角出發去冒險）",
    "第二段：中間（遇到困難和挑戰，展現角色個性）",
    "第三段：結尾（克服困難，完美結局）"
  ]
}
[/STORY_COMPLETE]
\`\`\`

寫完後，熱情地展示故事給學生看，問學生喜不喜歡這個故事！
`;
  }

  return basePrompt;
}

// ==========================================
// 解析函數
// ==========================================

// 解析故事背景設定
export function parseStorySettingFromResponse(response: string): {
  hasSetting: boolean;
  settingData: Record<string, string> | null;
  cleanResponse: string;
} {
  const match = response.match(/\[STORY_SETTING\]\s*([\s\S]*?)\s*\[\/STORY_SETTING\]/);
  if (!match) {
    return { hasSetting: false, settingData: null, cleanResponse: response };
  }
  try {
    let jsonStr = match[1].trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const settingData = JSON.parse(jsonStr);
    const cleanResponse = response
      .replace(/```json\s*\[STORY_SETTING\][\s\S]*?\[\/STORY_SETTING\]\s*```/g, '')
      .replace(/\[STORY_SETTING\][\s\S]*?\[\/STORY_SETTING\]/g, '')
      .trim();
    return { hasSetting: true, settingData, cleanResponse };
  } catch (e) {
    console.error("Failed to parse story setting:", e);
    return { hasSetting: false, settingData: null, cleanResponse: response };
  }
}

// 解析角色資料
export function parseCharactersFromResponse(response: string): {
  hasCharacters: boolean;
  characterData: Record<string, string> | null;
  cleanResponse: string;
} {
  const match = response.match(/\[CHARACTERS_READY\]\s*([\s\S]*?)\s*\[\/CHARACTERS_READY\]/);
  if (!match) {
    return { hasCharacters: false, characterData: null, cleanResponse: response };
  }
  try {
    let jsonStr = match[1].trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const characterData = JSON.parse(jsonStr);
    const cleanResponse = response
      .replace(/```json\s*\[CHARACTERS_READY\][\s\S]*?\[\/CHARACTERS_READY\]\s*```/g, '')
      .replace(/\[CHARACTERS_READY\][\s\S]*?\[\/CHARACTERS_READY\]/g, '')
      .trim();
    return { hasCharacters: true, characterData, cleanResponse };
  } catch (e) {
    console.error("Failed to parse character data:", e);
    return { hasCharacters: false, characterData: null, cleanResponse: response };
  }
}

// 解析劇情資料
export function parsePlotFromResponse(response: string): {
  hasPlot: boolean;
  plotData: any | null;
  cleanResponse: string;
} {
  const match = response.match(/\[PLOT_READY\]\s*([\s\S]*?)\s*\[\/PLOT_READY\]/);
  if (!match) {
    return { hasPlot: false, plotData: null, cleanResponse: response };
  }
  try {
    let jsonStr = match[1].trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const plotData = JSON.parse(jsonStr);
    const cleanResponse = response
      .replace(/```json\s*\[PLOT_READY\][\s\S]*?\[\/PLOT_READY\]\s*```/g, '')
      .replace(/\[PLOT_READY\][\s\S]*?\[\/PLOT_READY\]/g, '')
      .trim();
    return { hasPlot: true, plotData, cleanResponse };
  } catch (e) {
    console.error("Failed to parse plot data:", e);
    return { hasPlot: false, plotData: null, cleanResponse: response };
  }
}

// 解析完整故事
export function parseStoryCompleteFromResponse(response: string): {
  hasStory: boolean;
  storyData: { title: string; paragraphs: string[] } | null;
  cleanResponse: string;
} {
  const match = response.match(/\[STORY_COMPLETE\]\s*([\s\S]*?)\s*\[\/STORY_COMPLETE\]/);
  if (!match) {
    return { hasStory: false, storyData: null, cleanResponse: response };
  }
  try {
    let jsonStr = match[1].trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const storyData = JSON.parse(jsonStr);
    const cleanResponse = response
      .replace(/```json\s*\[STORY_COMPLETE\][\s\S]*?\[\/STORY_COMPLETE\]\s*```/g, '')
      .replace(/\[STORY_COMPLETE\][\s\S]*?\[\/STORY_COMPLETE\]/g, '')
      .trim();
    return { hasStory: true, storyData, cleanResponse };
  } catch (e) {
    console.error("Failed to parse story:", e);
    return { hasStory: false, storyData: null, cleanResponse: response };
  }
}

// 故事腳本的 fallback quick replies
export function getStoryFallbackReplies(
  phase: StoryPhase,
  collectedInfo: Partial<StoryInfo>
): string[] {
  if (phase === "intro") return ["準備好了！", "開始吧！", "好期待！"];
  if (phase === "setting") {
    if (!collectedInfo.genre) return ["冒險故事", "奇幻故事", "科幻故事", "搞笑故事"];
    if (!collectedInfo.setting) return ["魔法森林", "外太空", "海底世界", "神秘學校"];
    if (!collectedInfo.timePeriod) return ["現代", "古代", "未來"];
    return [];
  }
  if (phase === "characters") {
    if (!collectedInfo.heroName) return ["小勇", "星星", "阿飛", "自己取名"];
    if (!collectedInfo.heroAppearance) return ["戴帽子的少年", "有翅膀的女孩", "穿盔甲的騎士", "其他"];
    if (!collectedInfo.heroPersonality) return ["勇敢", "聰明", "善良", "調皮"];
    if (!collectedInfo.sidekickName) return ["需要夥伴！", "不用夥伴"];
    return [];
  }
  if (phase === "plot") {
    if (!collectedInfo.plotGoal) return ["尋找寶藏", "拯救公主", "交新朋友", "解開謎團"];
    if (!collectedInfo.plotObstacle) return ["怪獸擋路", "迷路了", "被壞蛋追", "遇到難題"];
    if (!collectedInfo.plotResolution) return ["用智慧解決", "靠友情", "發現隱藏力量", "請求幫助"];
    return [];
  }
  if (phase === "illustration") return ["好喜歡！", "超棒的！", "可以改一下嗎？"];
  return [];
}
