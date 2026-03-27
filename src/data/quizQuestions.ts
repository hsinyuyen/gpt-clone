// AI & Programming quiz questions for dungeon mini-game
// Targeted at elementary school kids (grades 1-3) - simple concepts

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // AI Basics
  {
    question: "AI 的全名是什麼?",
    options: ["人工智慧", "自動機器", "超級電腦", "網際網路"],
    correctIndex: 0,
  },
  {
    question: "哪一個是 AI 助手?",
    options: ["ChatGPT", "計算機", "電風扇", "冰箱"],
    correctIndex: 0,
  },
  {
    question: "AI 可以幫我們做什麼?",
    options: ["回答問題", "煮飯", "下雨", "長高"],
    correctIndex: 0,
  },
  {
    question: "AI 是用什麼學習的?",
    options: ["資料", "食物", "陽光", "空氣"],
    correctIndex: 0,
  },
  {
    question: "跟 AI 說話叫做什麼?",
    options: ["下指令", "唱歌", "跑步", "畫畫"],
    correctIndex: 0,
  },
  {
    question: "AI 畫的圖是誰創造的?",
    options: ["電腦程式", "外星人", "魔法師", "老師"],
    correctIndex: 0,
  },
  {
    question: "AI 能不能自己思考?",
    options: ["不能，它只是模仿", "可以", "有時候可以", "看心情"],
    correctIndex: 0,
  },
  {
    question: "哪個不是 AI 能做的事?",
    options: ["真的感受開心", "辨識圖片", "翻譯語言", "寫文章"],
    correctIndex: 0,
  },
  // Programming Basics
  {
    question: "寫程式的人叫做什麼?",
    options: ["程式設計師", "廚師", "醫生", "司機"],
    correctIndex: 0,
  },
  {
    question: "電腦看得懂什麼語言?",
    options: ["程式語言", "英文", "中文", "日文"],
    correctIndex: 0,
  },
  {
    question: "程式裡的 bug 是什麼?",
    options: ["程式的錯誤", "真的蟲子", "新功能", "遊戲角色"],
    correctIndex: 0,
  },
  {
    question: "哪個是程式語言?",
    options: ["Python", "熊貓語", "鳥語", "花語"],
    correctIndex: 0,
  },
  {
    question: "迴圈是什麼意思?",
    options: ["重複做一件事", "轉圈圈", "回家", "睡覺"],
    correctIndex: 0,
  },
  {
    question: "程式的 if 是什麼意思?",
    options: ["如果...就...", "總是", "永遠不要", "也許"],
    correctIndex: 0,
  },
  {
    question: "變數像什麼?",
    options: ["一個可以放東西的盒子", "一條魚", "一棵樹", "一朵花"],
    correctIndex: 0,
  },
  {
    question: "電腦用什麼數字系統?",
    options: ["0 和 1", "1 到 10", "注音符號", "英文字母"],
    correctIndex: 0,
  },
  {
    question: "演算法是什麼?",
    options: ["解決問題的步驟", "一種食物", "一首歌", "一個玩具"],
    correctIndex: 0,
  },
  {
    question: "網頁是用什麼做的?",
    options: ["HTML", "黏土", "積木", "紙張"],
    correctIndex: 0,
  },
  {
    question: "機器人需要什麼才能動?",
    options: ["程式和電力", "食物和水", "陽光和空氣", "書本和筆"],
    correctIndex: 0,
  },
  {
    question: "Scratch 是什麼?",
    options: ["小朋友的程式語言", "一種動物", "一個國家", "一種食物"],
    correctIndex: 0,
  },
];

// Shuffle options for a question (so correct answer isn't always first)
export function shuffleQuestion(q: QuizQuestion): QuizQuestion {
  const indices = [0, 1, 2, 3];
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return {
    question: q.question,
    options: indices.map((i) => q.options[i]),
    correctIndex: indices.indexOf(q.correctIndex),
  };
}

// Get a random subset of questions
export function getRandomQuestions(count: number): QuizQuestion[] {
  const shuffled = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(shuffleQuestion);
}
