import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getClassroom,
  getAllUsers,
  getCoinState,
  saveCoinState,
  Classroom,
  CoinState,
} from "@/lib/firestore";
import { User } from "@/types/User";

const ADMIN_USERNAMES = ["admin", "teacher", "老師"];
const QUICK_AMOUNTS = [1, 3, 5, 10, 20, 50];

interface StudentRow {
  user: User;
  coins: CoinState | null;
}

export default function ClassroomCoinPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState("課堂獎勵");
  const [sentMap, setSentMap] = useState<Record<string, number>>({});
  const [lastSent, setLastSent] = useState<string | null>(null);

  const isAdmin =
    user && ADMIN_USERNAMES.includes(user.username.toLowerCase());

  const loadData = useCallback(async () => {
    if (!id || typeof id !== "string") return;
    setLoading(true);

    const [cls, allUsers] = await Promise.all([
      getClassroom(id),
      getAllUsers(),
    ]);

    if (!cls) {
      setLoading(false);
      return;
    }

    setClassroom(cls);

    // Load coin state for each student
    const rows: StudentRow[] = await Promise.all(
      cls.studentIds.map(async (sid) => {
        const u = allUsers.find((x) => x.id === sid);
        if (!u) return null;
        const coins = await getCoinState(sid);
        return { user: u, coins };
      })
    ).then((r) => r.filter(Boolean) as StudentRow[]);

    // Sort by display name
    rows.sort((a, b) =>
      (a.user.displayName || a.user.username).localeCompare(
        b.user.displayName || b.user.username
      )
    );

    setStudents(rows);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
      return;
    }
    if (user && isAdmin && id) loadData();
  }, [user, isLoading, isAdmin, router, id, loadData]);

  const sendCoins = async (student: StudentRow) => {
    if (amount <= 0) return;

    const current: CoinState = student.coins || {
      balance: 0,
      totalEarned: 0,
      transactions: [],
    };

    const transaction = {
      id: `tx_cls_${Date.now()}_${student.user.id}`,
      amount,
      reason: `[老師] ${reason}`,
      timestamp: new Date().toISOString(),
    };

    const newState: CoinState = {
      balance: current.balance + amount,
      totalEarned: current.totalEarned + amount,
      transactions: [transaction, ...current.transactions].slice(0, 100),
    };

    await saveCoinState(student.user.id, newState);

    // Update local state
    setStudents((prev) =>
      prev.map((s) =>
        s.user.id === student.user.id ? { ...s, coins: newState } : s
      )
    );

    // Track sent count for visual feedback
    setSentMap((prev) => ({
      ...prev,
      [student.user.id]: (prev[student.user.id] || 0) + amount,
    }));
    setLastSent(student.user.id);
    setTimeout(() => setLastSent(null), 600);
  };

  const sendToAll = async () => {
    if (amount <= 0 || students.length === 0) return;
    if (!confirm(`確定發送 ${amount} 幣給全班 ${students.length} 位同學？`))
      return;

    for (const student of students) {
      await sendCoins(student);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary)]">
        載入中...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-red-400">
        無權限存取
      </div>
    );
  }

  if (!classroom) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary-dim)]">
        找不到此課堂
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)]">
      {/* Sticky top bar — coin settings */}
      <div className="sticky top-0 z-10 bg-[var(--terminal-bg)] border-b-2 border-[var(--terminal-accent)] p-4">
        {/* Back + title */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => router.push("/admin/classrooms")}
            className="px-3 py-2 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-bold">{classroom.name}</h1>
          <div className="text-xs text-[var(--terminal-primary-dim)]">
            {students.length} 人
          </div>
        </div>

        {/* Amount selector — big buttons */}
        <div className="mb-3">
          <div className="text-xs text-[var(--terminal-primary-dim)] mb-1.5">
            金幣數量
          </div>
          <div className="grid grid-cols-6 gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => setAmount(a)}
                className={`py-3 text-lg font-bold border-2 transition-colors ${
                  amount === a
                    ? "border-[var(--terminal-accent)] bg-[var(--terminal-accent)] text-[var(--terminal-bg)]"
                    : "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Custom amount + reason */}
        <div className="flex gap-2">
          <div className="w-24">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2.5 text-base text-center focus:border-[var(--terminal-primary)] outline-none"
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="原因"
              className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2.5 text-base focus:border-[var(--terminal-primary)] outline-none"
            />
          </div>
          <button
            onClick={sendToAll}
            className="px-4 py-2.5 text-sm font-bold border-2 border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black transition-colors whitespace-nowrap"
          >
            全班發送
          </button>
        </div>
      </div>

      {/* Student grid — big tap targets for mobile */}
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {students.map((s) => {
            const totalSent = sentMap[s.user.id] || 0;
            const isJustSent = lastSent === s.user.id;

            return (
              <button
                key={s.user.id}
                onClick={() => sendCoins(s)}
                className={`relative p-4 border-2 text-left transition-all active:scale-95 ${
                  isJustSent
                    ? "border-yellow-400 bg-yellow-400/20 scale-[1.02]"
                    : "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)] active:bg-[var(--terminal-primary)]/10"
                }`}
                style={{ minHeight: "100px" }}
              >
                {/* Name */}
                <div className="text-lg font-bold mb-1 truncate">
                  {s.user.displayName || s.user.username}
                </div>

                {/* Username */}
                <div className="text-xs text-[var(--terminal-primary-dim)] mb-2">
                  @{s.user.username}
                </div>

                {/* Balance */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-yellow-400 font-mono">
                    ◆ {s.coins?.balance || 0}
                  </span>
                  {totalSent > 0 && (
                    <span
                      className={`text-xs font-bold ${
                        isJustSent
                          ? "text-yellow-400 animate-bounce"
                          : "text-green-400"
                      }`}
                    >
                      +{totalSent}
                    </span>
                  )}
                </div>

                {/* Tap hint */}
                {isJustSent && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-3xl animate-ping opacity-60">◆</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {students.length === 0 && (
          <div className="text-center py-16 text-[var(--terminal-primary-dim)]">
            <div className="text-4xl mb-4">👤</div>
            <div>這個課堂還沒有學生</div>
            <button
              onClick={() => router.push("/admin/classrooms")}
              className="mt-4 px-6 py-2 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 transition-colors"
            >
              前往編輯課堂
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
