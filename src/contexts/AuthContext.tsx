import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { v4 as uuid } from "uuid";
import { User } from "@/types/User";
import { createDefaultMemory } from "@/types/Memory";
import {
  getUser,
  getUserByUsername,
  getUserByStudentId,
  saveUser,
  saveMemory as saveMemoryToFirestore,
} from "@/lib/firestore";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string) => Promise<{ success: boolean; error?: string }>;
  loginWithFace: (studentId: string, name: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, displayName?: string, kidMode?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Session storage for current login (survives refresh, clears on tab close)
// Use localStorage for persistence across tabs
const getSessionUser = (): User | null => {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("@session/currentUser");
  return stored ? JSON.parse(stored) : null;
};

const setSessionUser = (user: User | null) => {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem("@session/currentUser", JSON.stringify(user));
  } else {
    localStorage.removeItem("@session/currentUser");
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user on mount from session
  useEffect(() => {
    const loadUser = async () => {
      const sessionUser = getSessionUser();
      if (sessionUser) {
        // Show session data immediately (includes latest avatar)
        setUser(sessionUser);

        // Then try to sync with Firestore
        try {
          const freshUser = await getUser(sessionUser.id);
          if (freshUser) {
            // Merge: prefer session avatar if Firestore is stale
            const merged: User = {
              ...freshUser,
              avatar: sessionUser.avatar || freshUser.avatar,
            };
            setUser(merged);
            setSessionUser(merged);
          }
        } catch (e) {
          console.error("Failed to load user from Firestore:", e);
          // Keep using session data
        }
      }
      setIsLoading(false);
    };
    loadUser();
  }, []);

  const login = async (username: string): Promise<{ success: boolean; error?: string }> => {
    const existingUser = await getUserByUsername(username);

    if (!existingUser) {
      return { success: false, error: "用戶不存在，請先註冊" };
    }

    const updatedUser: User = {
      ...existingUser,
      lastActiveAt: new Date().toISOString(),
    };

    await saveUser(updatedUser);
    setSessionUser(updatedUser);
    setUser(updatedUser);

    return { success: true };
  };

  const loginWithFace = async (
    studentId: string,
    name: string
  ): Promise<{ success: boolean; error?: string }> => {
    // Look up existing user by student_id
    let existingUser = await getUserByStudentId(studentId);

    if (existingUser) {
      // Existing user — update lastActiveAt and login
      const updatedUser: User = {
        ...existingUser,
        lastActiveAt: new Date().toISOString(),
      };
      await saveUser(updatedUser);
      setSessionUser(updatedUser);
      setUser(updatedUser);
      return { success: true };
    }

    // First-time face login — auto-create account
    const newUser: User = {
      id: uuid(),
      username: studentId,
      displayName: name,
      studentId,
      kidMode: true,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    await saveUser(newUser);
    await saveMemoryToFirestore(newUser.id, createDefaultMemory(newUser.id));

    setSessionUser(newUser);
    setUser(newUser);
    return { success: true };
  };

  const register = async (
    username: string,
    displayName?: string,
    kidMode?: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    if (!username.trim()) {
      return { success: false, error: "請輸入用戶名" };
    }

    if (username.length < 2) {
      return { success: false, error: "用戶名至少需要 2 個字元" };
    }

    const exists = await getUserByUsername(username);
    if (exists) {
      return { success: false, error: "用戶名已存在" };
    }

    const newUser: User = {
      id: uuid(),
      username: username.trim(),
      displayName: displayName?.trim() || username.trim(),
      kidMode: kidMode ?? true,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    // Save user and default memory to Firestore
    await saveUser(newUser);
    await saveMemoryToFirestore(newUser.id, createDefaultMemory(newUser.id));

    setSessionUser(newUser);
    setUser(newUser);

    return { success: true };
  };

  const logout = () => {
    if (user) {
      const updatedUser = { ...user, lastActiveAt: new Date().toISOString() };
      saveUser(updatedUser); // fire and forget
    }
    setSessionUser(null);
    setUser(null);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;

    const updatedUser: User = { ...user, ...updates };
    // Update local state immediately
    setSessionUser(updatedUser);
    setUser(updatedUser);
    // Persist to Firestore (await to ensure it's saved before navigation)
    try {
      await saveUser(updatedUser);
    } catch (e) {
      console.error("Failed to save user to Firestore:", e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginWithFace,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    // SSR fallback — return safe defaults
    return {
      user: null,
      isAuthenticated: false,
      isLoading: true,
      login: async () => ({ success: false, error: "Not initialized" }),
      loginWithFace: async () => ({ success: false, error: "Not initialized" }),
      register: async () => ({ success: false, error: "Not initialized" }),
      logout: () => {},
      updateUser: () => {},
    };
  }
  return context;
};

export default AuthContext;
