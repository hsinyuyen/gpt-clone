import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useFaceIdentity, FaceStatus } from "@/hooks/useFaceIdentity";
import { FaceIdentityEvent } from "@/types/User";
import TutorialOverlay, { TutorialStep } from "./TutorialOverlay";

interface LoginFormProps {
  onSuccess?: () => void;
}

const LoginForm = ({ onSuccess }: LoginFormProps) => {
  const { login, loginWithFace, register } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [kidMode, setKidMode] = useState(true);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);
  const [bootMessages, setBootMessages] = useState<string[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [faceLoginPending, setFaceLoginPending] = useState(false);
  const [faceUserName, setFaceUserName] = useState("");

  // Face recognition login handler
  const handleFaceLogin = useCallback(async (event: FaceIdentityEvent) => {
    if (!event.student_id || faceLoginPending) return;
    setFaceLoginPending(true);
    setFaceUserName(event.name || event.student_id);
    setError("");

    try {
      const result = await loginWithFace(event.student_id, event.name || event.student_id);
      if (result.success) {
        onSuccess?.();
      } else {
        setError(result.error || "FACE_LOGIN_FAILED");
        setFaceLoginPending(false);
      }
    } catch (err: any) {
      setError(err?.message || "FACE_AUTH_ERROR");
      setFaceLoginPending(false);
    }
  }, [loginWithFace, onSuccess, faceLoginPending]);

  const { status: faceStatus } = useFaceIdentity({
    enabled: bootComplete && !isLoading,
    onLogin: handleFaceLogin,
  });

  const bootSequence = [
    "INITIALIZING SYSTEM...",
    "LOADING KERNEL MODULES...",
    "CHECKING MEMORY BANKS...",
    "ESTABLISHING SECURE CONNECTION...",
    "SCANNING FACE_ID SERVICE...",
    "AI CORE ONLINE...",
    "SYSTEM READY.",
  ];

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < bootSequence.length) {
        setBootMessages((prev) => [...prev, bootSequence[index]]);
        index++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setBootComplete(true);
          // Auto-start tutorial after boot
          setTimeout(() => setShowTutorial(true), 600);
        }, 500);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = isRegisterMode
        ? await register(username, displayName, kidMode)
        : await login(username);

      if (result.success) {
        onSuccess?.();
      } else {
        setError(result.error || "OPERATION_FAILED");
      }
    } catch (err: any) {
      console.error("Login/Register error:", err);
      setError(err?.message || "SYSTEM_ERROR: RETRY_LATER");
    } finally {
      setIsLoading(false);
    }
  };

  // Tutorial steps for login page
  const tutorialSteps: TutorialStep[] = [
    {
      target: "[data-tutorial='register-toggle']",
      text: "第一次來嗎？先點這裡切換到「註冊」模式！",
      position: "top",
      clickToAdvance: true,
      beforeShow: () => {
        // Make sure we're in login mode so they can click to register
        if (isRegisterMode) setIsRegisterMode(false);
      },
    },
    {
      target: "[data-tutorial='username-input']",
      text: "在這裡輸入你的名字，這是你的帳號名稱喔！",
      position: "bottom",
    },
    {
      target: "[data-tutorial='mode-selector']",
      text: "選擇模式！「教學模式」會一步一步教你，建議第一次使用選這個！",
      position: "top",
    },
    {
      target: "[data-tutorial='submit-btn']",
      text: "都填好了嗎？按這個按鈕就可以建立帳號了！",
      position: "top",
    },
  ];

  return (
    <div className="w-full max-w-lg mx-auto terminal-screen terminal-scanline">
      <div className="terminal-border p-6 bg-[var(--terminal-bg)]">
        {/* Boot Sequence */}
        {!bootComplete && (
          <div className="space-y-1 mb-6">
            {bootMessages.map((msg, i) => (
              <div
                key={i}
                className="text-[var(--terminal-green)] text-xs animate-pulse"
              >
                {'>'} {msg}
              </div>
            ))}
            <span className="terminal-cursor"></span>
          </div>
        )}

        {/* Main Content */}
        {bootComplete && (
          <div className="boot-animation">
            {/* ASCII Header */}
            <pre className="text-[var(--terminal-green)] glow-text text-[8px] sm:text-[10px] text-center leading-tight mb-6">
{`
╔═══════════════════════════════════════════╗
║                                           ║
║     ██╗      █████╗ ██████╗               ║
║     ██║     ██╔══██╗██╔══██╗              ║
║     ██║     ███████║██████╔╝              ║
║     ██║     ██╔══██║██╔══██╗              ║
║     ███████╗██║  ██║██████╔╝              ║
║     ╚══════╝╚═╝  ╚═╝╚═════╝               ║
║                                           ║
║         TERMINAL ACCESS POINT             ║
║                                           ║
╚═══════════════════════════════════════════╝
`}
            </pre>

            {/* Face Recognition Status */}
            {faceStatus !== "unavailable" && (
              <div className="mb-4 border border-[var(--terminal-cyan)] p-3 bg-cyan-900/10">
                <div className="text-[var(--terminal-cyan)] text-xs mb-2 flex items-center gap-2">
                  <span>◉</span> FACE_ID_SERVICE
                  {faceStatus === "checking" && (
                    <span className="animate-pulse text-[var(--terminal-amber)]">CONNECTING...</span>
                  )}
                  {faceStatus === "available" && (
                    <span className="text-[var(--terminal-green)]">ONLINE</span>
                  )}
                  {faceStatus === "waiting" && (
                    <span className="text-[var(--terminal-amber)] animate-pulse">SCANNING...</span>
                  )}
                  {faceStatus === "recognized" && (
                    <span className="text-[var(--terminal-green)]">MATCHED</span>
                  )}
                </div>

                {faceStatus === "waiting" && (
                  <div className="text-[var(--terminal-primary-dim)] text-[10px]">
                    {"// 請面向攝影機，系統正在辨識您的身份..."}
                  </div>
                )}

                {faceLoginPending && (
                  <div className="text-[var(--terminal-green)] text-xs flex items-center gap-2">
                    <span className="animate-spin">◐</span>
                    辨識成功！歡迎 {faceUserName}，正在登入...
                  </div>
                )}

                {faceStatus === "recognized" && !faceLoginPending && (
                  <div className="text-[var(--terminal-green)] text-xs">
                    ✓ IDENTITY_CONFIRMED
                  </div>
                )}
              </div>
            )}

            <div className="text-center mb-6">
              <div className="text-[var(--terminal-amber)] text-sm">
                {isRegisterMode ? "// NEW_USER_REGISTRATION" : "// USER_AUTHENTICATION"}
              </div>
              {faceStatus === "unavailable" && (
                <div className="text-[var(--terminal-primary-dim)] text-[10px] mt-1">
                  {"// FACE_ID 未偵測到，使用帳號登入"}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div data-tutorial="username-input">
                <label className="block text-[var(--terminal-green-dim)] text-xs mb-1">
                  USERNAME:
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--terminal-cyan)]">{'>'}</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="flex-1 terminal-input terminal-border px-3 py-2 text-sm"
                    placeholder="enter_username"
                    required
                    disabled={isLoading}
                    autoComplete="off"
                  />
                </div>
              </div>

              {isRegisterMode && (
                <div>
                  <label className="block text-[var(--terminal-green-dim)] text-xs mb-1">
                    DISPLAY_NAME (OPTIONAL):
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--terminal-cyan)]">{'>'}</span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="flex-1 terminal-input terminal-border px-3 py-2 text-sm"
                      placeholder="enter_display_name"
                      disabled={isLoading}
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}

              {isRegisterMode && (
                <div data-tutorial="mode-selector">
                  <label className="block text-[var(--terminal-green-dim)] text-xs mb-2">
                    MODE:
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setKidMode(true)}
                      className={`flex-1 py-2 px-3 border text-xs transition-all ${
                        kidMode
                          ? "border-[var(--terminal-cyan)] text-[var(--terminal-cyan)] glow-text-cyan"
                          : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)]"
                      }`}
                      style={kidMode ? { backgroundColor: "rgba(0,255,255,0.1)" } : undefined}
                    >
                      GUIDED_MODE
                    </button>
                    <button
                      type="button"
                      onClick={() => setKidMode(false)}
                      className={`flex-1 py-2 px-3 border text-xs transition-all ${
                        !kidMode
                          ? "border-[var(--terminal-amber)] text-[var(--terminal-amber)]"
                          : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)]"
                      }`}
                      style={!kidMode ? { backgroundColor: "rgba(255,176,0,0.1)" } : undefined}
                    >
                      FREE_MODE
                    </button>
                  </div>
                  <div className="text-[var(--terminal-primary-dim)] text-[10px] mt-1">
                    {kidMode
                      ? "// 教學模式：一步一步引導你完成所有步驟"
                      : "// 自由模式：適合已熟悉操作的使用者"}
                  </div>
                </div>
              )}

              {error && (
                <div className="text-[var(--terminal-red)] text-xs border border-[var(--terminal-red)] px-3 py-2 bg-red-900/20">
                  ERROR: {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !username.trim()}
                className="w-full terminal-btn text-sm py-3"
                data-tutorial="submit-btn"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">◐</span>
                    PROCESSING...
                  </span>
                ) : (
                  <span>
                    {'>'} {isRegisterMode ? "CREATE_ACCOUNT" : "LOGIN"}
                  </span>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                data-tutorial="register-toggle"
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setError("");
                }}
                className="text-[var(--terminal-cyan)] hover:glow-text-cyan text-xs"
              >
                {isRegisterMode
                  ? "// EXISTING_USER? >> LOGIN"
                  : "// NEW_USER? >> REGISTER"}
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--terminal-green)] text-center text-[10px] text-[var(--terminal-green-dim)]">
              <div>SYSTEM v2.0.0 | SECURE_CONNECTION</div>
              <div>© LAB TERMINAL {new Date().getFullYear()}</div>
            </div>
          </div>
        )}
      </div>

      {/* Tutorial Overlay */}
      <TutorialOverlay
        steps={tutorialSteps}
        active={showTutorial && bootComplete}
        onComplete={() => setShowTutorial(false)}
        skippable
      />
    </div>
  );
};

export default LoginForm;
