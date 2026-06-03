import { useState, useEffect } from "react";
import { onFeatureFlagsChange, FeatureFlags } from "@/lib/firestore";

const DEFAULT_FLAGS: FeatureFlags = { cardGameEnabled: true };

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    const unsubscribe = onFeatureFlagsChange(setFlags);
    return unsubscribe;
  }, []);

  return flags;
}
