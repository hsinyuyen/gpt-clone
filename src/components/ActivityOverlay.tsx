import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useActivity } from "@/contexts/ActivityContext";
import { ACTIVITY_COMPONENTS } from "@/data/activityRegistry";

const ActivityOverlay: React.FC = () => {
  const { currentActivity, shouldShowActivity, completeActivity } = useActivity();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !shouldShowActivity || !currentActivity) return null;

  const ActivityComponent = ACTIVITY_COMPONENTS[currentActivity.component];

  if (!ActivityComponent) {
    console.error(`Activity component not found: ${currentActivity.component}`);
    return null;
  }

  return createPortal(
    <div
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
      className="bg-[var(--terminal-bg)] flex flex-col terminal-screen"
    >
      {/* Header */}
      <div className="border-b border-[var(--terminal-primary-dim)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[var(--terminal-primary)] glow-text text-sm">
            ◉ ACTIVITY_MODE
          </span>
          <span className="text-[var(--terminal-primary-dim)] text-xs">
            | {currentActivity.name}
          </span>
        </div>
        <span className="text-[var(--terminal-accent)] text-xs animate-pulse">
          ● ACTIVE
        </span>
      </div>

      {/* Activity Content */}
      <div className="flex-1 overflow-y-auto">
        <ActivityComponent
          activity={currentActivity}
          onComplete={completeActivity}
        />
      </div>
    </div>,
    document.body
  );
};

export default ActivityOverlay;
