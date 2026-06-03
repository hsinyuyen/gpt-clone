import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAllUsers,
  getCoinState,
  getBattleStats,
  CoinState,
  BattleStats,
} from "@/lib/firestore";
import { getCardCollection } from "@/lib/firestore";
import { User } from "@/types/User";

type Tab = "coins" | "cards" | "battles";

interface LeaderboardEntry {
  user: User;
  coins: CoinState | null;
  cardCount: number;
  battleStats: BattleStats | null;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("coins");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);
      const allUsers = await getAllUsers();
      // Filter out admin accounts
      const ADMIN_USERNAMES = ["admin", "teacher", "老師"];
      const students = allUsers.filter(
        (u) => !ADMIN_USERNAMES.includes(u.username.toLowerCase())
      );

      const rows: LeaderboardEntry[] = await Promise.all(
        students.map(async (u) => {
          const [coins, collection, battleStats] = await Promise.all([
            getCoinState(u.id),
            getCardCollection(u.id),
            getBattleStats(u.id),
          ]);
          const cardCount = collection?.cards?.length || 0;
          return { user: u, coins, cardCount, battleStats };
        })
      );

      setEntries(rows);
      setLoading(false);
    };

    load();
  }, [user]);

  const sorted = [...entries].sort((a, b) => {
    switch (tab) {
      case "coins":
        return (b.coins?.totalEarned || 0) - (a.coins?.totalEarned || 0);
      case "cards":
        return b.cardCount - a.cardCount;
      case "battles":
        return (b.battleStats?.totalWins || 0) - (a.battleStats?.totalWins || 0);
    }
  });

  const getValue = (entry: LeaderboardEntry): string => {
    switch (tab) {
      case "coins":
        return `◆ ${entry.coins?.totalEarned || 0}`;
      case "cards":
        return `🃏 ${entry.cardCount}`;
      case "battles": {
        const s = entry.battleStats;
        return `⚔ ${s?.totalWins || 0}`;
      }
    }
  };

  const getSubValue = (entry: LeaderboardEntry): string => {
    switch (tab) {
      case "coins":
        return `持有 ${entry.coins?.balance || 0}`;
      case "cards":
        return "";
      case "battles": {
        const s = entry.battleStats;
        return `PvE ${s?.pveWins || 0} / PvP ${s?.pvpWins || 0}`;
      }
    }
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "coins", label: "金幣排行", icon: "◆" },
    { id: "cards", label: "收藏排行", icon: "🃏" },
    { id: "battles", label: "勝場排行", icon: "⚔" },
  ];

  const getMedal = (index: number): string => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `${index + 1}`;
  };

  const getMedalColor = (index: number): string => {
    if (index === 0) return "text-yellow-400";
    if (index === 1) return "text-gray-300";
    if (index === 2) return "text-amber-600";
    return "text-[var(--terminal-primary-dim)]";
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary)]">
        載入中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--terminal-bg)] border-b-2 border-[var(--terminal-accent)]">
        <div className="p-4 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="px-3 py-2 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-bold">🏆 排行榜</h1>
          <div className="w-16" />
        </div>

        {/* Tabs */}
        <div className="flex border-t border-[var(--terminal-primary-dim)]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${
                tab === t.id
                  ? "bg-[var(--terminal-accent)] text-[var(--terminal-bg)]"
                  : "text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] hover:bg-[var(--terminal-primary)]/5"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto">
        {loading ? (
          <div className="text-center py-16 text-[var(--terminal-primary-dim)] animate-pulse">
            載入排行榜中...
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-[var(--terminal-primary-dim)]">
            <div className="text-4xl mb-4">📊</div>
            <div>目前沒有排行資料</div>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((entry, index) => {
              const isMe = entry.user.id === user.id;
              return (
                <div
                  key={entry.user.id}
                  className={`flex items-center gap-3 p-3 border-2 transition-colors ${
                    isMe
                      ? "border-[var(--terminal-accent)] bg-[var(--terminal-accent)]/10"
                      : "border-[var(--terminal-primary-dim)]/30"
                  } ${index < 3 ? "bg-[var(--terminal-primary)]/5" : ""}`}
                >
                  {/* Rank */}
                  <div
                    className={`w-10 text-center text-lg font-bold flex-shrink-0 ${getMedalColor(index)}`}
                  >
                    {getMedal(index)}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate flex items-center gap-2">
                      {entry.user.displayName || entry.user.username}
                      {isMe && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[var(--terminal-accent)] text-[var(--terminal-bg)] font-bold">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--terminal-primary-dim)]">
                      @{entry.user.username}
                    </div>
                  </div>

                  {/* Value */}
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`text-lg font-bold font-mono ${
                        index === 0
                          ? "text-yellow-400"
                          : "text-[var(--terminal-primary)]"
                      }`}
                    >
                      {getValue(entry)}
                    </div>
                    {getSubValue(entry) && (
                      <div className="text-[10px] text-[var(--terminal-primary-dim)]">
                        {getSubValue(entry)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* My rank summary */}
        {!loading && sorted.length > 0 && (
          <div className="mt-6 p-4 border-2 border-[var(--terminal-accent)] bg-[var(--terminal-accent)]/5 text-center">
            <div className="text-xs text-[var(--terminal-primary-dim)] mb-1">
              你的排名
            </div>
            <div className="text-2xl font-bold text-[var(--terminal-accent)]">
              第 {sorted.findIndex((e) => e.user.id === user.id) + 1} 名
            </div>
            <div className="text-xs text-[var(--terminal-primary-dim)] mt-1">
              共 {sorted.length} 人
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
