// Hand-written mirrors of the Pydantic models in backend/models/schemas.py.
// Changing one side means changing the other in the same edit.

export interface Persona {
  system_prompt: string;
  tone: string;
  verbosity: string;
  voice_enabled: boolean;
  auto_speak: boolean;
  voice_name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  persona: Persona;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type MessageStatus = "complete" | "streaming" | "stopped" | "error";

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  created_at: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
}

export interface SearchHit {
  conversation_id: string;
  title: string;
  snippet: string;
}

// mirrors lib/config.public_config()
export interface AppConfig {
  app_name: string;
  app_tagline: string;
  provider: string;
  model: string;
  provider_ready: boolean;
  mocked: boolean;
  features: {
    voice_input: boolean;
    voice_output: boolean;
    vision: boolean;
    web_search: boolean;
    image_generation: boolean;
    guest_mode: boolean;
  };
}

/** Authoritative application state machine (see PROJECT_CONTEXT.md §state). */
export type AppState =
  | "idle"
  | "composing"
  | "sending"
  | "streaming"
  | "stopped"
  | "complete"
  | "listening"
  | "transcribing"
  | "speaking"
  | "interrupted"
  | "error";
