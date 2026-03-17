import {
  db,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from "./firebase";
import { storage, ref, uploadString, getDownloadURL } from "./firebase";
import { User } from "@/types/User";
import { UserMemory } from "@/types/Memory";
import { Conversation, ConversationMessage } from "@/types/Conversation";

// ============ Users ============

export async function getUser(userId: string): Promise<User | null> {
  const snap = await getDoc(doc(db, "users", userId));
  return snap.exists() ? (snap.data() as User) : null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const q = query(
    collection(db, "users"),
    where("username_lower", "==", username.toLowerCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as User;
}

export async function saveUser(user: User): Promise<void> {
  // Remove undefined fields — Firestore rejects them
  const data: Record<string, any> = {
    ...user,
    username_lower: user.username.toLowerCase(),
  };
  Object.keys(data).forEach((key) => {
    if (data[key] === undefined) delete data[key];
  });
  await setDoc(doc(db, "users", user.id), data);
}

export async function getUserByStudentId(studentId: string): Promise<User | null> {
  const q = query(
    collection(db, "users"),
    where("studentId", "==", studentId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as User;
}

export async function getAllUsers(): Promise<User[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => d.data() as User);
}

// ============ Memories ============

export async function getMemory(userId: string): Promise<UserMemory | null> {
  const snap = await getDoc(doc(db, "memories", userId));
  return snap.exists() ? (snap.data() as UserMemory) : null;
}

export async function saveMemory(userId: string, memory: UserMemory): Promise<void> {
  await setDoc(doc(db, "memories", userId), memory);
}

// ============ Coins ============

export interface CoinState {
  balance: number;
  totalEarned: number;
  transactions: Array<{
    id: string;
    amount: number;
    reason: string;
    timestamp: string;
  }>;
}

export async function getCoinState(userId: string): Promise<CoinState | null> {
  const snap = await getDoc(doc(db, "coins", userId));
  return snap.exists() ? (snap.data() as CoinState) : null;
}

export async function saveCoinState(userId: string, state: CoinState): Promise<void> {
  await setDoc(doc(db, "coins", userId), state);
}

// ============ Conversations ============

export async function getConversations(userId: string): Promise<Conversation[]> {
  // Single-field query to avoid composite index requirement
  const q = query(
    collection(db, "conversations"),
    where("userId", "==", userId)
  );
  const snap = await getDocs(q);
  const convs = snap.docs.map((d) => d.data() as Conversation);
  // Sort client-side
  return convs.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function saveConversation(conv: Conversation): Promise<void> {
  await setDoc(doc(db, "conversations", conv.id), conv);
}

export async function deleteConversationDoc(convId: string): Promise<void> {
  await deleteDoc(doc(db, "conversations", convId));
}

// ============ Avatar Storage ============

/**
 * Upload base64 avatar frames to Firebase Storage, return download URLs.
 * Replaces inline base64 with persistent URLs to keep Firestore docs small.
 */
export async function uploadAvatarFrames(
  userId: string,
  avatarId: string,
  base64Frames: string[]
): Promise<string[]> {
  const urls: string[] = [];

  for (let i = 0; i < base64Frames.length; i++) {
    const frame = base64Frames[i];
    const path = `avatars/${userId}/${avatarId}/frame_${i}.png`;
    const storageRef = ref(storage, path);

    // Handle both raw base64 and data URL formats
    if (frame.startsWith("data:")) {
      await uploadString(storageRef, frame, "data_url");
    } else {
      await uploadString(storageRef, frame, "base64");
    }

    const url = await getDownloadURL(storageRef);
    urls.push(url);
  }

  return urls;
}
