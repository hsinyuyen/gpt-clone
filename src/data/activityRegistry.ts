import { ActivityDefinition, ActivityComponentProps } from "@/types/Activity";
import React from "react";
import DemoActivity from "@/components/activities/DemoActivity";
import StoryCreatorActivity from "@/components/activities/StoryCreatorActivity";

export const ACTIVITIES: ActivityDefinition[] = [
  {
    id: "demo",
    name: "示範活動",
    description: "這是一個示範活動，用來測試活動模式的基本功能。",
    component: "demo",
    coinReward: 10,
  },
  {
    id: "story-creator",
    name: "故事創作",
    description: "選主題、造句子、寫故事，AI 幫你畫出來變成影片!",
    component: "story-creator",
    coinReward: 20,
  },
];

export const ACTIVITY_COMPONENTS: Record<
  string,
  React.ComponentType<ActivityComponentProps>
> = {
  demo: DemoActivity,
  "story-creator": StoryCreatorActivity,
};

export function getActivityById(id: string): ActivityDefinition | undefined {
  return ACTIVITIES.find((a) => a.id === id);
}
