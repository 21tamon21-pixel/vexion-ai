// SSE client for the chat brain. This is the ONE place raw fetch is used —
// apiPost cannot expose a ReadableStream. Everything else goes through lib/api.ts.
import type { Message } from "@/types";

export interface StreamHandlers {
  onStart: (info: { userMessage: Message; messageId: string; model: string }) => void;
  onDelta: (text: string) => void;
  onDone: (status: string) => void;
  onError: (detail: string) => void;
}

export async function streamChat(
  conversationId: string,
  content: string,
  fromMessageId: string | null,
  signal: AbortSignal,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(`/api/chat/${conversationId}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, from_message_id: fromMessageId }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    handlers.onError(`stream failed (${res.status}) ${body.slice(0, 200)}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice(7).trim();
      const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;

      if (event === "start") {
        handlers.onStart({
          userMessage: data.user_message as Message,
          messageId: data.message_id as string,
          model: data.model as string,
        });
      } else if (event === "delta") {
        handlers.onDelta(data.text as string);
      } else if (event === "error") {
        handlers.onError(data.detail as string);
      } else if (event === "done") {
        handlers.onDone(data.status as string);
      }
    }
  }
}
