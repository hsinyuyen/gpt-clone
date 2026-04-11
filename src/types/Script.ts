// 腳本系統類型定義

export interface Script {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ScriptCategory;
  isAvailable: boolean;
}

export type ScriptCategory = "avatar" | "learning" | "creative" | "utility";

// Avatar 個性設定
export interface AvatarPersonality {
  characterType: string;      // 角色類型
  color: string;              // 顏色
  accessory?: string;         // 配件
  speakingStyle: string;      // 說話風格
  specialAbility: string;     // 特殊能力
  catchphrase?: string;       // 口頭禪
}

// Avatar 類型
export interface UserAvatar {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  imageUrl?: string;
  // 獨立幀模式
  frames?: string[];
  // Sprite sheet 模式
  spriteSheetUrl?: string;
  frameCount?: number;
  gridCols?: number;
  gridRows?: number;
  createdAt: string;
  isActive: boolean;
  // 角色個性設定（全域使用）
  personality?: AvatarPersonality;
}

// 腳本執行狀態（使用 string 以支援動態新增腳本）
export type ActiveScript = string | null;
