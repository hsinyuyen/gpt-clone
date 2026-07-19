// Script Registry
// Import all script definitions here. To add a new script, just:
// 1. Create a new file in src/scripts/ (e.g. math-tutor.ts)
// 2. Import and register it below

import { ScriptDefinition, Script } from "./types";
import createAvatarScript from "./create-avatar";
import storyHelperScript from "./story-helper";

// All registered scripts
const scriptDefinitions: ScriptDefinition[] = [
  createAvatarScript,
  storyHelperScript,
  // Add new scripts here:
  // mathTutorScript,
  // englishBuddyScript,
];

// Lookup map by script ID
const scriptMap = new Map<string, ScriptDefinition>(
  scriptDefinitions.map((s) => [s.metadata.id, s])
);

// Get a script definition by ID
export function getScript(id: string): ScriptDefinition | undefined {
  return scriptMap.get(id);
}

// Get all script metadata (for ScriptPanel display)
export function getAllScriptMetadata(): Script[] {
  return scriptDefinitions.map((s) => s.metadata);
}

// Get all script definitions
export function getAllScripts(): ScriptDefinition[] {
  return scriptDefinitions;
}

// External scripts — clicking opens a standalone page (game / worksheet) instead of an in-chat script
const externalScripts: Script[] = [
  {
    id: "ai-picturebook",
    name: "AI 繪本製作",
    description: "4 堂示範課｜選一堂開始，做一本自己的繪本。第 1 堂：認識你的主角。",
    icon: "picturebook",
    category: "creative",
    isAvailable: true,
    externalUrl: "/courses/ai-picturebook.html",
  },
  {
    id: "game-lab",
    name: "遊戲開發模擬器",
    description: "S5-W15｜學做一款躲隕石遊戲，最後真的能玩！",
    icon: "game",
    category: "learning",
    isAvailable: true,
    externalUrl: "/games/s5-w15-game-simulator.html",
  },
];

// Placeholder scripts (not yet implemented, shown as "coming soon")
const placeholderScripts: Script[] = [
  {
    id: "math-tutor",
    name: "數學小老師",
    description: "讓 AI 幫你解數學題",
    icon: "math",
    category: "learning",
    isAvailable: false,
  },
  {
    id: "english-buddy",
    name: "英文學習夥伴",
    description: "和 AI 一起練習英文對話",
    icon: "english",
    category: "learning",
    isAvailable: false,
  },
];

// Get all scripts for display (including external links and placeholders)
export function getDisplayScripts(): Script[] {
  return [...getAllScriptMetadata(), ...externalScripts, ...placeholderScripts];
}
