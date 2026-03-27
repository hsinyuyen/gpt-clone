export interface ActivityDefinition {
  id: string;
  name: string;
  description: string;
  component: string;
  coinReward: number;
}

export interface ActivityState {
  activeActivityId: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
}

export interface UserActivityRecord {
  activityId: string;
  completedAt: string;
  userId: string;
}

export interface ActivityComponentProps {
  activity: ActivityDefinition;
  onComplete: () => void;
}
