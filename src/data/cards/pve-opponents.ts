// PvE Opponent Definitions

import { PveOpponent } from '@/types/Card';

export const PVE_OPPONENTS: PveOpponent[] = [
  {
    id: 'pve_01', lessonId: 'lesson_01',
    name: '迷路的小火苗',
    description: '一個剛學會戰鬥的小火苗，很好對付！',
    difficulty: 'easy',
    teamCardIds: ['basic_fire_01', 'basic_fire_05', 'basic_earth_07'],
    teamLevels: [1, 1, 1],
    rewardCoins: 100,
    rewardXp: 10,
    emoji: '🔥',
  },
  {
    id: 'pve_02', lessonId: 'lesson_02',
    name: '水族巡邏隊',
    description: '海底的巡邏隊，小心他們的水攻擊！',
    difficulty: 'easy',
    teamCardIds: ['basic_water_01', 'basic_water_02', 'basic_water_05'],
    teamLevels: [2, 1, 2],
    rewardCoins: 140,
    rewardXp: 12,
    emoji: '🐢',
  },
  {
    id: 'pve_03', lessonId: 'lesson_03',
    name: '森林守衛團',
    description: '保護森林的守衛們，防禦力很高！',
    difficulty: 'easy',
    teamCardIds: ['basic_earth_01', 'basic_earth_02', 'basic_earth_05', 'basic_earth_07'],
    teamLevels: [2, 2, 2, 1],
    rewardCoins: 180,
    rewardXp: 15,
    emoji: '🌳',
  },
  {
    id: 'pve_04', lessonId: 'lesson_04',
    name: '雷電突擊隊',
    description: '速度極快的電系小隊，要小心被電到！',
    difficulty: 'medium',
    teamCardIds: ['basic_electric_01', 'basic_electric_02', 'basic_electric_03', 'basic_wind_01'],
    teamLevels: [3, 3, 3, 2],
    rewardCoins: 220,
    rewardXp: 20,
    emoji: '⚡',
  },
  {
    id: 'pve_05', lessonId: 'lesson_05',
    name: '暴風騎士團',
    description: '來自天空的精銳騎士團！',
    difficulty: 'medium',
    teamCardIds: ['basic_wind_03', 'basic_wind_06', 'basic_wind_02', 'basic_fire_03'],
    teamLevels: [3, 3, 3, 3],
    rewardCoins: 260,
    rewardXp: 22,
    emoji: '🌪️',
  },
  {
    id: 'pve_06', lessonId: 'lesson_06',
    name: '冰火雙煞',
    description: '水與火的組合，攻守兼備的強敵！',
    difficulty: 'medium',
    teamCardIds: ['basic_fire_04', 'basic_water_04', 'basic_fire_06', 'basic_water_03'],
    teamLevels: [4, 4, 3, 3],
    rewardCoins: 300,
    rewardXp: 25,
    emoji: '🔥',
  },
  {
    id: 'pve_07', lessonId: 'lesson_07',
    name: '高科技先遣隊',
    description: '來自高科技都市的先遣部隊，裝備精良！',
    difficulty: 'medium',
    teamCardIds: ['htc_01', 'htc_05', 'htc_09', 'htc_11', 'htc_03'],
    teamLevels: [3, 3, 4, 4, 3],
    rewardCoins: 340,
    rewardXp: 28,
    emoji: '🛸',
  },
  {
    id: 'pve_08', lessonId: 'lesson_08',
    name: '元素長老會',
    description: '四大元素的長老聯手，超強陣容！',
    difficulty: 'hard',
    // Mix: low-level fodder for tribute summoning + the level-5 elders
    teamCardIds: [
      'basic_fire_01', 'basic_water_01', 'basic_earth_01', // tribute fodder
      'basic_fire_04', 'basic_water_04', 'basic_earth_04', 'basic_wind_04', 'basic_electric_04',
    ],
    teamLevels: [3, 3, 3, 5, 5, 5, 5, 5],
    rewardCoins: 380,
    rewardXp: 35,
    emoji: '👑',
  },
  {
    id: 'pve_09', lessonId: 'lesson_09',
    name: '高科技都市 BOSS',
    description: '都市核心 AI 和它的精銳護衛隊！',
    difficulty: 'hard',
    // Mix: low-level htc fodder + boss cards
    teamCardIds: [
      'htc_01', 'htc_03', 'htc_05', 'htc_09',  // low-level fodder
      'htc_19', 'htc_15', 'htc_16', 'htc_17', 'htc_18',
    ],
    teamLevels: [3, 3, 3, 4, 6, 5, 5, 5, 5],
    rewardCoins: 420,
    rewardXp: 40,
    emoji: '🏙️',
  },
  {
    id: 'pve_10', lessonId: 'lesson_10',
    name: '傳說守護者',
    description: '四大傳說卡牌聯手！最終挑戰！',
    difficulty: 'hard',
    // Mix: low-level fodder so the AI can actually tribute-summon the legendaries
    teamCardIds: [
      'basic_fire_01', 'basic_water_01', 'basic_earth_01',
      'basic_wind_01', 'basic_electric_01',
      'basic_fire_04', 'basic_water_04',
      'basic_fire_08', 'basic_water_08', 'basic_earth_08', 'basic_wind_08', 'basic_electric_08',
    ],
    teamLevels: [3, 3, 3, 3, 3, 5, 5, 7, 7, 7, 7, 7],
    rewardCoins: 460,
    rewardXp: 50,
    emoji: '🌟',
  },
  {
    id: 'pve_nightmare_01', lessonId: 'lesson_11',
    name: '蠕蟲噩夢之主・歐布利沃',
    description: '⚠ 噩夢級 ⚠ 駕馭蠕蟲連鎖與終極戰爭機器的雙重災厄。它的開局運氣詭異地完美，戰術冷酷無情 — 你準備好品嚐絕望了嗎？',
    difficulty: 'nightmare',
    // Deck weighted with worm chain pieces + ammo + emperor + war machine
    teamCardIds: [
      'worm_egg',           // 搜尋 worm_1
      'worm_1',             // 連鎖起點
      'worm_2',             // 連鎖第二環（cannotNormalSummon — 由效果出場）
      'worm_3',             // 連鎖第三環
      'worm_emperor',       // 蠕蟲帝王（可由 worm_3 獻祭手牌召喚）
      'worm_hunter',        // 死後召喚 worm_1（保險）
      'worm_spawner',       // 抽 2 張卡
      'mainframe_worm',     // 主機蠕蟲（需獻祭 蠕蟲帝王 + 終極戰爭機器）
      'htc_20',             // 終極戰爭機器（mainframe 召喚素材）
      'abyss_tentacle',     // 450 ATK 獻祭素材
      'void_beast',         // 300 ATK 獻祭素材
      'abyss_tentacle',
      'void_beast',
      'worm_1',
      'worm_hunter',
    ],
    teamLevels: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
    aiStrategy: 'worm_combo',
    // Stack the opening hand for maximum opening pressure (lucky draws)
    guaranteedOpening: ['worm_egg', 'worm_1', 'worm_hunter', 'abyss_tentacle', 'void_beast'],
    rewardCoins: 500,
    rewardXp: 200,
    emoji: '☠️',
  },
];
