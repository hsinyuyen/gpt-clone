import { useState, useEffect, useRef, useCallback } from "react";
import { FaceIdentity, FaceIdentityEvent } from "@/types/User";

const IDENTITY_API = "http://127.0.0.1:5050";

export type FaceStatus = "checking" | "available" | "unavailable" | "recognized" | "waiting";

interface UseFaceIdentityOptions {
  enabled?: boolean;
  onLogin?: (identity: FaceIdentityEvent) => void;
  onLogout?: () => void;
}

export function useFaceIdentity(options: UseFaceIdentityOptions = {}) {
  const { enabled = true, onLogin, onLogout } = options;
  const [status, setStatus] = useState<FaceStatus>("checking");
  const [identity, setIdentity] = useState<FaceIdentity | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onLoginRef = useRef(onLogin);
  const onLogoutRef = useRef(onLogout);

  // Keep callback refs fresh
  onLoginRef.current = onLogin;
  onLogoutRef.current = onLogout;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("unavailable");
      return;
    }

    let cancelled = false;

    const checkAndConnect = async () => {
      // Check if the face identity service is running
      try {
        const res = await fetch(`${IDENTITY_API}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) throw new Error("not ok");
      } catch {
        if (!cancelled) setStatus("unavailable");
        return;
      }

      if (cancelled) return;
      setStatus("available");

      // Check current identity
      try {
        const res = await fetch(`${IDENTITY_API}/identity`);
        const data: FaceIdentity = await res.json();
        if (!cancelled) {
          setIdentity(data);
          if (data.logged_in) {
            setStatus("recognized");
            onLoginRef.current?.({
              event: "login",
              student_id: data.student_id,
              name: data.name,
              confidence: data.confidence,
              pc_number: data.pc_number,
            });
          } else {
            setStatus("waiting");
          }
        }
      } catch {
        if (!cancelled) setStatus("waiting");
      }

      // Connect SSE for real-time updates
      if (cancelled) return;

      const es = new EventSource(`${IDENTITY_API}/identity/stream`);
      eventSourceRef.current = es;

      es.addEventListener("login", (e) => {
        if (cancelled) return;
        const data = JSON.parse(e.data) as FaceIdentityEvent;
        setIdentity({
          logged_in: true,
          student_id: data.student_id,
          name: data.name,
          confidence: data.confidence,
          pc_number: data.pc_number,
        });
        setStatus("recognized");
        onLoginRef.current?.(data);
      });

      es.addEventListener("logout", (e) => {
        if (cancelled) return;
        setIdentity({ logged_in: false });
        setStatus("waiting");
        onLogoutRef.current?.();
      });

      es.onerror = () => {
        if (!cancelled) {
          cleanup();
          setStatus("unavailable");
        }
      };
    };

    checkAndConnect();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, cleanup]);

  return { status, identity };
}
