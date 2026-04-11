// Script system — standard interface for all scripts
// To add a new script, create a new file that exports a ScriptDefinition object.

import { Script, ScriptCategory } from "@/types/Script";

// Each script file must export an object conforming to this interface
export interface ScriptDefinition {
  // Metadata (shown in ScriptPanel)
  metadata: Script;

  // Phase configuration
  phases: string[];
  initialPhase: string;
  maxTurns: number;

  // Terminal display
  terminalTitle: string; // e.g. "AVATAR_CREATOR"
  sessionMode: string;   // e.g. "INTERACTIVE DESIGN"

  // The display name for AI messages (e.g. collected avatar name, or fixed "故事小幫手")
  getAvatarName: (state: Record<string, any>) => string | undefined;

  // Generate system prompt for a given phase
  generatePrompt: (phase: string, state: Record<string, any>, options?: PromptOptions) => string;

  // Generate the initial message prompt (first API call when script starts)
  getInitPrompt: (state: Record<string, any>) => string;
  getInitUserMessage: () => string;

  // Parse AI response for structured data tags
  // Returns an array of parsed results (a response may contain multiple tags)
  parseResponse: (response: string) => ParseResult[];

  // Fallback quick replies when API generation fails
  getFallbackReplies: (phase: string, state: Record<string, any>) => string[];

  // Calculate progress percentage (0-100)
  getProgress: (phase: string, turnCount: number) => number;

  // Determine coin reward for a user message in a given phase
  getCoinReward: (phase: string) => { amount: number; reasonPrefix: string } | null;

  // Handle phase transition when user sends first message in intro
  getPhaseAfterIntro: () => string;

  // Kid mode suffix for system prompt
  getKidModeMarkers: () => string;
}

export interface PromptOptions {
  kidMode?: boolean;
  forceGeneration?: boolean;
  forceData?: Record<string, any>;
}

export interface ParseResult {
  tag: string;                          // e.g. "START_GENERATION", "AVATAR_READY", "STORY_SETTING"
  data: Record<string, any>;
  cleanResponse: string;                // response with this tag's data removed
  nextPhase?: string;                   // phase to transition to
}

// Re-export for convenience
export type { Script, ScriptCategory };
