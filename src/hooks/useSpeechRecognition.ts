import { useState, useCallback, useRef, useEffect } from "react";

interface SpeechRecognitionHook {
  isListening: boolean;
  transcript: string;
  isSupported: boolean;
  error: string | null;
  isProcessing: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

/**
 * 語音識別 Hook - 使用 OpenAI Whisper API
 * 比 Web Speech API 更可靠，不依賴 Google 服務
 */
const useSpeechRecognition = (): SpeechRecognitionHook => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // 檢查瀏覽器支援
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasMediaDevices = !!(
        navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      );
      const hasMediaRecorder = typeof MediaRecorder !== "undefined";
      setIsSupported(hasMediaDevices && hasMediaRecorder);
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isListening || isProcessing) return;

    setError(null);
    chunksRef.current = [];

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      // Determine the best supported audio format
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/ogg";
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        if (chunksRef.current.length === 0) {
          setError("未錄製到任何音訊");
          return;
        }

        // Create blob and send to API
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        // Check if audio is too short (less than 0.5 seconds roughly)
        if (audioBlob.size < 500) {
          setError("錄音太短，請說長一點");
          return;
        }

        setIsProcessing(true);

        try {
          // Convert blob to base64
          const arrayBuffer = await audioBlob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Audio = btoa(binary);

          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              audio: base64Audio,
              mimeType: mimeType,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "語音轉文字失敗");
          }

          if (data.text && data.text.trim()) {
            setTranscript(data.text.trim());
          } else {
            setError("未能識別語音，請再試一次");
          }
        } catch (err: any) {
          console.error("Transcription error:", err);
          setError(err.message || "語音轉文字失敗");
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error("MediaRecorder error:", event.error);
        setError("錄音錯誤，請再試一次");
        setIsListening(false);

        // Stop all tracks on error
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      // Start recording - collect data every 500ms
      mediaRecorder.start(500);
      setIsListening(true);
    } catch (err: any) {
      console.error("Failed to start recording:", err);

      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("麥克風權限被拒絕，請在瀏覽器設定中允許");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("找不到麥克風，請確認已連接");
        setIsSupported(false);
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setError("麥克風被其他應用程式使用中");
      } else {
        setError("無法啟動錄音：" + (err.message || "未知錯誤"));
      }
    }
  }, [isListening, isProcessing]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Error stopping MediaRecorder:", err);
      }
      setIsListening(false);
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (err) {
          // Ignore errors on cleanup
        }
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    isSupported,
    error,
    isProcessing,
    startListening,
    stopListening,
    resetTranscript,
  };
};

export default useSpeechRecognition;
