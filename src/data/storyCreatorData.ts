// Story Creator Activity - Data Definitions

export interface GenreOption {
  id: string;
  label: string;
  imagePrompt: string;
  imageUrl: string;
  fillTemplate: FillTemplate;
}

export interface FillTemplate {
  segments: TemplateSegment[];
}

export interface TemplateSegment {
  type: "text" | "blank";
  text?: string;
  blankId?: string;
  options?: DropdownOption[];
}

export interface DropdownOption {
  value: string;
  label: string;
}

export interface InspirationHint {
  id: string;
  text: string;
}

// === Genre Options ===
export const GENRES: GenreOption[] = [
  {
    id: "forest",
    label: "森林冒險",
    imagePrompt: "enchanted forest adventure with magical creatures, children book illustration style, vibrant colors",
    imageUrl: "/images/genres/forest.png",
    fillTemplate: {
      segments: [
        { type: "text", text: "在一座" },
        {
          type: "blank", blankId: "adj",
          options: [
            { value: "神秘", label: "神秘" },
            { value: "美麗", label: "美麗" },
            { value: "巨大", label: "巨大" },
            { value: "閃亮", label: "閃亮" },
          ],
        },
        { type: "text", text: "的森林裡，住著一隻" },
        {
          type: "blank", blankId: "color",
          options: [
            { value: "金色", label: "金色" },
            { value: "藍色", label: "藍色" },
            { value: "粉紅色", label: "粉紅色" },
            { value: "彩虹色", label: "彩虹色" },
          ],
        },
        { type: "text", text: "的" },
        {
          type: "blank", blankId: "animal",
          options: [
            { value: "小兔子", label: "小兔子" },
            { value: "小狐狸", label: "小狐狸" },
            { value: "小熊", label: "小熊" },
            { value: "小鹿", label: "小鹿" },
          ],
        },
        { type: "text", text: "。有一天，牠決定去" },
        {
          type: "blank", blankId: "action",
          options: [
            { value: "探險", label: "探險" },
            { value: "尋寶", label: "尋寶" },
            { value: "交朋友", label: "交朋友" },
            { value: "學魔法", label: "學魔法" },
          ],
        },
        { type: "text", text: "，因為牠想要" },
        {
          type: "blank", blankId: "reason",
          options: [
            { value: "找到好朋友", label: "找到好朋友" },
            { value: "變得更勇敢", label: "變得更勇敢" },
            { value: "幫助大家", label: "幫助大家" },
            { value: "看看世界", label: "看看世界" },
          ],
        },
        { type: "text", text: "。" },
      ],
    },
  },
  {
    id: "ocean",
    label: "海底探險",
    imagePrompt: "underwater ocean adventure with colorful fish and coral reef, children book illustration style",
    imageUrl: "/images/genres/ocean.png",
    fillTemplate: {
      segments: [
        { type: "text", text: "在" },
        {
          type: "blank", blankId: "adj",
          options: [
            { value: "深深", label: "深深" },
            { value: "閃閃發光", label: "閃閃發光" },
            { value: "五彩繽紛", label: "五彩繽紛" },
            { value: "安靜", label: "安靜" },
          ],
        },
        { type: "text", text: "的海底，有一隻" },
        {
          type: "blank", blankId: "color",
          options: [
            { value: "橘色", label: "橘色" },
            { value: "紫色", label: "紫色" },
            { value: "銀色", label: "銀色" },
            { value: "透明", label: "透明" },
          ],
        },
        { type: "text", text: "的" },
        {
          type: "blank", blankId: "animal",
          options: [
            { value: "小魚", label: "小魚" },
            { value: "海龜", label: "海龜" },
            { value: "章魚", label: "章魚" },
            { value: "海馬", label: "海馬" },
          ],
        },
        { type: "text", text: "。牠游過珊瑚礁，想要去" },
        {
          type: "blank", blankId: "action",
          options: [
            { value: "找珍珠", label: "找珍珠" },
            { value: "救朋友", label: "救朋友" },
            { value: "探索沉船", label: "探索沉船" },
            { value: "參加派對", label: "參加派對" },
          ],
        },
        { type: "text", text: "，因為牠覺得" },
        {
          type: "blank", blankId: "reason",
          options: [
            { value: "這會很好玩", label: "這會很好玩" },
            { value: "朋友需要幫忙", label: "朋友需要幫忙" },
            { value: "想要冒險", label: "想要冒險" },
            { value: "那裡有秘密", label: "那裡有秘密" },
          ],
        },
        { type: "text", text: "。" },
      ],
    },
  },
  {
    id: "space",
    label: "太空旅行",
    imagePrompt: "space adventure with cute astronaut and planets stars, children book illustration style, colorful",
    imageUrl: "/images/genres/space.png",
    fillTemplate: {
      segments: [
        { type: "text", text: "在" },
        {
          type: "blank", blankId: "adj",
          options: [
            { value: "遙遠", label: "遙遠" },
            { value: "閃閃發亮", label: "閃閃發亮" },
            { value: "奇妙", label: "奇妙" },
            { value: "寧靜", label: "寧靜" },
          ],
        },
        { type: "text", text: "的太空中，有一個" },
        {
          type: "blank", blankId: "color",
          options: [
            { value: "紅色", label: "紅色" },
            { value: "藍色", label: "藍色" },
            { value: "金色", label: "金色" },
            { value: "彩色", label: "彩色" },
          ],
        },
        { type: "text", text: "的" },
        {
          type: "blank", blankId: "animal",
          options: [
            { value: "小機器人", label: "小機器人" },
            { value: "外星人", label: "外星人" },
            { value: "太空貓", label: "太空貓" },
            { value: "星星精靈", label: "星星精靈" },
          ],
        },
        { type: "text", text: "。牠坐著火箭飛向" },
        {
          type: "blank", blankId: "action",
          options: [
            { value: "月亮", label: "月亮" },
            { value: "彩虹星球", label: "彩虹星球" },
            { value: "銀河", label: "銀河" },
            { value: "神秘黑洞", label: "神秘黑洞" },
          ],
        },
        { type: "text", text: "，因為牠聽說那裡" },
        {
          type: "blank", blankId: "reason",
          options: [
            { value: "有神奇的力量", label: "有神奇的力量" },
            { value: "住著好朋友", label: "住著好朋友" },
            { value: "可以實現願望", label: "可以實現願望" },
            { value: "有好吃的東西", label: "有好吃的東西" },
          ],
        },
        { type: "text", text: "。" },
      ],
    },
  },
  {
    id: "magic",
    label: "魔法王國",
    imagePrompt: "magical kingdom with castle and wizards, children book illustration style, fantasy colorful",
    imageUrl: "/images/genres/magic.png",
    fillTemplate: {
      segments: [
        { type: "text", text: "在" },
        {
          type: "blank", blankId: "adj",
          options: [
            { value: "神奇", label: "神奇" },
            { value: "古老", label: "古老" },
            { value: "夢幻", label: "夢幻" },
            { value: "充滿魔法", label: "充滿魔法" },
          ],
        },
        { type: "text", text: "的王國裡，有一位" },
        {
          type: "blank", blankId: "color",
          options: [
            { value: "穿白袍", label: "穿白袍" },
            { value: "戴星星帽", label: "戴星星帽" },
            { value: "穿彩虹裙", label: "穿彩虹裙" },
            { value: "披金色披風", label: "披金色披風" },
          ],
        },
        { type: "text", text: "的" },
        {
          type: "blank", blankId: "animal",
          options: [
            { value: "小魔法師", label: "小魔法師" },
            { value: "小公主", label: "小公主" },
            { value: "小精靈", label: "小精靈" },
            { value: "小龍", label: "小龍" },
          ],
        },
        { type: "text", text: "。牠想要學會" },
        {
          type: "blank", blankId: "action",
          options: [
            { value: "飛行魔法", label: "飛行魔法" },
            { value: "變身魔法", label: "變身魔法" },
            { value: "治療魔法", label: "治療魔法" },
            { value: "時間魔法", label: "時間魔法" },
          ],
        },
        { type: "text", text: "，這樣就能" },
        {
          type: "blank", blankId: "reason",
          options: [
            { value: "保護大家", label: "保護大家" },
            { value: "找回失去的寶物", label: "找回失去的寶物" },
            { value: "讓大家開心", label: "讓大家開心" },
            { value: "去更遠的地方", label: "去更遠的地方" },
          ],
        },
        { type: "text", text: "。" },
      ],
    },
  },
  {
    id: "dinosaur",
    label: "恐龍世界",
    imagePrompt: "cute dinosaur world with baby dinosaurs playing, children book illustration style, colorful prehistoric",
    imageUrl: "/images/genres/dinosaur.png",
    fillTemplate: {
      segments: [
        { type: "text", text: "在" },
        {
          type: "blank", blankId: "adj",
          options: [
            { value: "好久好久以前", label: "好久好久以前" },
            { value: "溫暖", label: "溫暖" },
            { value: "充滿驚喜", label: "充滿驚喜" },
            { value: "熱鬧", label: "熱鬧" },
          ],
        },
        { type: "text", text: "的恐龍世界，有一隻" },
        {
          type: "blank", blankId: "color",
          options: [
            { value: "綠色", label: "綠色" },
            { value: "粉色", label: "粉色" },
            { value: "藍色", label: "藍色" },
            { value: "橘色", label: "橘色" },
          ],
        },
        { type: "text", text: "的" },
        {
          type: "blank", blankId: "animal",
          options: [
            { value: "小暴龍", label: "小暴龍" },
            { value: "三角龍", label: "三角龍" },
            { value: "翼龍", label: "翼龍" },
            { value: "雷龍", label: "雷龍" },
          ],
        },
        { type: "text", text: "。牠最喜歡" },
        {
          type: "blank", blankId: "action",
          options: [
            { value: "和朋友賽跑", label: "和朋友賽跑" },
            { value: "找好吃的果子", label: "找好吃的果子" },
            { value: "爬上高山看風景", label: "爬上高山看風景" },
            { value: "在河邊玩水", label: "在河邊玩水" },
          ],
        },
        { type: "text", text: "，因為這樣會讓牠" },
        {
          type: "blank", blankId: "reason",
          options: [
            { value: "非常開心", label: "非常開心" },
            { value: "交到新朋友", label: "交到新朋友" },
            { value: "發現新東西", label: "發現新東西" },
            { value: "變得更強壯", label: "變得更強壯" },
          ],
        },
        { type: "text", text: "。" },
      ],
    },
  },
  {
    id: "farm",
    label: "動物農場",
    imagePrompt: "cute animal farm with barn and happy animals, children book illustration style, sunny colorful",
    imageUrl: "/images/genres/farm.png",
    fillTemplate: {
      segments: [
        { type: "text", text: "在一個" },
        {
          type: "blank", blankId: "adj",
          options: [
            { value: "陽光普照", label: "陽光普照" },
            { value: "快樂", label: "快樂" },
            { value: "熱鬧", label: "熱鬧" },
            { value: "美麗", label: "美麗" },
          ],
        },
        { type: "text", text: "的農場上，住著一隻" },
        {
          type: "blank", blankId: "color",
          options: [
            { value: "白色", label: "白色" },
            { value: "棕色", label: "棕色" },
            { value: "黑白相間", label: "黑白相間" },
            { value: "金黃色", label: "金黃色" },
          ],
        },
        { type: "text", text: "的" },
        {
          type: "blank", blankId: "animal",
          options: [
            { value: "小雞", label: "小雞" },
            { value: "小豬", label: "小豬" },
            { value: "小羊", label: "小羊" },
            { value: "小牛", label: "小牛" },
          ],
        },
        { type: "text", text: "。今天農場要舉辦" },
        {
          type: "blank", blankId: "action",
          options: [
            { value: "才藝表演", label: "才藝表演" },
            { value: "運動比賽", label: "運動比賽" },
            { value: "美食大會", label: "美食大會" },
            { value: "音樂會", label: "音樂會" },
          ],
        },
        { type: "text", text: "，牠決定" },
        {
          type: "blank", blankId: "reason",
          options: [
            { value: "勇敢參加", label: "勇敢參加" },
            { value: "幫忙準備", label: "幫忙準備" },
            { value: "邀請大家一起", label: "邀請大家一起" },
            { value: "表演拿手絕活", label: "表演拿手絕活" },
          ],
        },
        { type: "text", text: "。" },
      ],
    },
  },
];

// === Inspiration Hints for Free Writing ===
export const INSPIRATION_HINTS: InspirationHint[] = [
  { id: "hint1", text: "突然，前面出現了..." },
  { id: "hint2", text: "牠遇到了一個..." },
  { id: "hint3", text: "最後，大家一起..." },
];

// Free writing config
export const FREE_WRITING_CONFIG = {
  minChars: 10,
  maxChars: 200,
  placeholder: "接下來會發生什麼事呢？請寫下去...",
};
