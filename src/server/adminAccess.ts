import { getUser } from "@/lib/firestore";

const ADMIN_USERNAMES = new Set(["admin", "teacher", "老師"]);

export async function requireAdminUser(adminUserId: unknown) {
  const userId = typeof adminUserId === "string" ? adminUserId.trim() : "";
  if (!userId) throw new Error("Admin session is required.");
  const user = await getUser(userId);
  if (!user || !ADMIN_USERNAMES.has(user.username.toLowerCase())) {
    throw new Error("Admin permission is required.");
  }
  return user;
}
