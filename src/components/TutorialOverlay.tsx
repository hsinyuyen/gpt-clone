import React, { useState, useEffect, useCallback, useRef } from "react";

export interface TutorialStep {
  /** CSS selector for the target element */
  target: string;
  /** Tooltip text */
  text: string;
  /** Tooltip position relative to target */
  position?: "top" | "bottom" | "left" | "right";
  /** Optional: click the target to advance (instead of "下一步") */
  clickToAdvance?: boolean;
  /** Optional: action before showing this step */
  beforeShow?: () => void;
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  onComplete: () => void;
  active: boolean;
  /** Allow skipping the tutorial. Defaults to false — user must complete every step. */
  skippable?: boolean;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ steps, onComplete, active, skippable = false }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef(steps);
  const onCompleteRef = useRef(onComplete);
  const beforeShowCalledRef = useRef(-1);

  // Keep refs up to date
  stepsRef.current = steps;
  onCompleteRef.current = onComplete;

  const updateRect = useCallback(() => {
    const step = stepsRef.current[currentStep];
    if (!step || !active) return;
    const el = document.querySelector(step.target) as HTMLElement;
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      });
    }
  }, [currentStep, active]);

  // Main effect: beforeShow + rect tracking (only on step/active change)
  useEffect(() => {
    if (!active) return;

    const step = stepsRef.current[currentStep];

    // Only call beforeShow once per step
    if (step?.beforeShow && beforeShowCalledRef.current !== currentStep) {
      beforeShowCalledRef.current = currentStep;
      step.beforeShow();
    }

    // Delay first rect update slightly to allow DOM to settle after beforeShow
    const initialTimer = setTimeout(updateRect, 50);
    const interval = setInterval(updateRect, 300);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [currentStep, active, updateRect]);

  // All steps require clicking the target element to advance
  useEffect(() => {
    const step = stepsRef.current[currentStep];
    if (!active || !step) return;

    const el = document.querySelector(step.target);
    if (!el) return;

    let cancelled = false;

    const handler = () => {
      // Use requestAnimationFrame + short delay to let the button's own handler run first
      setTimeout(() => {
        if (cancelled) return;
        if (currentStep < stepsRef.current.length - 1) {
          setCurrentStep((prev) => prev + 1);
        } else {
          // Last step — complete the tutorial
          onCompleteRef.current();
        }
      }, 100);
    };

    el.addEventListener("click", handler);
    return () => {
      cancelled = true;
      el.removeEventListener("click", handler);
    };
  }, [currentStep, active]);

  const advance = useCallback(() => {
    if (currentStep < stepsRef.current.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      setCurrentStep(0);
      onCompleteRef.current();
    }
  }, [currentStep]);

  const skip = useCallback(() => {
    setCurrentStep(0);
    onCompleteRef.current();
  }, []);

  if (!active || !targetRect) return null;

  const step = stepsRef.current[currentStep];

  // Tooltip positioning
  const pos = step?.position || "bottom";
  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 10002,
    maxWidth: 280,
  };

  if (pos === "bottom") {
    tooltipStyle.top = targetRect.top + targetRect.height + 12;
    tooltipStyle.left = targetRect.left + targetRect.width / 2;
    tooltipStyle.transform = "translateX(-50%)";
  } else if (pos === "top") {
    tooltipStyle.top = targetRect.top - 12;
    tooltipStyle.left = targetRect.left + targetRect.width / 2;
    tooltipStyle.transform = "translate(-50%, -100%)";
  } else if (pos === "right") {
    tooltipStyle.top = targetRect.top + targetRect.height / 2;
    tooltipStyle.left = targetRect.left + targetRect.width + 12;
    tooltipStyle.transform = "translateY(-50%)";
  } else {
    tooltipStyle.top = targetRect.top + targetRect.height / 2;
    tooltipStyle.left = targetRect.left - 12;
    tooltipStyle.transform = "translate(-100%, -50%)";
  }

  return (
    <>
      {/* Dark overlay with cutout */}
      <div
        ref={overlayRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          pointerEvents: "none",
        }}
      >
        {/* Top */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: Math.max(0, targetRect.top),
            backgroundColor: "rgba(0,0,0,0.75)",
            pointerEvents: "auto",
          }}
          onClick={skippable ? skip : undefined}
        />
        {/* Bottom */}
        <div
          style={{
            position: "fixed",
            top: targetRect.top + targetRect.height,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            pointerEvents: "auto",
          }}
          onClick={skippable ? skip : undefined}
        />
        {/* Left */}
        <div
          style={{
            position: "fixed",
            top: targetRect.top,
            left: 0,
            width: Math.max(0, targetRect.left),
            height: targetRect.height,
            backgroundColor: "rgba(0,0,0,0.75)",
            pointerEvents: "auto",
          }}
          onClick={skippable ? skip : undefined}
        />
        {/* Right */}
        <div
          style={{
            position: "fixed",
            top: targetRect.top,
            left: targetRect.left + targetRect.width,
            right: 0,
            height: targetRect.height,
            backgroundColor: "rgba(0,0,0,0.75)",
            pointerEvents: "auto",
          }}
          onClick={skippable ? skip : undefined}
        />
      </div>

      {/* Spotlight border (glow around target) */}
      <div
        style={{
          position: "fixed",
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: targetRect.height,
          border: "2px solid var(--terminal-primary)",
          boxShadow: "0 0 20px var(--terminal-primary), inset 0 0 20px rgba(0,255,136,0.1)",
          borderRadius: 4,
          zIndex: 10001,
          pointerEvents: "none",
          transition: "all 0.3s ease",
        }}
      />

      {/* Tooltip */}
      <div style={tooltipStyle}>
        <div
          style={{
            backgroundColor: "var(--terminal-bg)",
            border: "1px solid var(--terminal-primary)",
            boxShadow: "0 0 16px rgba(0,255,136,0.3)",
            padding: "12px 16px",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              color: "var(--terminal-primary)",
              fontSize: 14,
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            {step?.text}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--terminal-primary-dim)", fontSize: 11 }}>
              {currentStep + 1} / {steps.length}
            </span>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {skippable && (
                <button
                  onClick={skip}
                  style={{
                    background: "none",
                    border: "1px solid var(--terminal-primary-dim)",
                    color: "var(--terminal-primary-dim)",
                    padding: "4px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  跳過
                </button>
              )}
              <span style={{ color: "var(--terminal-primary-dim)", fontSize: 11 }}>
                {"<< 點擊高亮區域繼續 >>"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TutorialOverlay;
