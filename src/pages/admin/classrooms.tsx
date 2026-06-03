import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAllUsers,
  getClassrooms,
  saveClassroom,
  deleteClassroom as deleteClassroomDoc,
  Classroom,
} from "@/lib/firestore";
import { User } from "@/types/User";

const ADMIN_USERNAMES = ["admin", "teacher", "老師"];

export default function ClassroomsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStudentIds, setEditStudentIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const isAdmin =
    user &&
    ADMIN_USERNAMES.includes(user.username.toLowerCase());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [cls, users] = await Promise.all([getClassrooms(), getAllUsers()]);
    setClassrooms(cls.sort((a, b) => a.name.localeCompare(b.name)));
    setAllUsers(users.filter((u) => !ADMIN_USERNAMES.includes(u.username.toLowerCase())));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
      return;
    }
    if (user && isAdmin) loadData();
  }, [user, isLoading, isAdmin, router, loadData]);

  const startCreate = () => {
    setEditingId("__new__");
    setEditName("");
    setEditStudentIds(new Set());
    setSearch("");
  };

  const startEdit = (cls: Classroom) => {
    setEditingId(cls.id);
    setEditName(cls.name);
    setEditStudentIds(new Set(cls.studentIds));
    setSearch("");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editName.trim()) return;
    const now = new Date().toISOString();
    const id =
      editingId === "__new__"
        ? `cls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        : editingId!;

    const classroom: Classroom = {
      id,
      name: editName.trim(),
      studentIds: Array.from(editStudentIds),
      createdAt:
        editingId === "__new__"
          ? now
          : classrooms.find((c) => c.id === id)?.createdAt || now,
      updatedAt: now,
    };

    await saveClassroom(classroom);
    await loadData();
    setEditingId(null);
  };

  const handleDelete = async (cls: Classroom) => {
    if (!confirm(`確定要刪除「${cls.name}」？`)) return;
    await deleteClassroomDoc(cls.id);
    await loadData();
  };

  const toggleStudent = (userId: string) => {
    setEditStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const filteredUsers = allUsers.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.displayName || "").toLowerCase().includes(q)
    );
  });

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary)]">
        載入中...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-red-400">
        無權限存取
      </div>
    );
  }

  // ---- Editor View ----
  if (editingId) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-bold">
              {editingId === "__new__" ? "建立新課堂" : "編輯課堂"}
            </h1>
            <button
              onClick={cancelEdit}
              className="px-4 py-2 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 transition-colors"
            >
              取消
            </button>
          </div>

          {/* Name */}
          <div className="mb-6">
            <label className="text-sm text-[var(--terminal-primary-dim)] block mb-2">
              課堂名稱
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="例：三年甲班、週五數學班"
              className="w-full bg-[var(--terminal-bg)] border-2 border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-4 py-3 text-lg focus:border-[var(--terminal-primary)] outline-none"
            />
          </div>

          {/* Student search */}
          <div className="mb-4">
            <label className="text-sm text-[var(--terminal-primary-dim)] block mb-2">
              選擇學生（已選 {editStudentIds.size} 位）
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋學生名稱..."
              className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-4 py-3 text-base focus:border-[var(--terminal-primary)] outline-none mb-3"
            />
          </div>

          {/* Selected students */}
          {editStudentIds.size > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {Array.from(editStudentIds).map((sid) => {
                const u = allUsers.find((x) => x.id === sid);
                if (!u) return null;
                return (
                  <button
                    key={sid}
                    onClick={() => toggleStudent(sid)}
                    className="px-3 py-1.5 text-sm bg-[var(--terminal-primary)] text-[var(--terminal-bg)] font-bold flex items-center gap-1"
                  >
                    {u.displayName || u.username}
                    <span className="text-xs opacity-70">x</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Student list */}
          <div className="border border-[var(--terminal-primary-dim)] max-h-[50vh] overflow-y-auto">
            {filteredUsers.map((u) => {
              const selected = editStudentIds.has(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => toggleStudent(u.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-[var(--terminal-primary-dim)]/30 transition-colors ${
                    selected
                      ? "bg-[var(--terminal-primary)]/15 text-[var(--terminal-primary)]"
                      : "hover:bg-[var(--terminal-primary)]/5"
                  }`}
                >
                  <div>
                    <div className="text-base font-bold">
                      {u.displayName || u.username}
                    </div>
                    <div className="text-xs text-[var(--terminal-primary-dim)]">
                      @{u.username}
                    </div>
                  </div>
                  <div className="text-lg">{selected ? "✓" : ""}</div>
                </button>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="text-center text-[var(--terminal-primary-dim)] py-8">
                沒有找到學生
              </div>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={saveEdit}
            disabled={!editName.trim()}
            className="w-full mt-6 py-4 text-lg font-bold border-2 border-[var(--terminal-primary)] text-[var(--terminal-primary)] hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            儲存課堂
          </button>
        </div>
      </div>
    );
  }

  // ---- List View ----
  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold">課堂管理</h1>
            <div className="text-xs text-[var(--terminal-primary-dim)]">
              共 {classrooms.length} 個課堂
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/admin")}
              className="px-4 py-2 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 transition-colors"
            >
              返回
            </button>
            <button
              onClick={startCreate}
              className="px-4 py-2 text-sm font-bold border-2 border-[var(--terminal-primary)] text-[var(--terminal-primary)] hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)] transition-colors"
            >
              + 新增課堂
            </button>
          </div>
        </div>

        {/* Classroom cards */}
        {classrooms.length === 0 ? (
          <div className="text-center py-16 text-[var(--terminal-primary-dim)]">
            <div className="text-4xl mb-4">📚</div>
            <div>還沒有建立任何課堂</div>
            <div className="text-xs mt-1">點擊「+ 新增課堂」開始</div>
          </div>
        ) : (
          <div className="space-y-3">
            {classrooms.map((cls) => (
              <div
                key={cls.id}
                className="border border-[var(--terminal-primary-dim)] p-4 hover:border-[var(--terminal-primary)] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-base font-bold">{cls.name}</div>
                  <div className="text-xs text-[var(--terminal-primary-dim)]">
                    {cls.studentIds.length} 位學生
                  </div>
                </div>

                {/* Student preview */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {cls.studentIds.slice(0, 8).map((sid) => {
                    const u = allUsers.find((x) => x.id === sid);
                    return (
                      <span
                        key={sid}
                        className="px-2 py-0.5 text-xs bg-[var(--terminal-primary)]/10 border border-[var(--terminal-primary-dim)]/30"
                      >
                        {u?.displayName || u?.username || "?"}
                      </span>
                    );
                  })}
                  {cls.studentIds.length > 8 && (
                    <span className="px-2 py-0.5 text-xs text-[var(--terminal-primary-dim)]">
                      +{cls.studentIds.length - 8} 位
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      router.push(`/admin/classroom/${cls.id}`)
                    }
                    className="flex-1 py-3 text-base font-bold border-2 border-[var(--terminal-accent)] text-[var(--terminal-accent)] hover:bg-[var(--terminal-accent)] hover:text-[var(--terminal-bg)] transition-colors"
                  >
                    ◆ 發送金幣
                  </button>
                  <button
                    onClick={() => startEdit(cls)}
                    className="px-4 py-3 text-sm border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 transition-colors"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => handleDelete(cls)}
                    className="px-4 py-3 text-sm border border-red-400/50 text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
