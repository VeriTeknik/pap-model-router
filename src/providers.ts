/**
 * AI Provider implementations for PAP Model Router
 *
 * Supports: OpenAI, Anthropic, Google, xAI, DeepSeek
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  Provider,
  ProviderConfig,
} from './types.js';

// Anthropic API response types
interface AnthropicResponse {
  id: string;
  content: Array<{ type: string; text: string }>;
  stop_reason: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Google AI API response types
interface GoogleResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

// Provider configurations (loaded from environment)
const providers: Record<Provider, ProviderConfig> = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: 'https://api.openai.com/v1',
    enabled: !!process.env.OPENAI_API_KEY,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseUrl: 'https://api.anthropic.com/v1',
    enabled: !!process.env.ANTHROPIC_API_KEY,
  },
  google: {
    apiKey: process.env.GOOGLE_AI_API_KEY || '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    enabled: !!process.env.GOOGLE_AI_API_KEY,
  },
  xai: {
    apiKey: process.env.XAI_API_KEY || '',
    baseUrl: 'https://api.x.ai/v1',
    enabled: !!process.env.XAI_API_KEY,
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: 'https://api.deepseek.com/v1',
    enabled: !!process.env.DEEPSEEK_API_KEY,
  },
};

// Model to provider mapping
const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  // OpenAI
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-4': 'openai',
  'gpt-3.5-turbo': 'openai',
  'o1-preview': 'openai',
  'o1-mini': 'openai',
  // Anthropic
  'claude-3-5-sonnet-20241022': 'anthropic',
  'claude-3-5-haiku-20241022': 'anthropic',
  'claude-3-opus-20240229': 'anthropic',
  'claude-3-sonnet-20240229': 'anthropic',
  'claude-3-haiku-20240307': 'anthropic',
  // Google
  'gemini-2.0-flash-exp': 'google',
  'gemini-1.5-pro': 'google',
  'gemini-1.5-flash': 'google',
  'gemini-1.5-flash-8b': 'google',
  // xAI
  'grok-beta': 'xai',
  'grok-2': 'xai',
  'grok-2-mini': 'xai',
  // DeepSeek
  'deepseek-chat': 'deepseek',
  'deepseek-coder': 'deepseek',
};

// Model aliases
const MODEL_ALIASES: Record<string, string> = {
  'gpt4': 'gpt-4o',
  'gpt4o': 'gpt-4o',
  'gpt4-mini': 'gpt-4o-mini',
  'claude': 'claude-3-5-sonnet-20241022',
  'claude-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-haiku': 'claude-3-5-haiku-20241022',
  'claude-opus': 'claude-3-opus-20240229',
  'gemini': 'gemini-1.5-pro',
  'gemini-pro': 'gemini-1.5-pro',
  'gemini-flash': 'gemini-1.5-flash',
  'grok': 'grok-beta',
  'deepseek': 'deepseek-chat',
};

/**
 * Resolve model alias to actual model ID
 */
export function resolveModelAlias(model: string): string {
  return MODEL_ALIASES[model.toLowerCase()] || model;
}

/**
 * Get provider for a model
 */
export function getProviderForModel(model: string): Provider | null {
  const resolvedModel = resolveModelAlias(model);
  return MODEL_PROVIDER_MAP[resolvedModel] || null;
}

/**
 * Check if a provider is enabled
 */
export function isProviderEnabled(provider: Provider): boolean {
  return providers[provider]?.enabled || false;
}

/**
 * Get list of available models
 */
export function getAvailableModels(): Array<{ id: string; provider: Provider }> {
  return Object.entries(MODEL_PROVIDER_MAP)
    .filter(([, provider]) => isProviderEnabled(provider))
    .map(([id, provider]) => ({ id, provider }));
}

/**
 * Route chat completion to appropriate provider
 */
export async function routeChatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const resolvedModel = resolveModelAlias(request.model);
  const provider = getProviderForModel(resolvedModel);

  if (!provider) {
    throw new Error(`Unknown model: ${request.model}`);
  }

  if (!isProviderEnabled(provider)) {
    throw new Error(`Provider ${provider} is not configured`);
  }

  const config = providers[provider];

  switch (provider) {
    case 'openai':
      return callOpenAI({ ...request, model: resolvedModel }, config);
    case 'anthropic':
      return callAnthropic({ ...request, model: resolvedModel }, config);
    case 'google':
      return callGoogle({ ...request, model: resolvedModel }, config);
    case 'xai':
    case 'deepseek':
      return callOpenAICompatible({ ...request, model: resolvedModel }, config, provider);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  request: ChatCompletionRequest,
  config: ProviderConfig
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      top_p: request.top_p,
      n: request.n,
      stream: false,
      stop: request.stop,
      max_tokens: request.max_tokens,
      presence_penalty: request.presence_penalty,
      frequency_penalty: request.frequency_penalty,
      user: request.user,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<ChatCompletionResponse>;
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
  request: ChatCompletionRequest,
  config: ProviderConfig
): Promise<ChatCompletionResponse> {
  // Extract system message
  const systemMessage = request.messages.find((m) => m.role === 'system');
  const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

  // Convert messages to Anthropic format
  const anthropicMessages = nonSystemMessages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content || '',
  }));

  const response = await fetch(`${config.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      system: systemMessage?.content || undefined,
      messages: anthropicMessages,
      temperature: request.temperature,
      top_p: request.top_p,
      stop_sequences: typeof request.stop === 'string' ? [request.stop] : request.stop,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as AnthropicResponse;

  // Convert Anthropic response to OpenAI format
  return {
    id: data.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: request.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: data.content[0]?.text || '',
        },
        finish_reason: data.stop_reason === 'max_tokens' ? 'length' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

/**
 * Call Google AI API
 */
async function callGoogle(
  request: ChatCompletionRequest,
  config: ProviderConfig
): Promise<ChatCompletionResponse> {
  // Extract system message
  const systemMessage = request.messages.find((m) => m.role === 'system');
  const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

  // Convert messages to Google format
  const contents = nonSystemMessages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content || '' }],
  }));

  const url = `${config.baseUrl}/models/${request.model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents,
      systemInstruction: systemMessage ? { parts: [{ text: systemMessage.content }] } : undefined,
      generationConfig: {
        temperature: request.temperature,
        topP: request.top_p,
        maxOutputTokens: request.max_tokens,
        stopSequences: typeof request.stop === 'string' ? [request.stop] : request.stop,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google AI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as GoogleResponse;
  const candidate = data.candidates?.[0];

  // Convert Google response to OpenAI format
  return {
    id: `google-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: request.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: candidate?.content?.parts?.[0]?.text || '',
        },
        finish_reason: candidate?.finishReason === 'STOP' ? 'stop' : 'length',
      },
    ],
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0,
    },
  };
}

/**
 * Call OpenAI-compatible API (xAI, DeepSeek)
 */
async function callOpenAICompatible(
  request: ChatCompletionRequest,
  config: ProviderConfig,
  providerName: string
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      top_p: request.top_p,
      n: request.n,
      stream: false,
      stop: request.stop,
      max_tokens: request.max_tokens,
      presence_penalty: request.presence_penalty,
      frequency_penalty: request.frequency_penalty,
      user: request.user,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${providerName} API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<ChatCompletionResponse>;
}
