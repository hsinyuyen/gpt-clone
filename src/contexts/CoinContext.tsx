import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import {
  getCoinState as getFirestoreCoinState,
  saveCoinState as saveFirestoreCoinState,
  CoinState,
} from "@/lib/firestore";

interface CoinTransaction {
  id: string;
  amount: number;
  reason: string;
  timestamp: string;
}

interface CoinContextType {
  coins: number;
  totalEarned: number;
  addCoins: (amount: number, reason: string) => void;
  spendCoins: (amount: number, reason: string) => boolean;
  canAfford: (amount: number) => boolean;
  transactions: CoinTransaction[];
  COIN_VALUES: typeof COIN_VALUES;
  recentReward: number | null;
}

export const COIN_VALUES = {
  ANSWER_NAME: 5,
  ANSWER_TYPE: 5,
  ANSWER_PERSONALITY: 5,
  ANSWER_COLOR: 5,
  COMPLETE_AVATAR: 10,
  ANSWER_AI_QUESTION: 3,
  SEND_MESSAGE: 1,
  REGENERATE_AVATAR: 100,
} as const;

// Anti-spam settings
const COOLDOWN_MS = 3000;           // 3 seconds between rewards
const DAILY_EARN_CAP = 200;         // Max coins earnable per day
const DUPLICATE_WINDOW = 5;         // Track last 5 messages for duplicate check
const MIN_MESSAGE_LENGTH = 2;       // Minimum characters to earn coins

const CoinContext = createContext<CoinContextType | null>(null);

export const useCoin = (): CoinContextType => {
  const context = useContext(CoinContext);
  if (!context) {
    // SSR-safe: return defaults instead of throwing
    return {
      coins: 0,
      totalEarned: 0,
      addCoins: () => {},
      spendCoins: () => false,
      canAfford: () => false,
      transactions: [],
      COIN_VALUES,
      recentReward: null,
    };
  }
  return context;
};

interface CoinProviderProps {
  children: React.ReactNode;
}

export const CoinProvider: React.FC<CoinProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [coinState, setCoinState] = useState<CoinState>({
    balance: 0,
    totalEarned: 0,
    transactions: [],
  });
  const [recentReward, setRecentReward] = useState<number | null>(null);

  // Anti-spam refs (don't cause re-renders)
  const lastRewardTime = useRef(0);
  const recentMessages = useRef<string[]>([]);

  // Load from Firestore
  useEffect(() => {
    if (user) {
      getFirestoreCoinState(user.id).then((data) => {
        if (data) setCoinState(data);
      });
    }
  }, [user]);

  const saveCoin = useCallback(
    (state: CoinState) => {
      if (user) {
        saveFirestoreCoinState(user.id, state);
      }
    },
    [user]
  );

  // Calculate today's earned coins from transaction history
  const getTodayEarned = useCallback((transactions: CoinTransaction[]): number => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    return transactions
      .filter((tx) => tx.amount > 0 && new Date(tx.timestamp).getTime() >= todayMs)
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, []);

  const addCoins = useCallback(
    (amount: number, reason: string) => {
      const now = Date.now();

      // --- Anti-spam checks (skip for special rewards like COMPLETE_AVATAR) ---
      const isSpecialReward = amount >= COIN_VALUES.COMPLETE_AVATAR;

      if (!isSpecialReward) {
        // 1. Cooldown check
        if (now - lastRewardTime.current < COOLDOWN_MS) {
          console.log("Coin reward blocked: cooldown");
          return;
        }

        // 2. Duplicate message check (reason contains the action type)
        const normalizedReason = reason.trim().toLowerCase();
        if (recentMessages.current.includes(normalizedReason)) {
          console.log("Coin reward blocked: duplicate action");
          return;
        }

        // 3. Daily cap check
        const todayEarned = getTodayEarned(coinState.transactions);
        if (todayEarned + amount > DAILY_EARN_CAP) {
          console.log("Coin reward blocked: daily cap reached");
          return;
        }
      }

      // Update anti-spam state
      lastRewardTime.current = now;
      recentMessages.current = [
        reason.trim().toLowerCase(),
        ...recentMessages.current,
      ].slice(0, DUPLICATE_WINDOW);

      // Award coins
      setCoinState((prev) => {
        const transaction: CoinTransaction = {
          id: `tx_${Date.now()}`,
          amount,
          reason,
          timestamp: new Date().toISOString(),
        };
        const newState: CoinState = {
          balance: prev.balance + amount,
          totalEarned: prev.totalEarned + amount,
          transactions: [transaction, ...prev.transactions].slice(0, 100),
        };
        saveCoin(newState);
        return newState;
      });

      setRecentReward(amount);
      setTimeout(() => setRecentReward(null), 2000);
    },
    [saveCoin, coinState.transactions, getTodayEarned]
  );

  const spendCoins = useCallback(
    (amount: number, reason: string): boolean => {
      if (coinState.balance < amount) {
        return false;
      }
      setCoinState((prev) => {
        const transaction: CoinTransaction = {
          id: `tx_${Date.now()}`,
          amount: -amount,
          reason,
          timestamp: new Date().toISOString(),
        };
        const newState: CoinState = {
          ...prev,
          balance: prev.balance - amount,
          transactions: [transaction, ...prev.transactions].slice(0, 100),
        };
        saveCoin(newState);
        return newState;
      });
      return true;
    },
    [coinState.balance, saveCoin]
  );

  const canAfford = useCallback(
    (amount: number): boolean => {
      return coinState.balance >= amount;
    },
    [coinState.balance]
  );

  return (
    <CoinContext.Provider
      value={{
        coins: coinState.balance,
        totalEarned: coinState.totalEarned,
        addCoins,
        spendCoins,
        canAfford,
        transactions: coinState.transactions,
        COIN_VALUES,
        recentReward,
      }}
    >
      {children}
    </CoinContext.Provider>
  );
};
