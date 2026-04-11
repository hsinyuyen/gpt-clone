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
  onSnapshot,
} from "./firebase";
import { storage, ref, uploadString, getDownloadURL } from "./firebase";
import { User } from "@/types/User";
import { UserMemory } from "@/types/Memory";
import { Conversation, ConversationMessage } from "@/types/Conversation";
import { ActivityState, UserActivityRecord } from "@/types/Activity";
import { PlayerCardCollection, PvpBattleRoom } from "@/types/Card";

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

// ============ Activities ============

const ACTIVITY_DOC = doc(db, "settings", "activity");

export async function getGlobalActivityState(): Promise<ActivityState> {
  const snap = await getDoc(ACTIVITY_DOC);
  if (!snap.exists()) {
    return { activeActivityId: null, activatedAt: null, activatedBy: null };
  }
  return snap.data() as ActivityState;
}

export async function setGlobalActivityState(state: ActivityState): Promise<void> {
  await setDoc(ACTIVITY_DOC, state);
}

export function onActivityStateChange(
  callback: (state: ActivityState) => void
): () => void {
  return onSnapshot(
    ACTIVITY_DOC,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as ActivityState);
      } else {
        callback({ activeActivityId: null, activatedAt: null, activatedBy: null });
      }
    },
    (error) => {
      console.warn("Activity state listener error:", error);
      callback({ activeActivityId: null, activatedAt: null, activatedBy: null });
    }
  );
}

export async function getUserActivityRecords(
  userId: string
): Promise<UserActivityRecord[]> {
  const snap = await getDocs(collection(db, "users", userId, "activities"));
  return snap.docs.map((d) => d.data() as UserActivityRecord);
}

export async function saveUserActivityRecord(
  userId: string,
  record: UserActivityRecord
): Promise<void> {
  await setDoc(
    doc(db, "users", userId, "activities", record.activityId),
    record
  );
}

// ============ Announcements ============

export interface Announcement {
  message: string;
  createdAt: string;
  createdBy: string;
}

export async function getAnnouncement(): Promise<string | null> {
  const snap = await getDoc(doc(db, "system", "announcement"));
  if (!snap.exists()) return null;
  const data = snap.data() as Announcement;
  return data.message || null;
}

export async function saveAnnouncement(message: string, createdBy: string): Promise<void> {
  const data: Announcement = {
    message,
    createdAt: new Date().toISOString(),
    createdBy,
  };
  await setDoc(doc(db, "system", "announcement"), data);
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

/**
 * Upload a base64 image to Firebase Storage and return its public download URL.
 * Used for story creator activity to get a URL that Seedance API can access.
 */
export async function uploadStoryImage(
  base64Data: string,
  filename: string = "story_image.png"
): Promise<string> {
  const path = `story-images/${Date.now()}_${filename}`;
  const storageRef = ref(storage, path);

  if (base64Data.startsWith("data:")) {
    await uploadString(storageRef, base64Data, "data_url");
  } else {
    await uploadString(storageRef, base64Data, "base64");
  }

  return await getDownloadURL(storageRef);
}

/**
 * Upload story audio files (base64 mp3) to Firebase Storage, return download URLs.
 */
export async function uploadStoryAudio(
  userId: string,
  storyId: string,
  audioFiles: { base64: string; index: number }[]
): Promise<Map<number, string>> {
  const urlMap = new Map<number, string>();

  for (const file of audioFiles) {
    const path = `stories/${userId}/${storyId}/audio_${file.index}.mp3`;
    const storageRef = ref(storage, path);
    await uploadString(storageRef, file.base64, "base64");
    const url = await getDownloadURL(storageRef);
    urlMap.set(file.index, url);
  }

  return urlMap;
}

// ============ Card Images ============

export interface CardImageMap {
  [cardId: string]: string; // cardId -> imageUrl
}

export async function getCardImages(): Promise<CardImageMap> {
  const snap = await getDoc(doc(db, "system", "cardImages"));
  return snap.exists() ? (snap.data() as CardImageMap) : {};
}

export async function saveCardImages(images: CardImageMap): Promise<void> {
  await setDoc(doc(db, "system", "cardImages"), images);
}

// ============ Card Collections ============

export async function getCardCollection(userId: string): Promise<PlayerCardCollection | null> {
  const snap = await getDoc(doc(db, "cardCollections", userId));
  return snap.exists() ? (snap.data() as PlayerCardCollection) : null;
}

export async function saveCardCollection(userId: string, data: PlayerCardCollection): Promise<void> {
  await setDoc(doc(db, "cardCollections", userId), data);
}

// ============ PvP Rooms ============

export async function getPvpRoom(roomId: string): Promise<PvpBattleRoom | null> {
  const snap = await getDoc(doc(db, "pvpRooms", roomId));
  return snap.exists() ? (snap.data() as PvpBattleRoom) : null;
}

export async function savePvpRoom(room: PvpBattleRoom): Promise<void> {
  await setDoc(doc(db, "pvpRooms", room.id), room);
}

export async function deletePvpRoom(roomId: string): Promise<void> {
  await deleteDoc(doc(db, "pvpRooms", roomId));
}

export async function getOpenPvpRooms(): Promise<PvpBattleRoom[]> {
  const q = query(
    collection(db, "pvpRooms"),
    where("status", "==", "waiting")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as PvpBattleRoom);
}
