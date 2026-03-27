import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useCoin } from "./CoinContext";
import { ActivityDefinition, ActivityState } from "@/types/Activity";
import { getActivityById } from "@/data/activityRegistry";
import {
  onActivityStateChange,
  getUserActivityRecords,
  saveUserActivityRecord,
} from "@/lib/firestore";

interface ActivityContextValue {
  currentActivity: ActivityDefinition | null;
  shouldShowActivity: boolean;
  isCompleted: boolean;
  completeActivity: () => Promise<void>;
}

const ActivityContext = createContext<ActivityContextValue>({
  currentActivity: null,
  shouldShowActivity: false,
  isCompleted: false,
  completeActivity: async () => {},
});

export const useActivity = () => useContext(ActivityContext);

export const ActivityProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const { addCoins } = useCoin();
  const [activityState, setActivityState] = useState<ActivityState>({
    activeActivityId: null,
    activatedAt: null,
    activatedBy: null,
  });
  const [completedActivityIds, setCompletedActivityIds] = useState<Set<string>>(
    new Set()
  );
  const [isCompleted, setIsCompleted] = useState(false);

  // Listen to global activity state changes in real-time
  useEffect(() => {
    const unsubscribe = onActivityStateChange((state) => {
      setActivityState(state);
    });
    return unsubscribe;
  }, []);

  // Load user's completed activities
  useEffect(() => {
    if (!user) return;
    getUserActivityRecords(user.id)
      .then((records) => {
        setCompletedActivityIds(new Set(records.map((r) => r.activityId)));
      })
      .catch((err) => {
        console.warn("Failed to load activity records:", err);
      });
  }, [user]);

  // Determine current activity and completion status
  const currentActivity = activityState.activeActivityId
    ? getActivityById(activityState.activeActivityId) || null
    : null;

  const shouldShowActivity =
    !!currentActivity &&
    !!user &&
    !completedActivityIds.has(currentActivity.id) &&
    !isCompleted;

  const completeActivity = useCallback(async () => {
    if (!currentActivity || !user) return;

    await saveUserActivityRecord(user.id, {
      activityId: currentActivity.id,
      completedAt: new Date().toISOString(),
      userId: user.id,
    });

    if (currentActivity.coinReward > 0) {
      addCoins(currentActivity.coinReward, `完成活動: ${currentActivity.name}`);
    }

    setCompletedActivityIds((prev) => new Set(Array.from(prev).concat(currentActivity.id)));
    setIsCompleted(true);
  }, [currentActivity, user, addCoins]);

  // Reset isCompleted when activity changes
  useEffect(() => {
    if (activityState.activeActivityId) {
      setIsCompleted(
        completedActivityIds.has(activityState.activeActivityId)
      );
    } else {
      setIsCompleted(false);
    }
  }, [activityState.activeActivityId, completedActivityIds]);

  return (
    <ActivityContext.Provider
      value={{ currentActivity, shouldShowActivity, isCompleted, completeActivity }}
    >
      {children}
    </ActivityContext.Provider>
  );
};
