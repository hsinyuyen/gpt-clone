// Prompt Engineering 課程頁面 — 11 堂線性解鎖的課。每堂課玩家寫 prompt
// → 送 AI 助理 → AI 給回應 + 自動評分 → 通過拿金幣 + 解鎖下一堂。
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useCoin } from "@/contexts/CoinContext";
import {
  PROMPT_LESSONS,
  PromptLesson,
  TOTAL_LESSONS,
} from "@/data/promptLessons";
import {
  getUserQuestProgress,
  markPromptLessonCompleted,
  UserQuestProgress,
} from "@/lib/firestore";
import CoinDisplay from "@/components/CoinDisplay";

export default function PromptCoursePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { addCoins } = useCoin();
  const [progress, setProgress] = useState<UserQuestProgress | null>(null);
  const [activeLesson, setActiveLesson] = useState<PromptLesson | null>(null);
  const [userPrompt, setUserPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [evalResult, setEvalResult] = useState<{ passed: boolean; feedback: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    getUserQuestProgress(user.id).then(setProgress);
  }, [user]);

  // Deep-link: ?lesson=<id>&returnQuest=<questId> auto-opens that lesson and
  // remembers where to return after completion.
  useEffect(() => {
    if (!router.isReady || activeLesson) return;
    const lessonQ = router.query.lesson;
    if (typeof lessonQ === 'string') {
      const lesson = PROMPT_LESSONS.find((l) => l.id === lessonQ);
      if (lesson) openLesson(lesson);
    }
  }, [router.isReady, router.query, activeLesson]);

  const returnQuest = typeof router.query.returnQuest === 'string' ? router.query.returnQuest : null;

  const completedIds = progress?.completedPromptLessonIds || [];
  const allDone = completedIds.length >= TOTAL_LESSONS;

  const openLesson = (lesson: PromptLesson) => {
    setActiveLesson(lesson);
    setUserPrompt("");
    setAiResponse(null);
    setEvalResult(null);
    setError(null);
  };

  const closeLesson = () => {
    setActiveLesson(null);
    setUserPrompt("");
    setAiResponse(null);
    setEvalResult(null);
    setError(null);
  };

  const submit = async () => {
    if (!activeLesson || !userPrompt.trim()) return;
    setBusy(true);
    setError(null);
    setEvalResult(null);
    setAiResponse(null);

    try {
      // Step 1: send the player's prompt to the AI assistant for a real response
      const chatRes = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const chatData = await chatRes.json();
      const reply =
        chatData?.message ||
        chatData?.choices?.[0]?.message?.content ||
        chatData?.content ||
        "（AI 沒有回應）";
      setAiResponse(reply);

      // Step 2: ask another AI call to evaluate whether the prompt meets the criteria
      const evalRes = await fetch("/api/evaluate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonTitle: activeLesson.title,
          technique: activeLesson.technique,
          criteria: activeLesson.evalCriteria,
          userPrompt,
          badExample: activeLesson.badPromptExample,
          goodExample: activeLesson.goodPromptExample,
        }),
      });
      const evalData = await evalRes.json();
      if (!evalRes.ok) throw new Error(evalData.error || "評分失敗");
      setEvalResult({ passed: !!evalData.passed, feedback: evalData.feedback || "" });

      // Step 3: if passed AND not already completed, give coins + persist
      const alreadyCompleted = completedIds.includes(activeLesson.id);
      if (evalData.passed && !alreadyCompleted && user) {
        addCoins(activeLesson.reward, `完成 Prompt 課程: ${activeLesson.title}`);
        const updated = await markPromptLessonCompleted(user.id, activeLesson.id, TOTAL_LESSONS);
        setProgress(updated);
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-cyan-300">
        載入中...
      </div>
    );
  }

  // === Active lesson view ============================================
  if (activeLesson) {
    const alreadyDone = completedIds.includes(activeLesson.id);
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={closeLesson}
              className="text-sm text-cyan-300 hover:underline"
            >
              ← 返回課程列表
            </button>
            <CoinDisplay />
          </div>

          {/* Lesson card */}
          <div className="border-2 border-cyan-600 bg-cyan-900/10 rounded-lg p-5 mb-5">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-xl font-bold text-cyan-300">{activeLesson.title}</h1>
              {alreadyDone && <span className="text-[10px] px-2 py-0.5 bg-green-600 text-white rounded">✓ 已完成</span>}
            </div>
            <div className="text-xs text-cyan-400 mb-3">技巧：{activeLesson.technique}</div>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">{activeLesson.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="border border-red-700 bg-red-900/20 rounded p-3">
                <div className="text-[10px] text-red-400 font-bold mb-1">❌ 不好的範例</div>
                <code className="text-xs text-red-200 break-words">{activeLesson.badPromptExample}</code>
              </div>
              <div className="border border-green-700 bg-green-900/20 rounded p-3">
                <div className="text-[10px] text-green-400 font-bold mb-1">✓ 好的範例</div>
                <code className="text-xs text-green-200 break-words">{activeLesson.goodPromptExample}</code>
              </div>
            </div>
          </div>

          {/* Challenge */}
          <div className="border-2 border-yellow-600 bg-yellow-900/10 rounded-lg p-4 mb-4">
            <div className="text-sm font-bold text-yellow-300 mb-2">🎯 你的挑戰</div>
            <p className="text-sm text-gray-200 leading-relaxed">{activeLesson.challenge}</p>
            <div className="text-[11px] text-gray-400 mt-2 italic">💡 提示：{activeLesson.hint}</div>
            <div className="text-[11px] text-yellow-400 mt-2">
              通過獎勵：◆ {activeLesson.reward} 金幣 {alreadyDone && '（已領取，重做不會再給）'}
            </div>
          </div>

          {/* Input */}
          <div className="mb-4">
            <label className="text-sm text-gray-300 font-bold mb-2 block">
              ✍ 寫下你的 prompt：
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="在這裡輸入你想對 AI 說的話..."
              rows={5}
              className="w-full p-3 bg-black border-2 border-gray-600 rounded text-white text-sm focus:border-cyan-500 outline-none"
            />
            <div className="text-[10px] text-gray-500 mt-1">{userPrompt.length} 字</div>
          </div>

          <button
            onClick={submit}
            disabled={busy || !userPrompt.trim()}
            className={`w-full py-3 text-sm font-bold border-2 rounded transition-colors ${
              busy || !userPrompt.trim()
                ? 'border-gray-700 text-gray-500 cursor-not-allowed'
                : 'border-cyan-500 text-cyan-300 hover:bg-cyan-500 hover:text-black'
            }`}
          >
            {busy ? '🤖 AI 思考中...' : '🚀 送出給 AI 評分'}
          </button>

          {error && (
            <div className="mt-4 p-3 border border-red-600 bg-red-900/20 rounded text-sm text-red-300">
              ✗ {error}
            </div>
          )}

          {/* AI response */}
          {aiResponse && (
            <div className="mt-5 border border-gray-600 bg-gray-900/50 rounded p-4">
              <div className="text-sm font-bold text-blue-300 mb-2">🤖 AI 助理回應你的 prompt：</div>
              <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{aiResponse}</div>
            </div>
          )}

          {/* Evaluation result */}
          {evalResult && (
            <div className={`mt-4 p-4 border-2 rounded ${
              evalResult.passed
                ? 'border-green-500 bg-green-900/20'
                : 'border-orange-600 bg-orange-900/20'
            }`}>
              <div className={`text-base font-bold mb-2 ${evalResult.passed ? 'text-green-400' : 'text-orange-400'}`}>
                {evalResult.passed ? '🎉 通過了！' : '💪 還沒通過，再試一次！'}
              </div>
              <p className="text-sm text-gray-200 leading-relaxed">{evalResult.feedback}</p>
              {evalResult.passed && !alreadyDone && (
                <div className="mt-2 text-sm text-yellow-400 font-bold">
                  ◆ +{activeLesson.reward} 金幣已入帳！
                </div>
              )}
              {evalResult.passed && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {returnQuest ? (
                    <button
                      onClick={() => router.push('/battle')}
                      className="px-4 py-2 text-sm font-bold border-2 border-yellow-400 text-yellow-200 bg-yellow-900/30 rounded hover:bg-yellow-400 hover:text-black"
                    >
                      ⚔ 回到對戰，挑戰任務 →
                    </button>
                  ) : null}
                  <button
                    onClick={() => {
                      const next = PROMPT_LESSONS.find((l) => l.order === activeLesson.order + 1);
                      if (next) openLesson(next);
                      else closeLesson();
                    }}
                    className="px-4 py-2 text-sm font-bold border-2 border-cyan-500 text-cyan-300 rounded hover:bg-cyan-500 hover:text-black"
                  >
                    {activeLesson.order < TOTAL_LESSONS ? `→ 繼續第 ${activeLesson.order + 1} 課` : '🏆 完成全部課程！'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // === Lesson list view ==============================================
  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push('/battle')}
            className="text-sm text-cyan-300 hover:underline"
          >
            ← 返回對戰
          </button>
          <CoinDisplay />
        </div>

        <div className="border-2 border-cyan-600 bg-cyan-900/10 rounded-lg p-5 mb-5">
          <h1 className="text-2xl font-bold text-cyan-300 mb-2">📚 Prompt Engineering 課程</h1>
          <p className="text-sm text-gray-300 leading-relaxed">
            學會 11 個與 AI 對話的技巧！每堂課寫一個 prompt 給 AI 助理，
            AI 會回應你並自動評分。通過就能拿金幣 + 解鎖下一堂。
            完成全部 11 堂後，可以開始挑戰決鬥任務！
          </p>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-cyan-300 font-bold">進度：{completedIds.length} / {TOTAL_LESSONS}</span>
            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-2 bg-gradient-to-r from-cyan-500 to-green-400"
                style={{ width: `${(completedIds.length / TOTAL_LESSONS) * 100}%` }}
              />
            </div>
            {allDone && <span className="text-yellow-400 font-bold animate-pulse">🏆 全部完成！</span>}
          </div>
        </div>

        <div className="space-y-2">
          {PROMPT_LESSONS.map((lesson, idx) => {
            const isCompleted = completedIds.includes(lesson.id);
            // Sequential unlock: prev must be done (or this is lesson 1)
            const prevDone = idx === 0 || completedIds.includes(PROMPT_LESSONS[idx - 1].id);
            const isUnlocked = prevDone;
            const isCurrent = isUnlocked && !isCompleted;

            const status = isCompleted
              ? { label: '✓ 已完成', color: 'border-green-700 bg-green-900/20 text-green-400' }
              : isCurrent
              ? { label: '➤ 可挑戰', color: 'border-yellow-600 bg-yellow-900/20 text-yellow-400 animate-pulse' }
              : { label: '🔒 未解鎖', color: 'border-gray-700 bg-gray-900/30 text-gray-500' };

            return (
              <button
                key={lesson.id}
                onClick={() => isUnlocked && openLesson(lesson)}
                disabled={!isUnlocked}
                className={`w-full p-3 border-2 rounded-lg text-left transition-all ${status.color} ${
                  isUnlocked ? 'hover:scale-[1.01] cursor-pointer' : 'cursor-not-allowed opacity-70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold flex-shrink-0">
                    {isCompleted ? '✓' : lesson.order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-sm truncate">{lesson.title}</div>
                      <span className="text-[10px] flex-shrink-0">{status.label}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      技巧：{lesson.technique} · 獎勵：◆ {lesson.reward} 金幣
                    </div>
                    {!isUnlocked && (
                      <div className="text-[10px] text-gray-500 mt-1">完成「第 {lesson.order - 1} 課」後解鎖</div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
