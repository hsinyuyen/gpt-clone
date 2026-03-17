import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers, getCoinState, saveCoinState, CoinState } from "@/lib/firestore";
import { User } from "@/types/User";

interface UserRow {
  user: User;
  coins: CoinState | null;
}

const ADMIN_USERNAMES = ["admin", "teacher", "老師"];

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
  const [accessBypass, setAccessBypass] = useState(false);

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

  return (
    <main className="w-full min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold glow-text">ADMIN_PANEL</h1>
          <div className="text-xs text-[var(--terminal-primary-dim)]">
            管理學生帳號和金幣獎勵 | 登入帳號: {user?.username}
          </div>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
        >
          ← 返回主頁
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="border border-[var(--terminal-primary-dim)] p-3">
          <div className="text-xs text-[var(--terminal-primary-dim)]">總用戶</div>
          <div className="text-2xl font-bold">{users.length}</div>
        </div>
        <div className="border border-[var(--terminal-primary-dim)] p-3">
          <div className="text-xs text-[var(--terminal-primary-dim)]">兒童模式</div>
          <div className="text-2xl font-bold">
            {users.filter((r) => r.user.kidMode).length}
          </div>
        </div>
        <div className="border border-[var(--terminal-primary-dim)] p-3">
          <div className="text-xs text-[var(--terminal-primary-dim)]">已建立 Avatar</div>
          <div className="text-2xl font-bold">
            {users.filter((r) => r.user.avatar).length}
          </div>
        </div>
        <div className="border border-[var(--terminal-primary-dim)] p-3">
          <div className="text-xs text-[var(--terminal-primary-dim)]">總發行金幣</div>
          <div className="text-2xl font-bold">
            {users.reduce((sum, r) => sum + (r.coins?.totalEarned || 0), 0)}
          </div>
        </div>
      </div>

      {/* Coin Bonus Controls */}
      <div className="border border-yellow-400/50 bg-yellow-400/5 p-4 mb-6">
        <div className="text-yellow-400 text-sm font-bold mb-3">◆ 課堂獎勵發放</div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--terminal-primary-dim)] block mb-1">金幣數量</label>
            <input
              type="number"
              value={bonusAmount}
              onChange={(e) => setBonusAmount(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-20 bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-2 py-1 text-sm"
              min={1}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs text-[var(--terminal-primary-dim)] block mb-1">原因</label>
            <input
              type="text"
              value={bonusReason}
              onChange={(e) => setBonusReason(e.target.value)}
              className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-2 py-1 text-sm"
              placeholder="課堂獎勵"
            />
          </div>
          <button
            onClick={handleAddCoins}
            disabled={selectedUsers.size === 0}
            className="px-4 py-1 text-sm font-bold border-2 border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            發放給 {selectedUsers.size} 位學生
          </button>
        </div>
        {actionMsg && (
          <div className="mt-2 text-sm text-yellow-400">{actionMsg}</div>
        )}
      </div>

      {/* Search & Refresh */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋用戶名稱..."
          className="flex-1 bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-1 text-sm"
        />
        <button
          onClick={loadUsers}
          className="px-3 py-1 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
        >
          重新載入
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="border border-red-500 bg-red-500/10 p-4 mb-4 text-red-400 text-sm">
          <div className="font-bold mb-1">載入失敗</div>
          <div>{error}</div>
          <button onClick={loadUsers} className="mt-2 text-xs border border-red-500 px-3 py-1 hover:bg-red-500/20">
            重試
          </button>
        </div>
      )}

      {/* User Table */}
      {loading ? (
        <div className="text-center py-8 text-[var(--terminal-primary-dim)]">載入用戶資料中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--terminal-primary-dim)]">
                <th className="text-left p-2">
                  <input
                    type="checkbox"
                    checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                    onChange={selectAll}
                    className="cursor-pointer"
                  />
                </th>
                <th className="text-left p-2">Avatar</th>
                <th className="text-left p-2">用戶名稱</th>
                <th className="text-left p-2">顯示名稱</th>
                <th className="text-center p-2">兒童</th>
                <th className="text-right p-2">金幣</th>
                <th className="text-right p-2">總獲得</th>
                <th className="text-left p-2">最後活躍</th>
                <th className="text-left p-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((row) => (
                <tr
                  key={row.user.id}
                  className={`border-b border-[var(--terminal-primary-dim)]/30 hover:bg-[var(--terminal-primary)]/5 ${
                    selectedUsers.has(row.user.id) ? "bg-[var(--terminal-primary)]/10" : ""
                  }`}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(row.user.id)}
                      onChange={() => toggleSelect(row.user.id)}
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
                      <div className="w-8 h-8 border border-[var(--terminal-primary-dim)] flex items-center justify-center text-xs">
                        ?
                      </div>
                    )}
                  </td>
                  <td className="p-2 font-mono">{row.user.username}</td>
                  <td className="p-2">{row.user.displayName || "-"}</td>
                  <td className="p-2 text-center">
                    {row.user.kidMode ? (
                      <span className="text-yellow-400">★</span>
                    ) : (
                      <span className="text-[var(--terminal-primary-dim)]">-</span>
                    )}
                  </td>
                  <td className="p-2 text-right font-mono text-yellow-400">
                    {row.coins?.balance ?? 0}
                  </td>
                  <td className="p-2 text-right font-mono text-[var(--terminal-primary-dim)]">
                    {row.coins?.totalEarned ?? 0}
                  </td>
                  <td className="p-2 text-xs text-[var(--terminal-primary-dim)]">
                    {formatDate(row.user.lastActiveAt)}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => {
                        setSelectedUsers(new Set([row.user.id]));
                        setBonusAmount(10);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-xs border border-yellow-400/50 text-yellow-400 px-2 py-0.5 hover:bg-yellow-400/20"
                    >
                      +金幣
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="text-center py-4 text-[var(--terminal-primary-dim)]">
              沒有找到符合的用戶
            </div>
          )}
        </div>
      )}
    </main>
  );
}
