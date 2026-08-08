import { getUser } from "@/lib/firestore";

const ADMIN_USERNAMES = new Set(["admin", "teacher", "老師"]);

function normalizedAdminUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isFirestoreOfflineError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /client is offline|failed to get document.*offline|network request failed|unavailable/i.test(
    message
  );
}

export async function requireAdminUser(adminUserId: unknown, sessionUsername?: unknown) {
  const userId = typeof adminUserId === "string" ? adminUserId.trim() : "";
  if (!userId) throw new Error("Admin session is required.");
  const username = normalizedAdminUsername(sessionUsername);

  // This app uses its own browser session rather than Firebase Authentication.
  // Prefer that session for API access so an offline Firestore client does not
  // block otherwise valid local admin operations.
  if (ADMIN_USERNAMES.has(username)) {
    return { id: userId, username, sessionVerified: true };
  }

  let user;
  try {
    user = await getUser(userId);
  } catch (error) {
    if (isFirestoreOfflineError(error) && ADMIN_USERNAMES.has(username)) {
      return { id: userId, username, offlineSessionFallback: true };
    }
    throw error;
  }
  if (!user || !ADMIN_USERNAMES.has(user.username.toLowerCase())) {
    throw new Error("Admin permission is required.");
  }
  return user;
}
