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

export interface Subscription {
  plan_id: string;
  status: string;
  provider: string;
  external_id: string | null;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  persona: Persona;
  subscription: Subscription;
}

export interface Conversation {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  instructions: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export type MessageStatus = "complete" | "streaming" | "stopped" | "error";

export interface AttachmentRef {
  id: string;
  kind: "image" | "document";
  filename: string;
}

export interface Attachment {
  id: string;
  user_id: string | null;
  kind: "image" | "document";
  filename: string;
  mime_type: string;
  size: number;
  data_url: string | null;
  extracted_text: string;
  pages: number | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  model_id?: string | null;
  attachments?: AttachmentRef[];
  created_at: string;
}

/** mirrors one entry of lib/models_catalog.public_catalog() */
export interface ModelInfo {
  id: string;
  name: string;
  tier: number;
  tagline: string;
  requires_auth: boolean;
  plan_required: string;
  capabilities: string[];
}

export interface PlanInfo {
  id: string;
  name: string;
  price_usd: number;
  interval: string;
  max_tier: number;
  features: string[];
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
  models: ModelInfo[];
  free_model_id: string;
  plans: PlanInfo[];
  paypal_configured: boolean;
  plugins_available: string[];
}

/** mirrors routers/images.ImageResponse */
export interface GeneratedImage {
  prompt: string;
  data_url: string;
  caption: string;
  message_id: string | null;
}

/** mirrors routers/usage.UsageSummary */
export interface ModelUsage {
  model_id: string;
  model_name: string;
  messages: number;
  approx_tokens: number;
}

export interface UsageSummary {
  total_messages: number;
  total_conversations: number;
  total_projects: number;
  images_generated: number;
  approx_tokens: number;
  by_model: ModelUsage[];
  by_day: { day: string; messages: number }[];
}

/** mirrors routers/billing.BillingState */
export interface BillingState {
  plans: PlanInfo[];
  subscription: Subscription;
  paypal_configured: boolean;
  paypal_env: string;
  paypal_client_id: string;
}

/** mirrors lib/plugins_catalog + routers/plugins */
export interface PluginInfo {
  id: string;
  name: string;
  summary: string;
  available: boolean;
  scopes: string[];
  fields: string[];
}

export interface PluginScope {
  id: string;
  label: string;
  description: string;
}

export interface PluginCatalog {
  plugins: PluginInfo[];
  scopes: PluginScope[];
}

export interface PluginConnection {
  id: string;
  user_id: string;
  plugin_id: string;
  label: string;
  repo_url: string;
  branch: string;
  site_url: string;
  scopes: string[];
  notes: string;
  revoked: boolean;
  last_seen_at: string | null;
  events: number;
  created_at: string;
}

export interface PluginConnectionWithToken {
  connection: PluginConnection;
  token: string;
  handshake_prompt: string;
}

export interface PluginEvent {
  id: string;
  kind: string;
  path: string;
  summary: string;
  created_at: string;
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
