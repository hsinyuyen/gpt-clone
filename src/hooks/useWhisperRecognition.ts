import { useState, useCallback, useRef } from "react";

interface WhisperRecognitionHook {
  isListening: boolean;
  transcript: string;
  isSupported: boolean;
  error: string | null;
  isProcessing: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

const useWhisperRecognition = (): WhisperRecognitionHook => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startListening = useCallback(async () => {
    if (isListening || isProcessing) return;

    setError(null);
    setTranscript("");
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

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

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
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];

        // Check if audio is too short
        if (audioBlob.size < 1000) {
          setError("錄音太短，請再試一次");
          return;
        }

        setIsProcessing(true);

        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "語音轉文字失敗");
          }

          if (data.text) {
            setTranscript(data.text);
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
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsListening(true);
    } catch (err: any) {
      console.error("Failed to start recording:", err);

      if (err.name === "NotAllowedError") {
        setError("麥克風權限被拒絕，請在瀏覽器設定中允許");
      } else if (err.name === "NotFoundError") {
        setError("找不到麥克風，請確認已連接");
        setIsSupported(false);
      } else {
        setError("無法啟動錄音：" + err.message);
      }
    }
  }, [isListening, isProcessing]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setError(null);
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

export default useWhisperRecognition;
