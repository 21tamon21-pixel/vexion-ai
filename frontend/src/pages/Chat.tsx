import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowDown, Pencil, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { streamChat } from "@/lib/stream";
import { useAppConfig, useAuth } from "@/hooks/useAuth";
import { sttSupported, useVoice } from "@/hooks/useVoice";
import HudBackground from "@/components/HudBackground";
import BootSequence, { shouldBoot } from "@/components/BootSequence";
import Sidebar from "@/components/Sidebar";
import ChatInput from "@/components/ChatInput";
import MessageRenderer from "@/components/render/MessageRenderer";
import type { AppState, Conversation, ConversationDetail, Message } from "@/types";

const SUGGESTIONS = [
  "Explain quantum entanglement with the maths",
  "Write a binary search in TypeScript",
  "Diagram the request lifecycle of a web app",
];

const STATE_LABEL: Record<AppState, string> = {
  idle: "READY",
  composing: "COMPOSING",
  sending: "TRANSMITTING",
  streaming: "STREAMING",
  stopped: "INTERRUPTED",
  complete: "READY",
  listening: "LISTENING",
  transcribing: "TRANSCRIBING",
  speaking: "SPEAKING",
  interrupted: "INTERRUPTED",
  error: "ERROR",
};

const STATE_TONE: Record<AppState, string> = {
  idle: "#43e6b5",
  composing: "#3ec6ff",
  sending: "#3ec6ff",
  streaming: "#3ec6ff",
  stopped: "#ffb03e",
  complete: "#43e6b5",
  listening: "#ffb03e",
  transcribing: "#ffb03e",
  speaking: "#6ee7ff",
  interrupted: "#ffb03e",
  error: "#ff5a6a",
};

export default function Chat() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const { data: config } = useAppConfig();
  const appName = config?.app_name ?? "VEXION";

  const [booting, setBooting] = useState(() => shouldBoot());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<AppState>("idle");
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiGet<Conversation[]>("/conversations"),
    enabled: Boolean(user),
  });

  const detail = useQuery({
    queryKey: ["conversation", activeId],
    queryFn: () => apiGet<ConversationDetail>(`/conversations/${activeId}`),
    enabled: Boolean(activeId),
  });

  useEffect(() => {
    if (detail.data && !streamingRef.current) setMessages(detail.data.messages);
  }, [detail.data]);

  const createConvo = useMutation({
    mutationFn: () => apiPost<Conversation>("/conversations"),
  });

  const voice = useVoice(
    (text) => {
      setInput(text);
      setState("idle");
      toast.info("Transcribed — review and send");
    },
    (msg) => {
      setState("error");
      toast.error(msg);
    },
  );

  const persona = user?.persona;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (pinnedToBottom) scrollToBottom(state === "streaming" ? "auto" : "smooth");
  }, [messages, pinnedToBottom, scrollToBottom, state]);

  const send = useCallback(
    async (content: string, fromMessageId: string | null = null) => {
      const text = content.trim();
      if (!text || streamingRef.current) return;

      if (text === "/clear") {
        setInput("");
        setActiveId(null);
        setMessages([]);
        setState("idle");
        return;
      }

      setState("sending");
      setInput("");
      setPinnedToBottom(true);

      let cid = activeId;
      try {
        if (!cid) {
          const convo = await createConvo.mutateAsync();
          cid = convo.id;
          setActiveId(convo.id);
        }
      } catch {
        setState("error");
        toast.error("Could not open a session");
        return;
      }

      if (fromMessageId) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === fromMessageId);
          return idx === -1 ? prev : prev.slice(0, idx);
        });
      }

      const optimistic: Message = {
        id: `tmp-${Date.now()}`,
        conversation_id: cid,
        role: "user",
        content: text,
        status: "complete",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      let assistantId = "";
      let buffer = "";

      try {
        await streamChat(cid, text, fromMessageId, controller.signal, {
          onStart: ({ userMessage, messageId }) => {
            assistantId = messageId;
            setState("streaming");
            setMessages((prev) => [
              ...prev.map((m) => (m.id === optimistic.id ? userMessage : m)),
              {
                id: messageId,
                conversation_id: cid as string,
                role: "assistant",
                content: "",
                status: "streaming",
                created_at: new Date().toISOString(),
              },
            ]);
          },
          onDelta: (delta) => {
            buffer += delta;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: buffer } : m)),
            );
          },
          onError: (detailText) => {
            setState("error");
            toast.error(`Brain error: ${detailText.slice(0, 140)}`);
          },
          onDone: (status) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, status: status === "complete" ? "complete" : "error" }
                  : m,
              ),
            );
            setState(status === "complete" ? "complete" : "error");
            if (persona?.auto_speak && persona.voice_enabled && buffer) {
              setState("speaking");
              voice.speak(buffer, persona.voice_name);
            }
          },
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setState("stopped");
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: "stopped" } : m)),
          );
          toast.warning("Generation interrupted — partial response preserved");
        } else {
          setState("error");
          toast.error("Connection to the brain failed");
        }
      } finally {
        streamingRef.current = false;
        abortRef.current = null;
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["conversation", cid] });
      }
    },
    [activeId, createConvo, persona, qc, voice],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) void send(lastUser.content, lastUser.id);
  }, [messages, send]);

  const editAndResend = useCallback(
    (message: Message) => {
      const next = window.prompt("Edit and resend", message.content);
      if (next && next.trim()) void send(next, message.id);
    },
    [send],
  );

  const streaming = state === "sending" || state === "streaming";
  const empty = messages.length === 0;

  const activeConversations = useMemo(() => conversations.data ?? [], [conversations.data]);

  if (booting) return <BootSequence appName={appName} onDone={() => setBooting(false)} />;
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <HudBackground />
        <p className="font-mono text-xs tracking-[0.3em] text-[#5c728c]">AUTHENTICATING…</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <HudBackground />
      <div className="relative z-10 hidden md:block">
        <Sidebar
          conversations={activeConversations}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            setMessages([]);
            setState("idle");
          }}
          user={user}
          appName={appName}
        />
      </div>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[#1d2c44]/60 px-5 py-3">
          <div className="flex items-center gap-3">
            <span
              className={`h-2 w-2 rounded-full ${streaming || state === "listening" ? "vx-blink" : ""}`}
              style={{ background: STATE_TONE[state] }}
              data-testid="state-indicator"
            />
            <span
              className="font-mono text-[11px] tracking-[0.25em]"
              style={{ color: STATE_TONE[state] }}
              data-testid="state-label"
              aria-live="polite"
            >
              {STATE_LABEL[state]}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#5c728c]">
            <span data-testid="provider-badge">
              {config?.mocked ? "MOCK BRAIN" : `${config?.provider} · ${config?.model}`}
            </span>
            {voice.speaking && (
              <button
                onClick={() => {
                  voice.stopSpeaking();
                  setState("interrupted");
                }}
                data-testid="stop-speaking-button"
                className="flex items-center gap-1 text-[#6ee7ff]"
              >
                <VolumeX className="h-3.5 w-3.5" /> stop voice
              </button>
            )}
          </div>
        </header>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6" data-testid="empty-state">
            <h1 className="vx-glow-text vx-rise font-heading text-4xl tracking-[0.42em] text-[#3ec6ff] md:text-6xl">
              {appName}
            </h1>
            <p className="vx-rise mt-4 text-sm text-[#7f96b3]">How can I help, sir?</p>
            <div className="vx-rise mt-8 w-full max-w-2xl">
              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={() => void send(input)}
                onStop={stop}
                streaming={streaming}
                listening={voice.listening}
                micAvailable={sttSupported() && Boolean(config?.features.voice_input)}
                onMicToggle={() => {
                  if (voice.listening) {
                    voice.stopListening();
                    setState("idle");
                  } else {
                    setState("listening");
                    voice.startListening();
                  }
                }}
                centered
              />
            </div>
            <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  data-testid="suggestion-chip"
                  onClick={() => void send(s)}
                  className="rounded-full border border-[#1d2c44] px-3.5 py-1.5 text-xs text-[#8fa6c0] transition-colors duration-200 hover:border-[#3ec6ff] hover:text-[#9fe4ff]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              data-testid="message-scroll"
              onScroll={(e) => {
                const el = e.currentTarget;
                setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 90);
              }}
              className="vx-scroll flex-1 overflow-y-auto px-4 py-6"
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-6">
                {messages.map((m) => (
                  <article
                    key={m.id}
                    data-testid={m.role === "user" ? "user-message" : "assistant-message"}
                    className={m.role === "user" ? "flex justify-end" : ""}
                  >
                    {m.role === "user" ? (
                      <div className="group flex max-w-[85%] items-start gap-2">
                        <button
                          onClick={() => editAndResend(m)}
                          data-testid="edit-message-button"
                          aria-label="Edit and resend"
                          className="mt-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                        >
                          <Pencil className="h-3.5 w-3.5 text-[#5c728c] hover:text-[#3ec6ff]" />
                        </button>
                        <div className="vx-glass rounded-xl rounded-br-sm px-4 py-2.5 text-[15px] whitespace-pre-wrap">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-full">
                        <div className="mb-1.5 font-mono text-[10px] tracking-[0.28em] text-[#3ec6ff]">
                          {appName}
                        </div>
                        {m.content ? (
                          <MessageRenderer content={m.content} />
                        ) : (
                          <div className="vx-shimmer h-5 w-40 rounded" data-testid="thinking-shimmer" />
                        )}
                        {m.status === "stopped" && (
                          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#ffb03e]">
                            ▪ interrupted by operator
                          </p>
                        )}
                        {m.status !== "streaming" && m.content && (
                          <div className="mt-3 flex gap-3">
                            <button
                              onClick={regenerate}
                              data-testid="regenerate-button"
                              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#5c728c] transition-colors duration-200 hover:text-[#3ec6ff]"
                            >
                              <RefreshCw className="h-3 w-3" /> regenerate
                            </button>
                            {config?.features.voice_output && (
                              <button
                                onClick={() => {
                                  setState("speaking");
                                  voice.speak(m.content, persona?.voice_name);
                                }}
                                data-testid="speak-message-button"
                                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#5c728c] transition-colors duration-200 hover:text-[#3ec6ff]"
                              >
                                <Volume2 className="h-3 w-3" /> speak
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>

            <div className="relative flex justify-center px-4 pb-5">
              {!pinnedToBottom && (
                <button
                  onClick={() => {
                    setPinnedToBottom(true);
                    scrollToBottom();
                  }}
                  data-testid="jump-to-latest-button"
                  className="vx-glass absolute -top-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] text-[#9fe4ff]"
                >
                  <ArrowDown className="h-3 w-3" /> jump to latest
                </button>
              )}
              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={() => void send(input)}
                onStop={stop}
                streaming={streaming}
                listening={voice.listening}
                micAvailable={sttSupported() && Boolean(config?.features.voice_input)}
                onMicToggle={() => {
                  if (voice.listening) {
                    voice.stopListening();
                    setState("idle");
                  } else {
                    setState("listening");
                    voice.startListening();
                  }
                }}
                centered={false}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
