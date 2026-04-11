// Scripts module — unified exports
// Usage:
//   import { getScript, getDisplayScripts } from "@/scripts";
//   import { ScriptDefinition } from "@/scripts/types";

export { getScript, getAllScripts, getAllScriptMetadata, getDisplayScripts } from "./registry";
export type { ScriptDefinition, ParseResult, PromptOptions } from "./types";

// Re-export individual scripts for direct access
export { default as createAvatarScript } from "./create-avatar";
export { default as storyHelperScript } from "./story-helper";

// Re-export script-specific types and helpers
export type { AvatarPhase, AvatarCollectedInfo } from "./create-avatar";
export type { StoryPhase, StoryInfo, StoryRound } from "./story-helper";
export {
  generatePollinationsUrl,
  generateCharacterImagePrompt,
  generateSceneImagePrompt,
} from "./story-helper";
export {
  generateQuestionnairePrompt,
  generateForceStartGenerationPrompt,
  generateForceAvatarReadyPrompt,
} from "./create-avatar";
