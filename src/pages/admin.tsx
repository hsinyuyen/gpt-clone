import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers, getCoinState, saveCoinState, CoinState, getGlobalActivityState, setGlobalActivityState, getAnnouncement, saveAnnouncement, getFeatureFlags, saveFeatureFlags, FeatureFlags } from "@/lib/firestore";
import { User } from "@/types/User";
import { ActivityState } from "@/types/Activity";
import { ACTIVITIES } from "@/data/activityRegistry";
import NumberField from "@/components/admin/NumberField";

interface UserRow {
  user: User;
  coins: CoinState | null;
}

type AdminTab = "students" | "classroom" | "system";

const ADMIN_USERNAMES = ["admin", "teacher", "老師"];

// 定義在元件外面：放在 AdminPage 裡面的話每次 render 都是新的元件型別，
// React 會整段 unmount/remount，裡面的輸入框會在每次打字後失去焦點。
const Card: React.FC<{ title: string; desc?: string; accent?: string; children: React.ReactNode }> = ({
  title, desc, accent = "var(--terminal-primary)", children,
}) => (
  <section className="border border-[var(--terminal-primary-dim)]/60 bg-black/20">
    <div className="px-4 py-2.5 border-b border-[var(--terminal-primary-dim)]/40">
      <div className="text-sm font-bold" style={{ color: accent }}>{title}</div>
      {desc && <div className="text-xs text-[var(--terminal-primary-dim)] mt-0.5">{desc}</div>}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bonusAmount, setBonusAmount] = useState(10);
  const [bonusReason, setBonusReason] = useState("課堂獎勵");
  const [actionMsg, setActionMsg] = useState("");
  const [deductAmount, setDeductAmount] = useState(10);
  const [deductReason, setDeductReason] = useState("兌換獎品");
  const [deductMsg, setDeductMsg] = useState("");
  const [accessBypass, setAccessBypass] = useState(false);
  const [activityState, setActivityState] = useState<ActivityState>({
    activeActivityId: null,
    activatedAt: null,
    activatedBy: null,
  });
  const [activityLoading, setActivityLoading] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [announcementSaved, setAnnouncementSaved] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ cardGameEnabled: true });
  const [featureFlagsSaved, setFeatureFlagsSaved] = useState(false);
  const [tab, setTab] = useState<AdminTab>("students");
  const [coinMode, setCoinMode] = useState<"add" | "deduct">("add");

  const isAdmin = user && (ADMIN_USERNAMES.includes(user.username.toLowerCase()) || accessBypass);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      console.log("[Admin] Loading all users...");
      const allUsers = await getAllUsers();
      console.log("[Admin] Got users:", allUsers.length);
      const rows: UserRow[] = await Promise.all(
        allUsers.map(async (u) => {
          const coins = await getCoinState(u.id);
          return { user: u, coins };
        })
      );
      // Sort by last active (newest first)
      rows.sort((a, b) =>
        new Date(b.user.lastActiveAt).getTime() - new Date(a.user.lastActiveAt).getTime()
      );
      setUsers(rows);
      console.log("[Admin] Loaded", rows.length, "user rows");
    } catch (err: any) {
      console.error("[Admin] Failed to load users:", err);
      setError(err?.message || "無法載入用戶資料，請檢查 Firestore 權限");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
      return;
    }
    if (user && isAdmin) {
      loadUsers();
      getGlobalActivityState().then(setActivityState);
      getAnnouncement().then((msg) => {
        if (msg) setAnnouncement(msg);
      }).catch(() => {});
      getFeatureFlags().then(setFeatureFlags).catch(() => {});
    }
  }, [user, isLoading, isAdmin, router, loadUsers]);

  const filteredUsers = users.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.user.username.toLowerCase().includes(q) ||
      (r.user.displayName || "").toLowerCase().includes(q)
    );
  });

  const toggleSelect = (id: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map((r) => r.user.id)));
    }
  };

  const handleAddCoins = async () => {
    if (selectedUsers.size === 0) {
      setActionMsg("請先選擇學生");
      return;
    }
    if (bonusAmount <= 0) {
      setActionMsg("金幣數量必須大於 0");
      return;
    }

    const targets = users.filter((r) => selectedUsers.has(r.user.id));
    let success = 0;

    for (const row of targets) {
      try {
        const current: CoinState = row.coins || { balance: 0, totalEarned: 0, transactions: [] };
        const transaction = {
          id: `tx_admin_${Date.now()}_${row.user.id}`,
          amount: bonusAmount,
          reason: `[老師] ${bonusReason}`,
          timestamp: new Date().toISOString(),
        };
        const newState: CoinState = {
          balance: current.balance + bonusAmount,
          totalEarned: current.totalEarned + bonusAmount,
          transactions: [transaction, ...current.transactions].slice(0, 100),
        };
        await saveCoinState(row.user.id, newState);
        success++;
      } catch (err) {
        console.error(`Failed to add coins to ${row.user.username}:`, err);
      }
    }

    setActionMsg(`已成功發放 ${bonusAmount} 金幣給 ${success} 位學生！`);
    setSelectedUsers(new Set());
    setTimeout(() => setActionMsg(""), 3000);
    loadUsers();
  };

  const handleDeductCoins = async () => {
    if (selectedUsers.size === 0) {
      setDeductMsg("請先選擇學生");
      return;
    }
    if (deductAmount <= 0) {
      setDeductMsg("扣除數量必須大於 0");
      return;
    }

    const targets = users.filter((r) => selectedUsers.has(r.user.id));
    let success = 0;
    let insufficientUsers: string[] = [];

    for (const row of targets) {
      try {
        const current: CoinState = row.coins || { balance: 0, totalEarned: 0, transactions: [] };
        if (current.balance < deductAmount) {
          insufficientUsers.push(row.user.displayName || row.user.username);
          continue;
        }
        const transaction = {
          id: `tx_deduct_${Date.now()}_${row.user.id}`,
          amount: -deductAmount,
          reason: `[核銷] ${deductReason}`,
          timestamp: new Date().toISOString(),
        };
        const newState: CoinState = {
          balance: current.balance - deductAmount,
          totalEarned: current.totalEarned,
          transactions: [transaction, ...current.transactions].slice(0, 100),
        };
        await saveCoinState(row.user.id, newState);
        success++;
      } catch (err) {
        console.error(`Failed to deduct coins from ${row.user.username}:`, err);
      }
    }

    let msg = `已成功扣除 ${deductAmount} 金幣，共 ${success} 位學生`;
    if (insufficientUsers.length > 0) {
      msg += `（${insufficientUsers.join("、")} 餘額不足，已跳過）`;
    }
    setDeductMsg(msg);
    setSelectedUsers(new Set());
    setTimeout(() => setDeductMsg(""), 5000);
    loadUsers();
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("zh-TW", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading || !user) {
    return (
      <main className="w-full h-screen flex items-center justify-center bg-[var(--terminal-bg)]">
        <div className="text-[var(--terminal-primary)]">載入中...</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="w-full h-screen flex flex-col items-center justify-center bg-[var(--terminal-bg)] text-[var(--terminal-primary)] gap-4">
        <div className="text-lg">⛔ 權限不足</div>
        <div className="text-sm text-[var(--terminal-primary-dim)]">
          目前登入帳號: <span className="text-yellow-400">{user?.username || "未知"}</span>
        </div>
        <div className="text-xs text-[var(--terminal-primary-dim)]">
          允許的管理員帳號: {ADMIN_USERNAMES.join(", ")}
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
          >
            ← 返回主頁
          </button>
          <button
            onClick={() => setAccessBypass(true)}
            className="px-4 py-2 text-sm border border-yellow-400 text-yellow-400 hover:bg-yellow-400/20"
          >
            臨時存取（開發用）
          </button>
        </div>
      </main>
    );
  }

  const TABS: { id: AdminTab; label: string; hint: string }[] = [
    { id: "students", label: "學生與金幣", hint: "查看學生、發放／核銷金幣" },
    { id: "classroom", label: "課堂經營", hint: "公告、課堂分類、活動模式" },
    { id: "system", label: "系統與素材", hint: "功能開關、卡片與學習單管理" },
  ];

  const TOOLS = [
    { label: "卡片圖片", path: "/admin/card-images", color: "#c084fc" },
    { label: "卡片動畫", path: "/admin/card-animations", color: "#facc15" },
    { label: "任務卡圖", path: "/admin/quest-images", color: "#22d3ee" },
    { label: "學習單", path: "/admin/worksheets", color: "#4ade80" },
  ];

  const selectedCount = selectedUsers.size;
  const totalCoins = users.reduce((sum, r) => sum + (r.coins?.balance || 0), 0);

  return (
    <main className="w-full min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)]">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[var(--terminal-bg)] border-b border-[var(--terminal-primary-dim)]/60">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-lg font-bold glow-text whitespace-nowrap">ADMIN_PANEL</h1>
            <span className="text-xs text-[var(--terminal-primary-dim)] truncate">
              {user?.username} · {users.length} 位學生 · 流通 {totalCoins} ◆
            </span>
          </div>
          <button
            onClick={() => router.push("/")}
            className="px-3 py-1.5 text-xs border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 whitespace-nowrap"
          >
            ← 返回主頁
          </button>
        </div>

        {/* ── Tabs ───────────────────────────────────────────── */}
        <nav className="max-w-[1400px] mx-auto px-4 md:px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.hint}
              className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[var(--terminal-primary)] text-[var(--terminal-primary)] font-bold"
                  : "border-transparent text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── 選了學生才出現的金幣操作列（黏在頁首下方，發放結果也在這裡） ── */}
        {tab === "students" && selectedCount > 0 && (
          <div className="border-t border-[var(--terminal-primary)]/40 bg-[var(--terminal-primary)]/5">
            <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold whitespace-nowrap">
                    已選 <span className="text-yellow-400">{selectedCount}</span> 位
                  </span>
                  <button
                    onClick={() => setSelectedUsers(new Set())}
                    className="text-xs border border-[var(--terminal-primary-dim)] px-2 py-0.5 hover:bg-[var(--terminal-primary)]/10"
                  >
                    清除
                  </button>
                </div>

                <div className="flex">
                  {([["add", "發放金幣", "#facc15"], ["deduct", "核銷扣點", "#f87171"]] as const).map(([m, label, col]) => (
                    <button
                      key={m}
                      onClick={() => setCoinMode(m)}
                      className="px-3 py-1.5 text-sm font-bold border-2 transition-colors whitespace-nowrap"
                      style={
                        coinMode === m
                          ? { borderColor: col, background: col, color: "#000" }
                          : { borderColor: "var(--terminal-primary-dim)", color: "var(--terminal-primary-dim)" }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                  <NumberField
                    value={coinMode === "add" ? bonusAmount : deductAmount}
                    onChange={(v) => (coinMode === "add" ? setBonusAmount(v) : setDeductAmount(v))}
                    min={1}
                    max={9999}
                    className="w-20 bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-1">
                    {[5, 10, 20, 50, 100].map((v) => {
                      const cur = coinMode === "add" ? bonusAmount : deductAmount;
                      return (
                        <button
                          key={v}
                          onClick={() => (coinMode === "add" ? setBonusAmount(v) : setDeductAmount(v))}
                          className={`px-2 py-1 text-xs border transition-colors ${
                            cur === v
                              ? "border-[var(--terminal-primary)] text-[var(--terminal-primary)] bg-[var(--terminal-primary)]/20"
                              : "border-[var(--terminal-primary-dim)]/50 text-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]/50"
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={coinMode === "add" ? bonusReason : deductReason}
                    onChange={(e) => (coinMode === "add" ? setBonusReason(e.target.value) : setDeductReason(e.target.value))}
                    placeholder={coinMode === "add" ? "原因，例如：課堂獎勵" : "核銷原因，例如：兌換獎品"}
                    className="flex-1 min-w-[140px] bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-2 py-1.5 text-sm"
                  />
                </div>

                <button
                  onClick={coinMode === "add" ? handleAddCoins : handleDeductCoins}
                  className="px-5 py-2 text-sm font-bold border-2 transition-colors whitespace-nowrap"
                  style={
                    coinMode === "add"
                      ? { borderColor: "#facc15", color: "#facc15" }
                      : { borderColor: "#f87171", color: "#f87171" }
                  }
                >
                  {coinMode === "add"
                    ? `發放 ${bonusAmount} ◆ 給 ${selectedCount} 位`
                    : `扣除 ${deductAmount} ◆ 共 ${selectedCount} 位`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 操作結果訊息（清除選取後仍看得到） */}
        {tab === "students" && (actionMsg || deductMsg) && (
          <div className="border-t border-[var(--terminal-primary-dim)]/40 bg-black/40">
            <div className={`max-w-[1400px] mx-auto px-4 md:px-6 py-2 text-sm ${actionMsg ? "text-yellow-400" : "text-red-400"}`}>
              {actionMsg || deductMsg}
            </div>
          </div>
        )}
      </header>

      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 pb-10">
        {/* ══ 學生與金幣 ═══════════════════════════════════════ */}
        {tab === "students" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label: "總學生", value: users.length },
                { label: "兒童模式", value: users.filter((r) => r.user.kidMode).length },
                { label: "已建立 Avatar", value: users.filter((r) => r.user.avatar).length },
                { label: "總發行金幣", value: users.reduce((s, r) => s + (r.coins?.totalEarned || 0), 0) },
              ].map((s) => (
                <div key={s.label} className="border border-[var(--terminal-primary-dim)]/60 px-3 py-2">
                  <div className="text-[11px] text-[var(--terminal-primary-dim)]">{s.label}</div>
                  <div className="text-2xl font-bold leading-tight">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 items-center mb-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋用戶名稱 / 顯示名稱…"
                className="flex-1 min-w-[200px] bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-1.5 text-sm"
              />
              <span className="text-xs text-[var(--terminal-primary-dim)] whitespace-nowrap">
                顯示 {filteredUsers.length} / {users.length}
                {selectedCount > 0 && <span className="text-yellow-400"> · 已選 {selectedCount}</span>}
              </span>
              <button
                onClick={loadUsers}
                className="px-3 py-1.5 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 whitespace-nowrap"
              >
                重新載入
              </button>
            </div>

            {error && (
              <div className="border border-red-500 bg-red-500/10 p-4 mb-4 text-red-400 text-sm">
                <div className="font-bold mb-1">載入失敗</div>
                <div>{error}</div>
                <button onClick={loadUsers} className="mt-2 text-xs border border-red-500 px-3 py-1 hover:bg-red-500/20">
                  重試
                </button>
              </div>
            )}

            {loading ? (
              <div className="text-center py-12 text-[var(--terminal-primary-dim)]">載入用戶資料中…</div>
            ) : (
              // 自己捲的表格容器：thead sticky 才會正確吸在表格頂端（不能只用 overflow-x）
              <div className="border border-[var(--terminal-primary-dim)]/60 overflow-auto max-h-[calc(100vh-300px)] min-h-[300px]">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-[var(--terminal-bg)] z-10 shadow-[0_1px_0_var(--terminal-primary-dim)]">
                    <tr className="border-b border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)] text-xs">
                      <th className="text-left p-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedCount === filteredUsers.length && filteredUsers.length > 0}
                          onChange={selectAll}
                          className="cursor-pointer"
                          title="全選 / 取消全選"
                        />
                      </th>
                      <th className="text-left p-2 w-12">AVATAR</th>
                      <th className="text-left p-2">用戶</th>
                      <th className="text-center p-2 w-14">兒童</th>
                      <th className="text-right p-2 w-20">金幣</th>
                      <th className="text-right p-2 w-20">總獲得</th>
                      <th className="text-left p-2 w-28">最後活躍</th>
                      <th className="text-right p-2 w-40 pr-3">快速選取</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((row) => {
                      const on = selectedUsers.has(row.user.id);
                      return (
                        <tr
                          key={row.user.id}
                          onClick={() => toggleSelect(row.user.id)}
                          className={`border-b border-[var(--terminal-primary-dim)]/20 cursor-pointer transition-colors ${
                            on ? "bg-[var(--terminal-primary)]/15" : "hover:bg-[var(--terminal-primary)]/5"
                          }`}
                        >
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleSelect(row.user.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="p-2">
                            {row.user.avatar?.frames?.[0] ? (
                              <img
                                src={row.user.avatar.frames[0]}
                                alt=""
                                className="w-8 h-8 object-contain"
                                style={{ imageRendering: "pixelated" }}
                              />
                            ) : (
                              <div className="w-8 h-8 border border-[var(--terminal-primary-dim)]/50 flex items-center justify-center text-xs text-[var(--terminal-primary-dim)]">
                                ?
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="font-mono">{row.user.username}</div>
                            {row.user.displayName && (
                              <div className="text-xs text-[var(--terminal-primary-dim)]">{row.user.displayName}</div>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {row.user.kidMode ? <span className="text-yellow-400">★</span> : <span className="text-[var(--terminal-primary-dim)]">-</span>}
                          </td>
                          <td className="p-2 text-right font-mono text-yellow-400">{row.coins?.balance ?? 0}</td>
                          <td className="p-2 text-right font-mono text-[var(--terminal-primary-dim)]">{row.coins?.totalEarned ?? 0}</td>
                          <td className="p-2 text-xs text-[var(--terminal-primary-dim)]">{formatDate(row.user.lastActiveAt)}</td>
                          {/* 兩顆等寬、同一列靠右對齊，欄位窄的時候也不會上下錯開 */}
                          <td className="p-2 pr-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedUsers(new Set([row.user.id])); setCoinMode("add"); }}
                                className="w-16 text-center text-xs border border-yellow-400/50 text-yellow-400 py-0.5 hover:bg-yellow-400/20 whitespace-nowrap"
                              >
                                ＋金幣
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedUsers(new Set([row.user.id])); setCoinMode("deduct"); }}
                                className="w-16 text-center text-xs border border-red-400/50 text-red-400 py-0.5 hover:bg-red-400/20 whitespace-nowrap"
                              >
                                －金幣
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && (
                  <div className="text-center py-6 text-[var(--terminal-primary-dim)]">沒有找到符合的用戶</div>
                )}
              </div>
            )}
          </>
        )}

        {/* ══ 課堂經營 ═════════════════════════════════════════ */}
        {tab === "classroom" && (
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <Card title="📢 指揮官公告" desc="發布後學生側邊欄會在 60 秒內看到" accent="var(--terminal-accent)">
              <input
                type="text"
                value={announcement}
                onChange={(e) => { setAnnouncement(e.target.value); setAnnouncementSaved(false); }}
                className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2 text-sm mb-3"
                placeholder="輸入要公告給所有學生的訊息…（留空並發布＝清除公告）"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    await saveAnnouncement(announcement, user?.username || "admin");
                    setAnnouncementSaved(true);
                    setTimeout(() => setAnnouncementSaved(false), 3000);
                  }}
                  className="px-4 py-2 text-sm font-bold border-2 border-[var(--terminal-accent)] text-[var(--terminal-accent)] hover:bg-[var(--terminal-accent)] hover:text-black transition-colors"
                >
                  發布公告
                </button>
                {announcementSaved && <span className="text-sm text-green-400">已發布！</span>}
              </div>
            </Card>

            <Card title="📚 課堂分類" desc="管理課堂、分配學生、整班快速發送金幣">
              <button
                onClick={() => router.push("/admin/classrooms")}
                className="w-full px-4 py-3 text-sm font-bold border-2 border-[var(--terminal-primary)] text-[var(--terminal-primary)] hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)] transition-colors"
              >
                管理課堂 →
              </button>
            </Card>

            <Card
              title="◉ 活動模式"
              desc={activityState.activeActivityId ? "目前有活動進行中，學生端會出現全螢幕提示" : "啟動後學生端會出現全螢幕活動提示"}
              accent="var(--terminal-cyan)"
            >
              {activityState.activeActivityId ? (
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-[var(--terminal-accent)] animate-pulse">● ACTIVE</span>
                    <span className="text-sm font-bold">
                      {ACTIVITIES.find((a) => a.id === activityState.activeActivityId)?.name || activityState.activeActivityId}
                    </span>
                    <span className="text-xs text-[var(--terminal-primary-dim)]">
                      {activityState.activatedBy} · {activityState.activatedAt ? new Date(activityState.activatedAt).toLocaleString("zh-TW") : ""}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      setActivityLoading(true);
                      await setGlobalActivityState({ activeActivityId: null, activatedAt: null, activatedBy: null });
                      setActivityState({ activeActivityId: null, activatedAt: null, activatedBy: null });
                      setActivityLoading(false);
                    }}
                    disabled={activityLoading}
                    className="px-4 py-2 text-sm font-bold border-2 border-red-400 text-red-400 hover:bg-red-400 hover:text-black disabled:opacity-30 transition-colors"
                  >
                    停止活動
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {ACTIVITIES.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between gap-3 border border-[var(--terminal-primary-dim)]/30 p-2.5">
                      <div className="min-w-0">
                        <div className="text-sm truncate">{activity.name}</div>
                        <div className="text-xs text-[var(--terminal-primary-dim)] truncate">
                          {activity.description} · 獎勵 +{activity.coinReward} ◆
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          setActivityLoading(true);
                          const newState: ActivityState = {
                            activeActivityId: activity.id,
                            activatedAt: new Date().toISOString(),
                            activatedBy: user?.username || "admin",
                          };
                          await setGlobalActivityState(newState);
                          setActivityState(newState);
                          setActivityLoading(false);
                        }}
                        disabled={activityLoading}
                        className="flex-shrink-0 px-4 py-1.5 text-sm font-bold border-2 border-[var(--terminal-cyan)] text-[var(--terminal-cyan)] hover:bg-[var(--terminal-cyan)] hover:text-black disabled:opacity-30 transition-colors"
                      >
                        啟動
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ══ 系統與素材 ═══════════════════════════════════════ */}
        {tab === "system" && (
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <Card title="🎮 功能開關" desc="關閉後學生無法進入卡片、抽卡、牌組、對戰等頁面" accent="#f87171">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">卡片遊戲系統</div>
                <button
                  onClick={async () => {
                    const newFlags = { ...featureFlags, cardGameEnabled: !featureFlags.cardGameEnabled };
                    setFeatureFlags(newFlags);
                    await saveFeatureFlags(newFlags);
                    setFeatureFlagsSaved(true);
                    setTimeout(() => setFeatureFlagsSaved(false), 3000);
                  }}
                  className={`px-5 py-2 text-sm font-bold border-2 transition-colors ${
                    featureFlags.cardGameEnabled
                      ? "border-green-400 text-green-400 hover:bg-green-400 hover:text-black"
                      : "border-red-400 text-red-400 hover:bg-red-400 hover:text-black"
                  }`}
                >
                  {featureFlags.cardGameEnabled ? "✅ 已開放" : "🔒 已關閉"}
                </button>
              </div>
              {featureFlagsSaved && <div className="mt-2 text-sm text-green-400">已儲存，學生端即時更新。</div>}
            </Card>

            <Card title="🗂 素材管理" desc="卡片圖片／動畫、任務卡圖、學習單">
              <div className="grid grid-cols-2 gap-2">
                {TOOLS.map((t) => (
                  <button
                    key={t.path}
                    onClick={() => router.push(t.path)}
                    className="px-3 py-3 text-sm border-2 hover:bg-white/5 transition-colors"
                    style={{ borderColor: t.color, color: t.color }}
                  >
                    {t.label} →
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

    </main>
  );
}
