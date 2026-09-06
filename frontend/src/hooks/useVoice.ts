/**
 * Voice abstraction. Today both sides are BROWSER-NATIVE providers:
 *   STT -> Web Speech API (SpeechRecognition)
 *   TTS -> speechSynthesis
 * Swap either by replacing the implementation behind this hook's interface;
 * nothing outside this file knows which engine is in use.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => RecognitionLike)
    | null;
}

export const sttSupported = () => typeof window !== "undefined" && recognitionCtor() !== null;
export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function useVoice(onTranscript: (text: string) => void, onError: (msg: string) => void) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const recRef = useRef<RecognitionLike | null>(null);

  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      onError("Speech recognition is not available in this browser.");
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (e) => {
        const text = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript)
          .join(" ")
          .trim();
        if (text) onTranscript(text);
      };
      rec.onerror = (e) => {
        setListening(false);
        onError(
          e.error === "not-allowed"
            ? "Microphone permission denied."
            : `Microphone error: ${e.error}`,
        );
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      onError("Could not start the microphone.");
      setListening(false);
    }
  }, [onError, onTranscript]);

  const stopSpeaking = useCallback(() => {
    if (!ttsSupported()) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, voiceName?: string) => {
      if (!ttsSupported()) {
        onError("Speech synthesis is not available in this browser.");
        return;
      }
      window.speechSynthesis.cancel();
      // Strip markdown/code fences so VEXION does not read syntax aloud.
      const clean = text
        .replace(/```[\s\S]*?```/g, " code block. ")
        .replace(/\$\$[\s\S]*?\$\$/g, " equation. ")
        .replace(/[#*_`>|]/g, "")
        .slice(0, 4000);
      const utter = new SpeechSynthesisUtterance(clean);
      const match = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
      if (match) utter.voice = match;
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => {
        setSpeaking(false);
        onError("Voice playback failed.");
      };
      setSpeaking(true);
      window.speechSynthesis.speak(utter);
    },
    [onError],
  );

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  return { listening, speaking, voices, startListening, stopListening, speak, stopSpeaking };
}
