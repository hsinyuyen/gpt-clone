import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import LoginForm from "@/components/LoginForm";

const LoginPage = () => {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center terminal-screen terminal-scanline">
        <div className="text-[var(--terminal-green)] glow-text flex items-center gap-2">
          <span className="animate-spin">◐</span>
          LOADING_SYSTEM...
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center p-4 terminal-screen terminal-scanline terminal-flicker">
      <LoginForm onSuccess={() => router.push("/")} />
    </div>
  );
};

export default LoginPage;
