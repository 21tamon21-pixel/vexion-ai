/**
 * Voice abstraction. Today both sides are BROWSER-NATIVE providers:
 *   STT -> Web Speech API (SpeechRecognition)
 *   TTS -> speechSynthesis, queued sentence-by-sentence so a streaming reply can
 *          start being spoken before it finishes.
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

/** Strips markdown so VEXION does not read syntax aloud. */
function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block. ")
    .replace(/\$\$[\s\S]*?\$\$/g, " equation. ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " image. ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>|]/g, "");
}

export function useVoice(onTranscript: (text: string) => void, onError: (msg: string) => void) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const recRef = useRef<RecognitionLike | null>(null);
  // How much of a streaming reply has already been queued for speech.
  const spokenUpTo = useRef(0);

  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (!ttsSupported()) return;
    window.speechSynthesis.cancel();
    spokenUpTo.current = 0;
    setSpeaking(false);
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
    // Barge-in: talking to VEXION interrupts VEXION.
    if (ttsSupported() && window.speechSynthesis.speaking) stopSpeaking();
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
  }, [onError, onTranscript, stopSpeaking]);

  const enqueue = useCallback((chunk: string, voiceName?: string) => {
    const clean = speakable(chunk).trim();
    if (!clean) return;
    const utter = new SpeechSynthesisUtterance(clean.slice(0, 4000));
    const match = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
    if (match) utter.voice = match;
    utter.onend = () => {
      if (!window.speechSynthesis.pending && !window.speechSynthesis.speaking) setSpeaking(false);
    };
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }, []);

  /** Speak a complete block of text now, replacing anything queued. */
  const speak = useCallback(
    (text: string, voiceName?: string) => {
      if (!ttsSupported()) {
        onError("Speech synthesis is not available in this browser.");
        return;
      }
      window.speechSynthesis.cancel();
      spokenUpTo.current = 0;
      enqueue(text, voiceName);
    },
    [enqueue, onError],
  );

  /**
   * Feed the growing text of a streaming reply; every completed sentence is
   * queued once and never repeated.
   */
  const speakStreaming = useCallback(
    (fullText: string, voiceName?: string) => {
      if (!ttsSupported()) return;
      const pending = fullText.slice(spokenUpTo.current);
      const lastBreak = Math.max(
        pending.lastIndexOf(". "),
        pending.lastIndexOf("! "),
        pending.lastIndexOf("? "),
        pending.lastIndexOf("\n"),
      );
      if (lastBreak < 20) return;
      const chunk = pending.slice(0, lastBreak + 1);
      spokenUpTo.current += chunk.length;
      enqueue(chunk, voiceName);
    },
    [enqueue],
  );

  const resetSpeechCursor = useCallback(() => {
    spokenUpTo.current = 0;
  }, []);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  return {
    listening,
    speaking,
    voices,
    startListening,
    stopListening,
    speak,
    speakStreaming,
    resetSpeechCursor,
    stopSpeaking,
  };
}
