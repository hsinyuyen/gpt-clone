import { UserAvatar } from "./Script";

export interface User {
  id: string;
  username: string;
  displayName?: string;
  studentId?: string;
  kidMode?: boolean;
  createdAt: string;
  lastActiveAt: string;
  avatar?: UserAvatar;
}

// Face Identity API response types
export interface FaceIdentity {
  logged_in: boolean;
  student_id?: string;
  name?: string;
  confidence?: number;
  login_time?: number;
  pc_number?: number;
}

export interface FaceIdentityEvent {
  event: "login" | "logout" | "connected";
  student_id?: string;
  name?: string;
  confidence?: number;
  pc_number?: number;
  timestamp?: number;
}
