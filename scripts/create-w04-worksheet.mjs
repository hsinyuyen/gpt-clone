/* 建立 P1U-W04 的學習單 Firestore 文件。
 *
 *   node scripts/create-w04-worksheet.mjs          # dry run，只印出要寫什麼，不寫入
 *   node scripts/create-w04-worksheet.mjs --write  # 實際寫入
 *
 * 為什麼需要這支：管理後台的新增表單沒有 externalGameUrl / gameKey 欄位，
 * 沒有這份文件，學生的學習單列表就不會出現這個遊戲，等於上線了也進不去。
 *
 * ⚠️ gameKey 必須逐字等於遊戲裡的 GAMEKEY（'p1uw04'），
 *    tasks[].coins 合計必須等於遊戲的 TOTAL_COINS（375），
 *    否則列表會顯示像「250 / 0」這種對不起來的數字，而且很難察覺。
 */
const KEY = "AIzaSyDVnab3BCfnlJH5cRCz_EqaHlP7yQUpK78";
const BASE = "https://firestore.googleapis.com/v1/projects/gpt-clone-68b9f/databases/(default)/documents";
const WRITE = process.argv.includes("--write");
const DOC_ID = "ws_p1u_w04";

// 跟 W01–W03 同兩個班（沿用 ws_p1u_w03 的設定）
const CLASS_IDS = ["cls_1776246403295_x65q", "cls_1782986992650_lp84"];

const TASKS = [
  { taskId: "w04_b1", label: "打退第 1 隻 · 拳擊章魚", coins: 25 },
  { taskId: "w04_b2", label: "打退第 2 隻 · 燈籠章魚", coins: 25 },
  { taskId: "w04_b3", label: "打退第 3 隻 · 吸盤章魚", coins: 25 },
  { taskId: "w04_b4", label: "打退第 4 隻 · 毒刺章魚", coins: 25 },
  { taskId: "w04_b5", label: "打退第 5 隻 · 雙頭章魚", coins: 25 },
  { taskId: "w04_b6", label: "打退第 6 隻 · 炸彈章魚", coins: 25 },
  { taskId: "w04_b7", label: "破甲！打退鐵甲章魚", coins: 25 },
  { taskId: "w04_forge", label: "採集晶石 · 強化武器（7 次）", coins: 35 },
  { taskId: "w04_done", label: "突破軍團防線 · 全部通關", coins: 40 },
  { taskId: "w04_ta", label: "當小老師：教一位同學怎麼破甲", coins: 125, isOptional: true },
];

const MD = `# P1 W04｜突破軍團防線：連戰・破甲・採集強化

上一集你打退了章魚先鋒，寶石守住了——但隊長逃回去叫來了**大軍**。

今天要一路打退**七隻**大章魚，深入軍團基地拿到**破甲鑽頭**，最後突破防線。

## 今天學什麼

- **兩手齊發**：左手按住鍵盤、右手用滑鼠，兩隻手要同時做對才算數（承 W03）
- **破甲**：鐵甲章魚普通打會「叮」一聲彈開，要按住 S ＋ 快點左鍵把殼鑽裂
- **採集 → 強化**：每一章之間去撿貝殼晶石，回強化台換武器升級
- **戰前備戰**：出發前挑一個道具，挑對這一隻明顯比較好打

## 操作

| 招式 | 怎麼做 |
| --- | --- |
| 打 | 按住 \`D\` ＋ 點左鍵 |
| 擋住 | 按住 \`A\` ＋ 點右鍵 |
| 用力打 | 按住 \`S\` ＋ 連點兩下 |
| 放魔法 | 按住 \`W\` ＋ 滾輪往前 |
| **鑽破鐵甲** | 按住 \`S\` ＋ **快點左鍵 4 下** |

游泳、探索用 \`W\` \`A\` \`S\` \`D\`。

## 記住這句話

> **有鐵甲？先用力鑽！**
`;

const doc = {
  title: "P1 W04｜突破軍團防線：連戰・破甲・採集強化",
  semester: "P1",
  week: 4,
  gameKey: "p1uw04",
  externalGameUrl: "/games/p1u-w04-octopus-siege.html",
  isPublished: true,
  classId: CLASS_IDS[0],
  classIds: CLASS_IDS,
  tasks: TASKS,
  markdownContent: MD,
  styledHtmlStatus: "none",
  createdBy: "script:create-w04-worksheet",
};

// ── 自我檢查 ──
const sum = TASKS.reduce((s, t) => s + t.coins, 0);
const EXPECT = 375;
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
for (const t of TASKS) console.log(`   ${t.taskId.padEnd(10)} ${t.label.padEnd(28)} ${String(t.coins).padStart(3)} 金幣${t.isOptional ? "（選修）" : ""}`);
console.log(`\ncoins 合計   : ${sum}   （遊戲的 TOTAL_COINS = ${EXPECT}）`);
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
