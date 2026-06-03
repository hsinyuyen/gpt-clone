// Prompt Engineering 課程：11 堂教學給國小 3-6 年級的小朋友。
// 每一堂教一個 prompt 技巧，玩家寫一個 prompt 給 AI 助理，系統用另一個
// AI 呼叫自動評分。通過拿金幣 + 解鎖下一堂。

export interface PromptLesson {
  id: string;
  /** Display order — must be sequential 1..N */
  order: number;
  title: string;
  technique: string;       // short technique name (e.g. "清楚表達")
  description: string;     // intro paragraph
  badPromptExample: string;
  goodPromptExample: string;
  /** The challenge given to the player */
  challenge: string;
  /** Hint shown when player is stuck */
  hint: string;
  /** Coin reward on completion */
  reward: number;
  /** What the auto-evaluator AI looks for — sent as criteria in the eval prompt */
  evalCriteria: string;
}

export const PROMPT_LESSONS: PromptLesson[] = [
  {
    id: 'lesson_01',
    order: 1,
    title: '第 1 課：清楚表達',
    technique: '清楚表達',
    description:
      '跟 AI 說話的時候，越清楚 AI 就越能幫你做好事。「請幫我寫一個故事」太籠統了，AI 不知道你想要什麼故事。',
    badPromptExample: '寫一個故事',
    goodPromptExample: '請寫一個關於小熊貓在森林裡找蜂蜜的 5 句話故事，要有快樂的結局',
    challenge:
      '請寫一個 prompt，要 AI 幫你寫一個 5 句話的「動物冒險」故事。你的 prompt 必須說清楚：1) 哪一種動物 2) 故事大概有多長 3) 故事的主題（冒險）',
    hint: '範例格式：「請幫我寫一個關於[動物名稱]的[幾句話]冒險故事，主題是...」',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須同時包含：(1) 明確指定一種動物名稱、(2) 指定句數或長度、(3) 明確提到「冒險」或類似主題詞。',
  },
  {
    id: 'lesson_02',
    order: 2,
    title: '第 2 課：給 AI 一個身份',
    technique: '角色扮演',
    description:
      '告訴 AI「你是一個 XXX」，AI 就會用那個身份的方式回答。讓 AI 當數學老師，回答就會像老師；當廚師，就會像廚師。',
    badPromptExample: '解釋什麼是分數',
    goodPromptExample: '你是一個友善的國小數學老師，請用簡單的例子解釋什麼是分數',
    challenge:
      '請寫一個 prompt，要 AI 扮演一個「國小自然科學老師」，並請他向你解釋為什麼天空是藍色的。',
    hint: '開頭就用「你是一個...老師」來給 AI 身份',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須：(1) 明確給 AI 一個老師/科學家/解說員等身份、(2) 提到要解釋「天空為什麼是藍色的」這個問題。',
  },
  {
    id: 'lesson_03',
    order: 3,
    title: '第 3 課：提供範例',
    technique: '範例引導',
    description:
      '給 AI 看你想要的「樣子」，AI 就比較不會做出奇怪的東西。像是教 AI 寫廣告詞，先給他看 1-2 個例子，他就會學起來。',
    badPromptExample: '寫一個冰淇淋的廣告詞',
    goodPromptExample:
      '請寫一個冰淇淋的廣告詞。範例：「巧克力派 — 一口咬下，幸福加倍！」、「草莓糖 — 甜到你笑出來！」現在請幫我寫「抹茶冰淇淋」的廣告詞。',
    challenge:
      '請寫一個 prompt，要 AI 幫你想一個「水果店」的店名。你必須在 prompt 裡提供至少 2 個範例店名，再請 AI 想新的。',
    hint: '範例：「我想開一間水果店。範例好店名：『甜心果園』『清新果舖』。請再想 3 個類似風格的店名。」',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須包含至少 2 個明確的店名範例（用引號或顯眼的方式列出），並請 AI 產生新的。',
  },
  {
    id: 'lesson_04',
    order: 4,
    title: '第 4 課：指定格式',
    technique: '輸出格式',
    description:
      '告訴 AI 你想要什麼格式的回答 —— 列點？表格？短文？AI 就會照那個樣子回答你。',
    badPromptExample: '介紹三個太空人',
    goodPromptExample: '請用「項目符號」列出 3 個有名的太空人，每個只寫一句話介紹。',
    challenge:
      '請寫一個 prompt，要 AI 用「項目符號」或「列點」的方式列出 3 種你最喜歡的食物的優點。',
    hint: '在 prompt 中明確說「請用項目符號 / 列點 / bullet points」',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須明確指定輸出格式（列點 / 項目符號 / 表格 / 編號等），且任務內容合理。',
  },
  {
    id: 'lesson_05',
    order: 5,
    title: '第 5 課：限制長度',
    technique: '長度控制',
    description:
      'AI 有時候會講太多，讓你看不下去。告訴它「只用 50 個字」「最多 3 句話」，回答就會剛剛好。',
    badPromptExample: '介紹台灣',
    goodPromptExample: '請用 50 個字以內介紹台灣的特色',
    challenge:
      '請寫一個 prompt，請 AI 用「3 句話以內」介紹一隻你最喜歡的動物。',
    hint: '在 prompt 寫「請用 X 句話以內」或「請寫 X 個字以內」',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須明確限制長度（句數、字數、段數其中一種），且任務合理。',
  },
  {
    id: 'lesson_06',
    order: 6,
    title: '第 6 課：給背景資訊',
    technique: '提供脈絡',
    description:
      '告訴 AI「我是誰」「我為什麼問這個」「我希望答案多深入」，AI 就能回答得更貼切。',
    badPromptExample: '解釋光合作用',
    goodPromptExample:
      '我是國小四年級的學生，明天要做光合作用的報告。請用我能聽得懂的話，加 1 個小例子，解釋光合作用是什麼。',
    challenge:
      '請寫一個 prompt，告訴 AI 你的「年級」和「為什麼想知道」，請它解釋「電流」是什麼。',
    hint: '範例開頭：「我是國小 X 年級的學生，因為...所以想知道...」',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須包含：(1) 自己的身份/年級、(2) 提問背景或目的、(3) 請 AI 解釋「電流」相關概念。',
  },
  {
    id: 'lesson_07',
    order: 7,
    title: '第 7 課：拆解大問題',
    technique: '逐步思考',
    description:
      '太大的問題 AI 會回得亂七八糟。把它拆成小步驟「先做 A、再做 B、最後做 C」，AI 就會一步步幫你完成。',
    badPromptExample: '幫我規劃一個生日派對',
    goodPromptExample:
      '請幫我規劃一個 10 人的生日派對。請依序回答：(1) 推薦地點 (2) 推薦食物 (3) 推薦活動。',
    challenge:
      '請寫一個 prompt，請 AI 依序教你「如何照顧一隻寵物魚」，要分成至少 3 個步驟。',
    hint: '用「請分步驟說明」「步驟 1、步驟 2...」「依序」這類詞',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須要求 AI 分步驟/編號回答，且至少 3 個步驟，主題是「照顧寵物魚」。',
  },
  {
    id: 'lesson_08',
    order: 8,
    title: '第 8 課：要求修改',
    technique: '迭代調整',
    description:
      'AI 第一次回答如果不夠好，不要放棄！告訴它「再簡單一點」「換一個說法」「再加一個例子」，它就會修改。',
    badPromptExample: '（不好）就這樣算了',
    goodPromptExample:
      '剛才的回答太難了。請用更簡單的話再說一次，並加 1 個生活中的例子。',
    challenge:
      '想像 AI 剛剛給你一個太複雜的回答。請寫一個 prompt 請它「再說簡單一點」、「加一個簡單的例子」、「用小朋友能懂的話」。',
    hint: '把至少 2 個修改要求寫在同一個 prompt 中',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須包含至少 2 個明確的修改要求（如：簡化、舉例、換說法、縮短、解釋專有名詞等）。',
  },
  {
    id: 'lesson_09',
    order: 9,
    title: '第 9 課：避免籠統用詞',
    technique: '具體描述',
    description:
      '「好」「漂亮」「不錯」太籠統，AI 不知道你的「好」是什麼。改成具體一點 —— 「讓人開心又有教育意義」、「色彩鮮豔、有動物角色」。',
    badPromptExample: '幫我想一個好的故事主題',
    goodPromptExample:
      '請幫我想一個故事主題，要符合：(1) 有勇敢的主角 (2) 有友情的元素 (3) 結局是溫暖的',
    challenge:
      '請寫一個 prompt 請 AI 推薦一首歌，但不能用「好聽」這個詞 —— 要用具體的描述（例如：曲風、歌詞主題、聽完的感覺）。',
    hint: '至少要寫 3 個具體要求，例如「節奏輕快」「歌詞勵志」「適合運動時聽」',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須：(1) 不能使用「好聽」這個詞、(2) 提供至少 3 個具體的描述條件（曲風、歌詞主題、情境等）。',
  },
  {
    id: 'lesson_10',
    order: 10,
    title: '第 10 課：用反例引導',
    technique: '反向限定',
    description:
      '除了告訴 AI「要什麼」，也告訴它「不要什麼」。這樣可以避開你不想要的方向。',
    badPromptExample: '幫我想晚餐吃什麼',
    goodPromptExample: '幫我想晚餐吃什麼。要：清淡、營養。不要：油炸、辣的、甜點。',
    challenge:
      '請寫一個 prompt 請 AI 推薦一本適合小學生看的書。你必須寫至少 2 個「不要的條件」（例如：不要太厚、不要恐怖內容...）。',
    hint: '在 prompt 用「不要...」「避免...」「除了...」這類詞',
    reward: 30,
    evalCriteria:
      '玩家的 prompt 必須包含至少 2 個明確的「不要 / 避免 / 排除」條件，主題是推薦書。',
  },
  {
    id: 'lesson_11',
    order: 11,
    title: '第 11 課：綜合應用',
    technique: '全部技巧',
    description:
      '最後一課了！請你把學過的所有技巧 —— 身份、清楚、範例、格式、長度、背景、步驟、具體、反例 —— 全部整合在一個 prompt 中。',
    badPromptExample: '寫詩',
    goodPromptExample:
      '你是一個友善的兒童詩人。我是國小 5 年級學生，要寫一首詩送給媽媽當生日禮物。請寫一首 4 行的詩，主題是感謝媽媽，要：用簡單的詞、有溫暖的感覺、像範例「謝謝媽媽的微笑，像太陽一樣...」這樣。不要使用太難的字。',
    challenge:
      '請寫一個 **完美的 prompt**，要 AI 幫你寫一封給最好的朋友的信。你的 prompt 必須包含：(1) 給 AI 一個身份 (2) 你的背景 (3) 指定格式或長度 (4) 至少一個具體要求 (5) 至少一個「不要」的反例。',
    hint: '把前面 10 課學到的技巧通通用上！',
    reward: 100,
    evalCriteria:
      '玩家的 prompt 必須同時滿足：(1) 給 AI 一個明確身份、(2) 玩家提供自己的背景、(3) 指定長度或格式、(4) 至少一個具體要求、(5) 至少一個「不要 / 避免」反例。要有 5 項全到才能通過。',
  },
];

export const TOTAL_LESSONS = PROMPT_LESSONS.length;
