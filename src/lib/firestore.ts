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
  runTransaction,
  orderBy,
  firestoreLimit,
} from "./firebase";
import { storage, ref, uploadString, getDownloadURL } from "./firebase";
import { User } from "@/types/User";
import { UserMemory } from "@/types/Memory";
import { Conversation, ConversationMessage } from "@/types/Conversation";
import { ActivityState, UserActivityRecord } from "@/types/Activity";
import { PlayerCardCollection, PvpBattleRoom } from "@/types/Card";
import {
  Worksheet,
  Task,
  StudentWorksheetProgress,
  TaskProgress,
  AuditLogEntry,
} from "@/types/Worksheet";

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

// ============ Battle Stats ============

export interface BattleStats {
  pveWins: number;
  pvpWins: number;
  totalWins: number;
  lastBattleAt?: string;
}

export async function getBattleStats(userId: string): Promise<BattleStats | null> {
  const snap = await getDoc(doc(db, "battleStats", userId));
  return snap.exists() ? (snap.data() as BattleStats) : null;
}

export async function saveBattleStats(userId: string, stats: BattleStats): Promise<void> {
  await setDoc(doc(db, "battleStats", userId), stats);
}

export async function incrementBattleWin(
  userId: string,
  type: "pve" | "pvp"
): Promise<BattleStats> {
  const current = (await getBattleStats(userId)) || {
    pveWins: 0,
    pvpWins: 0,
    totalWins: 0,
  };
  const updated: BattleStats = {
    ...current,
    pveWins: current.pveWins + (type === "pve" ? 1 : 0),
    pvpWins: current.pvpWins + (type === "pvp" ? 1 : 0),
    totalWins: current.totalWins + 1,
    lastBattleAt: new Date().toISOString(),
  };
  await saveBattleStats(userId, updated);
  return updated;
}

// ============ Classrooms ============

export interface Classroom {
  id: string;
  name: string;
  studentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export async function getClassrooms(): Promise<Classroom[]> {
  const snap = await getDocs(collection(db, "classrooms"));
  return snap.docs.map((d) => d.data() as Classroom);
}

export async function getClassroom(id: string): Promise<Classroom | null> {
  const snap = await getDoc(doc(db, "classrooms", id));
  return snap.exists() ? (snap.data() as Classroom) : null;
}

export async function saveClassroom(classroom: Classroom): Promise<void> {
  await setDoc(doc(db, "classrooms", classroom.id), classroom);
}

export async function deleteClassroom(id: string): Promise<void> {
  await deleteDoc(doc(db, "classrooms", id));
}

// ============ Feature Flags ============

export interface FeatureFlags {
  cardGameEnabled: boolean;
}

const FEATURE_FLAGS_DOC = doc(db, "system", "featureFlags");

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const snap = await getDoc(FEATURE_FLAGS_DOC);
  if (!snap.exists()) return { cardGameEnabled: true };
  return snap.data() as FeatureFlags;
}

export async function saveFeatureFlags(flags: FeatureFlags): Promise<void> {
  await setDoc(FEATURE_FLAGS_DOC, flags);
}

export function onFeatureFlagsChange(
  callback: (flags: FeatureFlags) => void
): () => void {
  return onSnapshot(
    FEATURE_FLAGS_DOC,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as FeatureFlags);
      } else {
        callback({ cardGameEnabled: true });
      }
    },
    () => callback({ cardGameEnabled: true })
  );
}

// ============ Quest progress (PvE quest line + Prompt course gate) ============

export interface UserQuestProgress {
  /** Ordered list of completed PvE quest IDs (from PVE_OPPONENTS) */
  completedPveQuestIds: string[];
  /** Ordered list of completed Prompt Engineering lesson IDs */
  completedPromptLessonIds: string[];
  /** Convenience flag: true once all 11 lessons are done. Unlocks PvE quest line. */
  promptCourseCompleted: boolean;
  updatedAt?: string;
}

export async function getUserQuestProgress(userId: string): Promise<UserQuestProgress> {
  const ref = doc(db, "users", userId, "progress", "quests");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return {
      completedPveQuestIds: [],
      completedPromptLessonIds: [],
      promptCourseCompleted: false,
    };
  }
  const data = snap.data() as Partial<UserQuestProgress>;
  return {
    completedPveQuestIds: data.completedPveQuestIds || [],
    completedPromptLessonIds: data.completedPromptLessonIds || [],
    promptCourseCompleted: !!data.promptCourseCompleted,
    updatedAt: data.updatedAt,
  };
}

export async function saveUserQuestProgress(
  userId: string,
  progress: UserQuestProgress
): Promise<void> {
  const ref = doc(db, "users", userId, "progress", "quests");
  await setDoc(ref, { ...progress, updatedAt: new Date().toISOString() });
}

export async function markPveQuestCompleted(userId: string, questId: string): Promise<UserQuestProgress> {
  const current = await getUserQuestProgress(userId);
  if (current.completedPveQuestIds.includes(questId)) return current;
  const updated: UserQuestProgress = {
    ...current,
    completedPveQuestIds: [...current.completedPveQuestIds, questId],
  };
  await saveUserQuestProgress(userId, updated);
  return updated;
}

export async function markPromptLessonCompleted(
  userId: string,
  lessonId: string,
  totalLessons: number
): Promise<UserQuestProgress> {
  const current = await getUserQuestProgress(userId);
  if (current.completedPromptLessonIds.includes(lessonId)) return current;
  const newCompleted = [...current.completedPromptLessonIds, lessonId];
  const updated: UserQuestProgress = {
    ...current,
    completedPromptLessonIds: newCompleted,
    promptCourseCompleted: newCompleted.length >= totalLessons,
  };
  await saveUserQuestProgress(userId, updated);
  return updated;
}

// ============ Card Animations (AI-generated MP4/WebM URLs) ============

export interface CardAnimationData {
  attackUrl?: string;
  drawRevealUrl?: string;
  updatedAt?: string;
}

const CARD_ANIMATIONS_COLLECTION = "cardAnimations";

export async function getCardAnimation(cardId: string): Promise<CardAnimationData | null> {
  const docRef = doc(db, CARD_ANIMATIONS_COLLECTION, cardId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data() as CardAnimationData;
}

export async function getAllCardAnimations(): Promise<Record<string, CardAnimationData>> {
  const colRef = collection(db, CARD_ANIMATIONS_COLLECTION);
  const snap = await getDocs(colRef);
  const map: Record<string, CardAnimationData> = {};
  snap.forEach((d) => {
    map[d.id] = d.data() as CardAnimationData;
  });
  return map;
}

export async function saveCardAnimation(
  cardId: string,
  field: 'attackUrl' | 'drawRevealUrl',
  url: string
): Promise<void> {
  const docRef = doc(db, CARD_ANIMATIONS_COLLECTION, cardId);
  const existing = (await getDoc(docRef)).data() as CardAnimationData | undefined;
  await setDoc(docRef, {
    ...(existing || {}),
    [field]: url,
    updatedAt: new Date().toISOString(),
  });
}

export function onCardAnimationsChange(
  callback: (map: Record<string, CardAnimationData>) => void
): () => void {
  const colRef = collection(db, CARD_ANIMATIONS_COLLECTION);
  return onSnapshot(
    colRef,
    (snap) => {
      const map: Record<string, CardAnimationData> = {};
      snap.forEach((d) => {
        map[d.id] = d.data() as CardAnimationData;
      });
      callback(map);
    },
    () => callback({})
  );
}

// ============ Themes ============

export interface ThemeState {
  purchasedThemes: string[];
  currentTheme: string;
}

export async function getThemeState(userId: string): Promise<ThemeState | null> {
  const snap = await getDoc(doc(db, "themes", userId));
  return snap.exists() ? (snap.data() as ThemeState) : null;
}

export async function saveThemeState(userId: string, state: ThemeState): Promise<void> {
  await setDoc(doc(db, "themes", userId), state);
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

// ============ Quest Images (PvE quest card art) ============

export interface QuestImageMap {
  [questId: string]: string; // PveOpponent.id -> imageUrl
}

export async function getQuestImages(): Promise<QuestImageMap> {
  const snap = await getDoc(doc(db, "system", "questImages"));
  return snap.exists() ? (snap.data() as QuestImageMap) : {};
}

export async function saveQuestImages(images: QuestImageMap): Promise<void> {
  await setDoc(doc(db, "system", "questImages"), images);
}

export function onQuestImagesChange(
  callback: (map: QuestImageMap) => void
): () => void {
  const ref = doc(db, "system", "questImages");
  return onSnapshot(
    ref,
    (snap) => callback(snap.exists() ? (snap.data() as QuestImageMap) : {}),
    () => callback({})
  );
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

// ============ Worksheets ============

export async function getWorksheets(): Promise<Worksheet[]> {
  const snap = await getDocs(collection(db, "worksheets"));
  return snap.docs.map((d) => d.data() as Worksheet);
}

export async function getWorksheet(id: string): Promise<Worksheet | null> {
  const snap = await getDoc(doc(db, "worksheets", id));
  return snap.exists() ? (snap.data() as Worksheet) : null;
}

export async function getPublishedWorksheetsByClass(classId: string): Promise<Worksheet[]> {
  const q = query(
    collection(db, "worksheets"),
    where("classId", "==", classId),
    where("isPublished", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Worksheet);
}

export async function saveWorksheet(worksheet: Worksheet): Promise<void> {
  await setDoc(doc(db, "worksheets", worksheet.id), worksheet);
}

export async function deleteWorksheet(id: string): Promise<void> {
  await deleteDoc(doc(db, "worksheets", id));
}

// ============ Student Worksheet Progress ============

export async function getStudentWorksheetProgress(
  studentId: string,
  worksheetId: string
): Promise<StudentWorksheetProgress | null> {
  const snap = await getDoc(
    doc(db, "studentProgress", studentId, "worksheets", worksheetId)
  );
  return snap.exists() ? (snap.data() as StudentWorksheetProgress) : null;
}

export async function getAllStudentProgressForWorksheet(
  studentIds: string[],
  worksheetId: string
): Promise<Record<string, StudentWorksheetProgress>> {
  const result: Record<string, StudentWorksheetProgress> = {};
  const chunks = chunkArray(studentIds, 10);
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (sid) => {
        const progress = await getStudentWorksheetProgress(sid, worksheetId);
        if (progress) result[sid] = progress;
      })
    );
  }
  return result;
}

export async function getAllProgressForStudent(
  studentId: string
): Promise<StudentWorksheetProgress[]> {
  const snap = await getDocs(
    collection(db, "studentProgress", studentId, "worksheets")
  );
  return snap.docs.map((d) => d.data() as StudentWorksheetProgress);
}

export async function recordWorksheetOpened(
  studentId: string,
  worksheet: Worksheet
): Promise<void> {
  const ref = doc(db, "studentProgress", studentId, "worksheets", worksheet.id);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data()?.firstOpenedAt) return;
  await setDoc(ref, {
    studentId,
    worksheetId: worksheet.id,
    semester: worksheet.semester,
    week: worksheet.week,
    classId: worksheet.classId,
    firstOpenedAt: new Date().toISOString(),
    tasks: {},
    totalCoinsAwarded: 0,
    completedTaskCount: 0,
    lastUpdatedAt: new Date().toISOString(),
  }, { merge: true });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ============ Approve / Revoke Task (Transactional) ============

export async function approveTask(params: {
  studentId: string;
  studentName: string;
  worksheetId: string;
  taskId: string;
  teacherId: string;
  teacherName: string;
}): Promise<void> {
  const { studentId, studentName, worksheetId, taskId, teacherId, teacherName } = params;

  await runTransaction(db, async (tx) => {
    const worksheetRef = doc(db, "worksheets", worksheetId);
    const worksheetSnap = await tx.get(worksheetRef);
    if (!worksheetSnap.exists()) throw new Error("Worksheet not found");
    const worksheet = worksheetSnap.data() as Worksheet;

    const task = worksheet.tasks.find((t) => t.taskId === taskId);
    if (!task) throw new Error("Task not found");

    const progressRef = doc(db, "studentProgress", studentId, "worksheets", worksheetId);
    const progressSnap = await tx.get(progressRef);
    const progress = progressSnap.exists()
      ? (progressSnap.data() as StudentWorksheetProgress)
      : null;

    if (progress?.tasks?.[taskId]?.completed) {
      throw new Error("Task already approved");
    }

    const coinRef = doc(db, "coins", studentId);
    const coinSnap = await tx.get(coinRef);
    const coinState = coinSnap.exists()
      ? (coinSnap.data() as CoinState)
      : { balance: 0, totalEarned: 0, transactions: [] };

    const now = new Date().toISOString();
    const coins = task.coins;

    tx.set(progressRef, {
      studentId,
      worksheetId,
      semester: worksheet.semester,
      week: worksheet.week,
      classId: worksheet.classId,
      firstOpenedAt: progress?.firstOpenedAt || null,
      tasks: {
        ...(progress?.tasks || {}),
        [taskId]: {
          completed: true,
          completedAt: now,
          approvedBy: teacherId,
          approverName: teacherName,
          coinsAwarded: coins,
        } as TaskProgress,
      },
      totalCoinsAwarded: (progress?.totalCoinsAwarded || 0) + coins,
      completedTaskCount: (progress?.completedTaskCount || 0) + 1,
      lastUpdatedAt: now,
    } as StudentWorksheetProgress);

    const newTx = {
      id: `ws_${worksheetId}_${taskId}_${Date.now()}`,
      amount: coins,
      reason: `學習單完成：${task.label}`,
      timestamp: now,
    };
    tx.set(coinRef, {
      balance: coinState.balance + coins,
      totalEarned: coinState.totalEarned + coins,
      transactions: [...(coinState.transactions || []), newTx].slice(-50),
    });

    const auditRef = doc(collection(db, "auditLog"));
    tx.set(auditRef, {
      action: "award_coins",
      teacherId,
      teacherName,
      studentId,
      studentName,
      worksheetId,
      worksheetTitle: worksheet.title,
      semester: worksheet.semester,
      week: worksheet.week,
      taskId,
      taskLabel: task.label,
      coins,
      timestamp: now,
    } as AuditLogEntry);
  });
}

export async function revokeTask(params: {
  studentId: string;
  studentName: string;
  worksheetId: string;
  taskId: string;
  teacherId: string;
  teacherName: string;
}): Promise<void> {
  const { studentId, studentName, worksheetId, taskId, teacherId, teacherName } = params;

  await runTransaction(db, async (tx) => {
    const progressRef = doc(db, "studentProgress", studentId, "worksheets", worksheetId);
    const progressSnap = await tx.get(progressRef);
    if (!progressSnap.exists()) throw new Error("Progress not found");
    const progress = progressSnap.data() as StudentWorksheetProgress;

    const taskProgress = progress.tasks?.[taskId];
    if (!taskProgress?.completed) throw new Error("Task not completed");

    const coinsToRevoke = taskProgress.coinsAwarded;

    const worksheetRef = doc(db, "worksheets", worksheetId);
    const worksheetSnap = await tx.get(worksheetRef);
    const worksheet = worksheetSnap.exists()
      ? (worksheetSnap.data() as Worksheet)
      : null;

    const coinRef = doc(db, "coins", studentId);
    const coinSnap = await tx.get(coinRef);
    const coinState = coinSnap.exists()
      ? (coinSnap.data() as CoinState)
      : { balance: 0, totalEarned: 0, transactions: [] };

    const safeRevoke = Math.min(coinsToRevoke, coinState.balance);
    const now = new Date().toISOString();

    const updatedTasks = { ...progress.tasks };
    updatedTasks[taskId] = {
      completed: false,
      completedAt: null,
      approvedBy: null,
      approverName: null,
      coinsAwarded: 0,
    };

    tx.set(progressRef, {
      ...progress,
      tasks: updatedTasks,
      totalCoinsAwarded: Math.max(0, progress.totalCoinsAwarded - coinsToRevoke),
      completedTaskCount: Math.max(0, progress.completedTaskCount - 1),
      lastUpdatedAt: now,
    });

    const newTx = {
      id: `ws_revoke_${worksheetId}_${taskId}_${Date.now()}`,
      amount: -safeRevoke,
      reason: `學習單撤銷：${worksheet?.tasks.find((t) => t.taskId === taskId)?.label || taskId}`,
      timestamp: now,
    };
    tx.set(coinRef, {
      balance: Math.max(0, coinState.balance - safeRevoke),
      totalEarned: coinState.totalEarned,
      transactions: [...(coinState.transactions || []), newTx].slice(-50),
    });

    const auditRef = doc(collection(db, "auditLog"));
    tx.set(auditRef, {
      action: "revoke_coins",
      teacherId,
      teacherName,
      studentId,
      studentName,
      worksheetId,
      worksheetTitle: worksheet?.title || "",
      semester: worksheet?.semester || progress.semester,
      week: worksheet?.week || progress.week,
      taskId,
      taskLabel: worksheet?.tasks.find((t) => t.taskId === taskId)?.label || taskId,
      coins: -safeRevoke,
      timestamp: now,
    } as AuditLogEntry);
  });
}

// ============ Audit Log ============

export async function getAuditLogs(opts: {
  worksheetId?: string;
  studentId?: string;
  limitCount?: number;
}): Promise<AuditLogEntry[]> {
  let q;
  if (opts.worksheetId) {
    q = query(
      collection(db, "auditLog"),
      where("worksheetId", "==", opts.worksheetId),
      orderBy("timestamp", "desc"),
      firestoreLimit(opts.limitCount || 100)
    );
  } else if (opts.studentId) {
    q = query(
      collection(db, "auditLog"),
      where("studentId", "==", opts.studentId),
      orderBy("timestamp", "desc"),
      firestoreLimit(opts.limitCount || 100)
    );
  } else {
    q = query(
      collection(db, "auditLog"),
      orderBy("timestamp", "desc"),
      firestoreLimit(opts.limitCount || 100)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as AuditLogEntry);
}

export function onStudentProgressChange(
  studentId: string,
  worksheetId: string,
  callback: (progress: StudentWorksheetProgress | null) => void
): () => void {
  const ref = doc(db, "studentProgress", studentId, "worksheets", worksheetId);
  return onSnapshot(
    ref,
    (snap) => callback(snap.exists() ? (snap.data() as StudentWorksheetProgress) : null),
    () => callback(null)
  );
}

// Helper: find which classroom a student belongs to
export async function getStudentClassId(studentId: string): Promise<string | null> {
  const classrooms = await getClassrooms();
  for (const cls of classrooms) {
    if (cls.studentIds.includes(studentId)) return cls.id;
  }
  return null;
}
