import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Pencil,
  Plus,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { streamChat } from "@/lib/stream";
import { useAppConfig, useAuth } from "@/hooks/useAuth";
import { sttSupported, useVoice } from "@/hooks/useVoice";
import Sidebar from "@/components/Sidebar";
import ChatInput from "@/components/ChatInput";
import CommandPalette, { type PaletteAction } from "@/components/CommandPalette";
import MessageRenderer from "@/components/render/MessageRenderer";
import type {
  AppConfig,
  AppState,
  Attachment,
  Conversation,
  ConversationDetail,
  GeneratedImage,
  Message,
  ModelInfo,
  Project,
} from "@/types";

const SUGGESTIONS = [
  "Explain quantum entanglement with the maths",
  "Write a binary search in TypeScript",
  "/image a lighthouse at dusk, watercolour",
];

const STATE_LABEL: Record<AppState, string> = {
  idle: "Ready",
  composing: "Composing",
  sending: "Sending",
  streaming: "Thinking",
  stopped: "Interrupted",
  complete: "Ready",
  listening: "Listening",
  transcribing: "Transcribing",
  speaking: "Speaking",
  interrupted: "Interrupted",
  error: "Error",
};

const MODEL_KEY = "vexion.model";

function detailOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: string } | null;
    if (body?.detail) return body.detail;
    return `${fallback} (${err.status})`;
  }
  return fallback;
}

export default function Chat() {
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const { data: config } = useAppConfig();
  const [params, setParams] = useSearchParams();
  const appName = config?.app_name ?? "VEXION";
  const authenticated = Boolean(user);

  const models: ModelInfo[] = useMemo(() => config?.models ?? [], [config]);
  const freeModel = config?.free_model_id ?? "lumen";
  const projectId = params.get("project");

  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem(MODEL_KEY) ?? "lumen",
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<AppState>("idle");
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);

  // Guests may only use the free tier — enforced in the UI and on the server.
  useEffect(() => {
    if (!loading && !authenticated) setSelectedModel(freeModel);
  }, [loading, authenticated, freeModel]);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, selectedModel);
  }, [selectedModel]);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiGet<Conversation[]>("/conversations"),
    enabled: authenticated,
  });

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<Project[]>("/projects"),
    enabled: authenticated,
  });

  const activeProject = useMemo(
    () => (projects.data ?? []).find((p) => p.id === projectId) ?? null,
    [projects.data, projectId],
  );

  const detail = useQuery({
    queryKey: ["conversation", activeId],
    queryFn: () => apiGet<ConversationDetail>(`/conversations/${activeId}`),
    enabled: Boolean(activeId) && authenticated,
  });

  useEffect(() => {
    if (detail.data && !streamingRef.current) setMessages(detail.data.messages);
  }, [detail.data]);

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

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setAttachments([]);
    setInput("");
    setState("idle");
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (pinnedToBottom) scrollToBottom(state === "streaming" ? "auto" : "smooth");
  }, [messages, pinnedToBottom, scrollToBottom, state]);

  const uploadFiles = useCallback(async (files: File[]) => {
    setUploading(true);
    for (const file of files.slice(0, 6)) {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/attachments", { method: "POST", body: form });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { detail?: string } | null;
          toast.error(body?.detail ?? `Could not attach ${file.name}`);
          continue;
        }
        const attachment = (await res.json()) as Attachment;
        setAttachments((prev) => [...prev, attachment]);
        toast.success(
          attachment.kind === "image"
            ? `${attachment.filename} attached`
            : `${attachment.filename} read (${attachment.extracted_text.length} chars of text)`,
        );
      } catch {
        toast.error(`Upload of ${file.name} failed`);
      }
    }
    setUploading(false);
  }, []);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (activeId) return activeId;
    try {
      const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
      const convo = await apiPost<Conversation>(`/conversations${query}`);
      setActiveId(convo.id);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      return convo.id;
    } catch (err) {
      setState("error");
      toast.error(detailOf(err, "Could not start a chat"));
      return null;
    }
  }, [activeId, projectId, qc]);

  const generateImage = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) {
        toast.error("Describe the image after /image");
        return;
      }
      setInput("");
      setState("sending");
      const cid = authenticated ? await ensureConversation() : null;
      if (authenticated && !cid) return;

      const stamp = `img-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `${stamp}-u`,
          conversation_id: cid ?? "guest",
          role: "user",
          content: `/image ${prompt}`,
          status: "complete",
          created_at: new Date().toISOString(),
        },
      ]);
      try {
        const res = await apiPost<GeneratedImage>("/images/generate", {
          prompt,
          conversation_id: cid,
        });
        setMessages((prev) => [
          ...prev,
          {
            id: res.message_id ?? stamp,
            conversation_id: cid ?? "guest",
            role: "assistant",
            content: `${res.caption}\n\n![${prompt}](${res.data_url})`.trim(),
            status: "complete",
            model_id: "image",
            created_at: new Date().toISOString(),
          },
        ]);
        setState("complete");
        if (authenticated) qc.invalidateQueries({ queryKey: ["conversations"] });
      } catch (err) {
        setState("error");
        toast.error(detailOf(err, "Image generation failed"));
      }
    },
    [authenticated, ensureConversation, qc],
  );

  const send = useCallback(
    async (content: string, fromMessageId: string | null = null) => {
      const text = content.trim();
      if ((!text && attachments.length === 0) || streamingRef.current) return;

      if (text === "/clear") {
        newChat();
        return;
      }

      if (text.toLowerCase().startsWith("/image")) {
        await generateImage(text.slice(6).trim());
        return;
      }

      setState("sending");
      setInput("");
      setPinnedToBottom(true);

      let cid = activeId;
      if (authenticated) {
        cid = await ensureConversation();
        if (!cid) return;
      }

      if (fromMessageId) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === fromMessageId);
          return idx === -1 ? prev : prev.slice(0, idx);
        });
      }

      const anchorIdx = fromMessageId ? messages.findIndex((m) => m.id === fromMessageId) : -1;
      const historySnapshot = (anchorIdx >= 0 ? messages.slice(0, anchorIdx) : messages).map(
        (m) => ({ role: m.role, content: m.content }),
      );

      const sentAttachments = attachments;
      const optimistic: Message = {
        id: `tmp-${Date.now()}`,
        conversation_id: cid ?? "guest",
        role: "user",
        content: text || "(attachment)",
        status: "complete",
        attachments: sentAttachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          filename: a.filename,
        })),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setAttachments([]);

      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      voice.resetSpeechCursor();
      const autoSpeak = Boolean(persona?.auto_speak && persona.voice_enabled);
      let assistantId = "";
      let buffer = "";

      const path = authenticated ? `/chat/${cid}/stream` : "/chat/guest/stream";
      const body = authenticated
        ? {
            content: text || "Please look at the attached file.",
            from_message_id: fromMessageId,
            model_id: selectedModel,
            attachment_ids: sentAttachments.map((a) => a.id),
          }
        : { content: text, history: historySnapshot };

      try {
        await streamChat(path, body, controller.signal, {
          onStart: ({ userMessage, messageId }) => {
            assistantId = messageId;
            setState("streaming");
            setMessages((prev) => [
              ...prev.map((m) => (m.id === optimistic.id ? userMessage : m)),
              {
                id: messageId,
                conversation_id: cid ?? "guest",
                role: "assistant",
                content: "",
                status: "streaming",
                model_id: selectedModel,
                created_at: new Date().toISOString(),
              },
            ]);
          },
          onDelta: (delta) => {
            buffer += delta;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: buffer } : m)),
            );
            // Sentence-level streaming speech, so VEXION talks while it thinks.
            if (autoSpeak) voice.speakStreaming(buffer, persona?.voice_name);
          },
          onError: (detailText) => {
            setState("error");
            toast.error(detailText.slice(0, 200));
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
            if (autoSpeak && buffer) {
              voice.speakStreaming(`${buffer}\n`, persona?.voice_name);
              setState("speaking");
            }
          },
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setState("stopped");
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: "stopped" } : m)),
          );
          voice.stopSpeaking();
          toast.warning("Stopped — the partial reply was kept");
        } else {
          setState("error");
          toast.error("Connection failed");
        }
      } finally {
        streamingRef.current = false;
        abortRef.current = null;
        if (authenticated) {
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["conversation", cid] });
        }
      }
    },
    [
      activeId,
      attachments,
      authenticated,
      ensureConversation,
      generateImage,
      messages,
      newChat,
      persona,
      qc,
      selectedModel,
      voice,
    ],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

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

  const exportMarkdown = useCallback(() => {
    if (messages.length === 0) {
      toast.error("Nothing to export yet");
      return;
    }
    const body = messages
      .map((m) => `## ${m.role === "user" ? "You" : appName}\n\n${m.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([`# ${appName} chat\n\n${body}\n`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${appName.toLowerCase()}-chat.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported as Markdown");
  }, [messages, appName]);

  const onMicToggle = useCallback(() => {
    if (voice.listening) {
      voice.stopListening();
      setState("idle");
    } else {
      setState("listening");
      voice.startListening();
    }
  }, [voice]);

  const paletteActions: PaletteAction[] = useMemo(
    () => [
      { id: "new-chat", label: "New chat", hint: "/clear", run: newChat },
      { id: "export", label: "Export chat as Markdown", run: exportMarkdown },
      {
        id: "generate-image",
        label: "Generate an image",
        hint: "/image",
        run: () => setInput("/image "),
      },
      { id: "voice", label: "Start voice input", run: onMicToggle },
      ...models.map((m) => ({
        id: `model-${m.id}`,
        label: `Switch to ${m.name} (tier ${m.tier})`,
        run: () => {
          if (m.requires_auth && !authenticated) {
            toast.info(`${m.name} needs an account — sign in to unlock it`);
            return;
          }
          setSelectedModel(m.id);
          toast.success(`${m.name} selected`);
        },
      })),
    ],
    [authenticated, exportMarkdown, models, newChat, onMicToggle],
  );

  const streaming = state === "sending" || state === "streaming";
  const empty = messages.length === 0;

  const composer = (
    <ChatInput
      value={input}
      onChange={setInput}
      onSubmit={() => void send(input)}
      onStop={stop}
      streaming={streaming}
      listening={voice.listening}
      micAvailable={sttSupported() && Boolean(config?.features.voice_input)}
      onMicToggle={onMicToggle}
      models={models}
      selectedModel={selectedModel}
      onSelectModel={setSelectedModel}
      authenticated={authenticated}
      onLockedPick={(m) =>
        toast.info(`${m.name} is tier ${m.tier} — sign in to unlock it`, {
          description: "A free account also keeps your chat history.",
        })
      }
      attachments={attachments}
      onFiles={(files) => void uploadFiles(files)}
      onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
      uploading={uploading}
      autoFocus={empty}
    />
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <CommandPalette actions={paletteActions} />

      {authenticated && user && (
        <div className="hidden md:block">
          <Sidebar
            conversations={conversations.data ?? []}
            projects={projects.data ?? []}
            activeId={activeId}
            activeProjectId={projectId}
            onSelect={(id) => {
              setActiveId(id);
              setMessages([]);
              setAttachments([]);
              setState("idle");
            }}
            onNewChat={newChat}
            user={user}
            appName={appName}
            config={config as AppConfig | undefined}
          />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            {!authenticated && (
              <span className="font-heading text-[16px] font-semibold">{appName}</span>
            )}
            <span
              className="text-[12px] text-muted-foreground"
              data-testid="state-label"
              aria-live="polite"
            >
              {STATE_LABEL[state]}
            </span>
            {activeProject && (
              <span
                className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-[11.5px]"
                data-testid="active-project-badge"
              >
                <FolderOpen className="h-3 w-3 text-clay" /> {activeProject.name}
                <button
                  onClick={() => {
                    setParams({});
                    newChat();
                  }}
                  aria-label="Leave project"
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </span>
            )}
            {config?.mocked && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">
                mock brain
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={newChat}
              data-testid="new-chat-button"
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> New chat
            </button>
            {voice.speaking && (
              <button
                onClick={() => {
                  voice.stopSpeaking();
                  setState("interrupted");
                }}
                data-testid="stop-speaking-button"
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <VolumeX className="h-3.5 w-3.5" /> Stop voice
              </button>
            )}
            {!empty && (
              <button
                onClick={exportMarkdown}
                data-testid="export-button"
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            )}
            {!authenticated && (
              <Link
                to="/login"
                data-testid="header-signin-link"
                className="rounded-lg bg-clay px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors duration-200 hover:bg-[#a34c29]"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        {!authenticated && (
          <p
            className="border-b border-border bg-secondary/60 px-5 py-2 text-center text-[12px] text-muted-foreground"
            data-testid="guest-banner"
          >
            You're chatting as a guest on{" "}
            <strong className="font-medium">
              {models.find((m) => m.id === freeModel)?.name ?? "the free model"}
            </strong>
            . Nothing is saved —{" "}
            <Link to="/login" className="text-clay underline">
              sign in
            </Link>{" "}
            to keep your history, use projects and unlock tiers 2–5.
          </p>
        )}

        {empty ? (
          <div
            className="flex flex-1 flex-col items-center justify-center px-6"
            data-testid="empty-state"
          >
            <h1 className="font-heading text-[30px] font-normal tracking-tight md:text-[34px]">
              {activeProject ? activeProject.name : "How can I help you today?"}
            </h1>
            {activeProject?.description && (
              <p className="mt-2 max-w-xl text-center text-[13px] text-muted-foreground">
                {activeProject.description}
              </p>
            )}
            <div className="mt-8 w-full max-w-2xl">{composer}</div>
            <div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  data-testid="suggestion-chip"
                  onClick={() => void send(s)}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors duration-200 hover:border-[#d5cfc4] hover:text-foreground"
                >
                  {s.startsWith("/image") && <ImageIcon className="h-3.5 w-3.5" />}
                  {s.replace("/image ", "Image: ")}
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
              className="vx-scroll flex-1 overflow-y-auto px-4 py-7"
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-7">
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
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                        <div>
                          {(m.attachments ?? []).length > 0 && (
                            <div
                              className="mb-1.5 flex flex-wrap justify-end gap-1.5"
                              data-testid="message-attachments"
                            >
                              {(m.attachments ?? []).map((a) => (
                                <span
                                  key={a.id}
                                  className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11.5px]"
                                >
                                  {a.kind === "image" ? (
                                    <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                  ) : (
                                    <FileText className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  {a.filename}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-[15px]">
                            {m.content}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-full">
                        <div className="mb-1.5 text-[11.5px] font-medium text-muted-foreground">
                          {appName}
                          {m.model_id && m.model_id !== "image" && (
                            <span className="ml-1.5 text-muted-foreground/80">
                              · {models.find((x) => x.id === m.model_id)?.name ?? m.model_id}
                            </span>
                          )}
                        </div>
                        {m.content ? (
                          <MessageRenderer content={m.content} />
                        ) : (
                          <div className="flex gap-1 py-1.5" data-testid="thinking-indicator">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className="vx-dot h-1.5 w-1.5 rounded-full bg-muted-foreground"
                                style={{ animationDelay: `${i * 0.18}s` }}
                              />
                            ))}
                          </div>
                        )}
                        {m.status === "stopped" && (
                          <p className="mt-2 text-[11.5px] text-muted-foreground">
                            Stopped by you — partial reply kept
                          </p>
                        )}
                        {m.status !== "streaming" && m.content && (
                          <div className="mt-3 flex gap-4">
                            <button
                              onClick={regenerate}
                              data-testid="regenerate-button"
                              className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
                            >
                              <RefreshCw className="h-3 w-3" /> Regenerate
                            </button>
                            {config?.features.voice_output && (
                              <button
                                onClick={() => {
                                  setState("speaking");
                                  voice.speak(m.content, persona?.voice_name);
                                }}
                                data-testid="speak-message-button"
                                className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
                              >
                                <Volume2 className="h-3 w-3" /> Speak
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
                  className="absolute -top-9 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11.5px] shadow-sm"
                >
                  <ArrowDown className="h-3 w-3" /> Jump to latest
                </button>
              )}
              <div className="w-full max-w-3xl">{composer}</div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
