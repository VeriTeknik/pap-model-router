/**
 * Type definitions for PAP Model Router
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
  };
  finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter' | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: ChatCompletionUsage;
}

export interface StreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason: 'stop' | 'length' | null;
  }>;
}

export interface ModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  capabilities?: string[];
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime_seconds: number;
  load_percent?: number;
  active_requests: number;
  error_rate_1m?: number;
  providers: Record<string, {
    status: 'ok' | 'error';
    latency_ms?: number;
  }>;
}

export interface SyncRequest {
  models: Array<{
    model_id: string;
    provider: string;
    display_name: string;
    context_window?: number;
    capabilities?: string[];
  }>;
}

export interface SyncResponse {
  accepted: string[];
  rejected: Array<{
    model_id: string;
    reason: string;
  }>;
}

export interface JWTPayload {
  sub: string;           // User ID
  profile_uuid: string;  // Profile UUID
  tier: string;          // Subscription tier
  model?: string;        // Requested model (optional)
  iat: number;           // Issued at
  exp: number;           // Expiration
  iss: string;           // Issuer (plugged.in)
  aud: string;           // Audience (model-router)
}

export type Provider = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek';

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
}
