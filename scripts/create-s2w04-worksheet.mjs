/* 建立 S2-W04 的學習單 Firestore 文件。
 *
 *   node scripts/create-s2w04-worksheet.mjs          # dry run，只印出要寫什麼，不寫入
 *   node scripts/create-s2w04-worksheet.mjs --write  # 實際寫入
 *
 * 為什麼需要這支：管理後台的新增表單沒有 externalGameUrl / gameKey 欄位，
 * 沒有這份文件，學生的學習單列表與後台就不會出現這個遊戲，等於上線了也進不去。
 *
 * ⚠️ gameKey 必須逐字等於遊戲裡的 GAMEKEY（'s2w04'），
 *    tasks[].coins 合計必須等於遊戲能拿到的最大金幣（TOTAL_COINS = 73 = 遊戲 56 ＋ 小老師 17），
 *    否則列表會顯示像「56 / 0」這種對不起來的數字。
 *
 * 班級沿用 S2-W01～W03（ws_s2_w03）的兩個班。
 */
const KEY = "AIzaSyDVnab3BCfnlJH5cRCz_EqaHlP7yQUpK78";
const BASE = "https://firestore.googleapis.com/v1/projects/gpt-clone-68b9f/databases/(default)/documents";
const WRITE = process.argv.includes("--write");
const DOC_ID = "ws_s2_w04";

// 跟 S2-W01～W03 同兩個班（沿用 ws_s2_w03 的設定）
const CLASS_IDS = ["cls_1783062672346_x3ui", "cls_1782986992650_lp84"];

// coins 合計＝73（遊戲逐章給幣 56 ＋ 小老師 TA 17）。
const TASKS = [
  { taskId: "s2w04_intro", label: "前情提要＋學會四種語氣（溫柔／認真／搞笑／有禮貌）", coins: 12 },
  { taskId: "s2w04_act1",  label: "第一幕・找出「是誰」（訪談四人＋把線索連起來）", coins: 14 },
  { taskId: "s2w04_act2",  label: "翻轉＋第二幕・問出「為什麼」（訪談四人＋還原真相）", coins: 16 },
  { taskId: "s2w04_act3",  label: "第三幕・幫大家和好（安撫三人＋和好）", coins: 13 },
  { taskId: "s2w04_done",  label: "破案・大家和好了（全部通關）", coins: 1 },
  { taskId: "s2w04_ta",    label: "當小老師：教一位同學怎麼看情緒選語氣", coins: 17, isOptional: true },
];

const MD = `# S2 W04｜阿問偵探社・第四話：語氣變身術

園遊會前一晚，攤位被弄亂、招牌不見了，大家吵成一團互相怪罪。

今天當偵探，用**對的語氣**問出真相——選錯語氣，對方就什麼都不肯說。

## 今天學什麼

- **看情緒選語氣**：對方害怕→溫柔、嘴硬→認真、鬧脾氣→搞笑、長輩很忙→有禮貌
- **自己把話說出來**：選好語氣，還要自己打一句那個語氣的話，阿問（AI）會幫你看語氣對不對
- **探索地圖**：走到每個人的房子去問話，草地上還會遇到情緒怪
- **三幕故事**：找出「是誰」→ 問出「為什麼」→ 幫大家好好和好

## 記住這句話

> **同一句話，換個語氣，對方肯不肯講差很多。**
`;

const doc = {
  title: "S2 W04｜阿問偵探社・第四話：語氣變身術",
  semester: "S2",
  week: 4,
  gameKey: "s2w04",
  externalGameUrl: "/games/s2-w04-detective-tone.html",
  isPublished: true,
  classId: CLASS_IDS[0],
  classIds: CLASS_IDS,
  tasks: TASKS,
  markdownContent: MD,
  styledHtmlStatus: "none",
  createdBy: "script:create-s2w04-worksheet",
};

// ── 自我檢查 ──
const sum = TASKS.reduce((s, t) => s + t.coins, 0);
const EXPECT = 73;
console.log("=== 要寫入的文件 ===");
console.log(`文件 id      : worksheets/${DOC_ID}`);
console.log(`title        : ${doc.title}`);
console.log(`semester/week: ${doc.semester} / W${doc.week}`);
console.log(`gameKey      : ${doc.gameKey}`);
console.log(`externalGameUrl: ${doc.externalGameUrl}`);
console.log(`isPublished  : ${doc.isPublished}`);
console.log(`classIds     : ${JSON.stringify(doc.classIds)}`);
console.log(`markdownContent: ${MD.length} 字`);
console.log(`\ntasks（${TASKS.length} 個）：`);
for (const t of TASKS) console.log(`   ${t.taskId.padEnd(12)} ${t.label.padEnd(30)} ${String(t.coins).padStart(3)} 金幣${t.isOptional ? "（選修）" : ""}`);
console.log(`\ncoins 合計   : ${sum}   （遊戲最大金幣 = ${EXPECT}）`);
if (sum !== EXPECT) { console.error(`\n❌ 合計對不上，中止。改好再跑。`); process.exit(1); }
console.log("✅ 合計相符");

// 轉成 Firestore REST 的型別格式
const S = (v) => ({ stringValue: v });
const I = (v) => ({ integerValue: String(v) });
const B = (v) => ({ booleanValue: v });
const A = (vs) => ({ arrayValue: { values: vs } });
const M = (o) => ({ mapValue: { fields: o } });
const nowIso = new Date().toISOString();

const fields = {
  title: S(doc.title), semester: S(doc.semester), week: I(doc.week),
  gameKey: S(doc.gameKey), externalGameUrl: S(doc.externalGameUrl),
  isPublished: B(doc.isPublished), classId: S(doc.classId),
  classIds: A(CLASS_IDS.map(S)),
  tasks: A(TASKS.map((t) => M({
    taskId: S(t.taskId), label: S(t.label), coins: I(t.coins),
    ...(t.isOptional ? { isOptional: B(true) } : {}),
  }))),
  markdownContent: S(MD),
  styledHtmlStatus: S(doc.styledHtmlStatus),
  createdBy: S(doc.createdBy),
  createdAt: S(nowIso), updatedAt: S(nowIso), publishedAt: S(nowIso),
};

if (!WRITE) { console.log("\n（dry run，沒有寫入。確認無誤後加 --write）"); process.exit(0); }

// 先確認不會蓋掉既有文件
const chk = await fetch(`${BASE}/worksheets/${DOC_ID}?key=${KEY}`);
if (chk.ok) { console.error(`\n❌ worksheets/${DOC_ID} 已經存在，為了不覆蓋既有資料而中止。`); process.exit(1); }

const r = await fetch(`${BASE}/worksheets?documentId=${DOC_ID}&key=${KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fields }),
});
if (!r.ok) { console.error(`\n❌ 寫入失敗 HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`); process.exit(1); }
console.log(`\n✅ 已建立 worksheets/${DOC_ID}`);
