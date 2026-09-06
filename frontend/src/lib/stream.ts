// SSE client for the chat brain. This is the ONE place raw fetch is used —
// apiPost cannot expose a ReadableStream. Everything else goes through lib/api.ts.
import type { Message } from "@/types";

export interface StreamHandlers {
  onStart: (info: { userMessage: Message; messageId: string; model: string }) => void;
  onDelta: (text: string) => void;
  onDone: (status: string) => void;
  onError: (detail: string) => void;
}

/**
 * @param path  relative api path, e.g. `/chat/{id}/stream` or `/chat/guest/stream`
 * @param body  request payload (authed lane vs guest lane differ)
 */
export async function streamChat(
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 300);
    try {
      detail = (JSON.parse(text) as { detail?: string }).detail ?? detail;
    } catch {
      /* plain-text error body */
    }
    handlers.onError(detail || `stream failed (${res.status})`);
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
      const lines = frame.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event: "));
      const dataLine = lines.find((l) => l.startsWith("data: "));
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
