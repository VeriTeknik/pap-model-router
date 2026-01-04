/**
 * PAP Model Router Microservice
 *
 * Standalone service for routing LLM requests to multiple AI providers.
 * Designed to be registered with plugged.in Station via /admin/model-services.
 *
 * Endpoints:
 * - GET /health - Health check (required by Station)
 * - GET /v1/models - List available models (required by Station)
 * - POST /v1/models/sync - Accept model definitions from Station
 * - POST /v1/chat/completions - OpenAI-compatible chat completions
 */

import express, { Request, Response, NextFunction } from 'express';
import { authenticateToken, optionalAuth, adminAuth } from './auth.js';
import {
  routeChatCompletion,
  getAvailableModels,
  resolveModelAlias,
  getProviderForModel,
  isProviderEnabled,
  registerSyncedModel,
  clearSyncedModels,
  getSyncedModelsCount,
} from './providers.js';
import type {
  ChatCompletionRequest,
  HealthResponse,
  ModelInfo,
  SyncRequest,
  SyncResponse,
} from './types.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Configuration
const PORT = parseInt(process.env.PORT || '8080', 10);
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const SERVICE_REGION = process.env.SERVICE_REGION || 'default';

// Metrics tracking
let startTime = Date.now();
let activeRequests = 0;
let totalRequests = 0;
let errorCount1m = 0;
let lastErrorReset = Date.now();

// Synced models from Station
const syncedModels = new Map<string, {
  model_id: string;
  provider: string;
  display_name: string;
  capabilities?: string[];
}>();

// Request tracking middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  activeRequests++;
  totalRequests++;

  res.on('finish', () => {
    activeRequests--;
    if (res.statusCode >= 500) {
      errorCount1m++;
    }
  });

  next();
});

// Reset error count every minute
setInterval(() => {
  errorCount1m = 0;
  lastErrorReset = Date.now();
}, 60000);

/**
 * GET /health - Health check endpoint
 * Required by plugged.in Station for service monitoring
 */
app.get('/health', async (_req: Request, res: Response) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Check provider connectivity
  const providerStatus: Record<string, { status: 'ok' | 'error'; latency_ms?: number }> = {};

  const providers = ['openai', 'anthropic', 'google', 'xai', 'deepseek'] as const;
  for (const provider of providers) {
    if (isProviderEnabled(provider)) {
      providerStatus[provider] = { status: 'ok' };
    }
  }

  const timeSinceErrorReset = Date.now() - lastErrorReset;
  const errorRate = timeSinceErrorReset > 0 ? (errorCount1m / (timeSinceErrorReset / 60000)) : 0;

  const health: HealthResponse = {
    status: errorRate > 0.5 ? 'degraded' : 'ok',
    version: SERVICE_VERSION,
    uptime_seconds: uptimeSeconds,
    active_requests: activeRequests,
    error_rate_1m: Math.round(errorRate * 100) / 100,
    providers: providerStatus,
  };

  // Add load percentage based on active requests (rough estimate)
  // Assuming 100 concurrent requests = 100% load
  health.load_percent = Math.min(100, Math.round(activeRequests));

  res.json(health);
});

/**
 * GET /v1/models - List available models
 * Required by plugged.in Station for model discovery
 */
app.get('/v1/models', optionalAuth, (_req: Request, res: Response) => {
  const now = Math.floor(Date.now() / 1000);

  // Combine synced models with locally available models
  const models: ModelInfo[] = [];

  // Add synced models first
  for (const [id, model] of syncedModels) {
    models.push({
      id,
      object: 'model',
      created: now,
      owned_by: model.provider,
      capabilities: model.capabilities,
    });
  }

  // Add locally available models that aren't synced
  const availableModels = getAvailableModels();
  for (const { id, provider } of availableModels) {
    if (!syncedModels.has(id)) {
      models.push({
        id,
        object: 'model',
        created: now,
        owned_by: provider,
      });
    }
  }

  res.json({
    object: 'list',
    data: models,
    // Also include 'models' for plugged.in Station compatibility
    models: models,
  });
});

/**
 * POST /v1/models/sync - Accept model definitions from Station
 * Required by plugged.in Station for model synchronization
 */
app.post('/v1/models/sync', authenticateToken, (req: Request, res: Response) => {
  const { models } = req.body as SyncRequest;

  if (!Array.isArray(models)) {
    res.status(400).json({ error: 'models must be an array' });
    return;
  }

  const accepted: string[] = [];
  const rejected: Array<{ model_id: string; reason: string }> = [];

  for (const model of models) {
    // Check if we can route this model
    const provider = getProviderForModel(model.model_id);

    if (!provider) {
      rejected.push({
        model_id: model.model_id,
        reason: 'Unknown model - no provider mapping',
      });
      continue;
    }

    if (!isProviderEnabled(provider)) {
      rejected.push({
        model_id: model.model_id,
        reason: `Provider ${provider} is not configured`,
      });
      continue;
    }

    // Accept the model
    syncedModels.set(model.model_id, {
      model_id: model.model_id,
      provider: model.provider,
      display_name: model.display_name,
      capabilities: model.capabilities,
    });
    accepted.push(model.model_id);
  }

  console.log(`[Sync] Accepted ${accepted.length} models, rejected ${rejected.length}`);

  const response: SyncResponse = { accepted, rejected };
  res.json(response);
});

/**
 * POST /admin/sync - Accept full model list from pluggedin-app
 * Simpler than /v1/models/sync - trusts pluggedin-app's model list
 */
app.post('/admin/sync', adminAuth, (req: Request, res: Response) => {
  interface AdminSyncModel {
    id: string;
    provider: string;
    displayName?: string;
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
    contextWindow?: number;
    supportsVision?: boolean;
  }

  const { models } = req.body as { models: AdminSyncModel[] };

  if (!Array.isArray(models)) {
    res.status(400).json({ error: 'models must be an array' });
    return;
  }

  // Clear existing synced models and replace with new list
  syncedModels.clear();
  clearSyncedModels(); // Clear provider routing map too

  for (const model of models) {
    if (!model.id || !model.provider) {
      console.warn(`[AdminSync] Skipping invalid model: ${JSON.stringify(model)}`);
      continue;
    }

    // Register in provider routing map for dynamic routing
    registerSyncedModel(model.id, model.provider);

    syncedModels.set(model.id, {
      model_id: model.id,
      provider: model.provider,
      display_name: model.displayName || model.id,
      capabilities: model.supportsVision ? ['chat', 'vision'] : ['chat'],
    });
  }

  console.log(`[AdminSync] Synced ${syncedModels.size} models from pluggedin-app (${getSyncedModelsCount()} registered for routing)`);

  res.json({
    success: true,
    count: syncedModels.size,
    models: Array.from(syncedModels.keys()),
  });
});

/**
 * GET /admin/models - Get current synced models (for debugging)
 */
app.get('/admin/models', adminAuth, (_req: Request, res: Response) => {
  const models = Array.from(syncedModels.entries()).map(([id, model]) => ({
    id,
    provider: model.provider,
    displayName: model.display_name,
    capabilities: model.capabilities,
  }));

  res.json({ models, count: models.length });
});

/**
 * POST /v1/chat/completions - OpenAI-compatible chat completions
 * Main endpoint for LLM requests
 */
app.post('/v1/chat/completions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const request = req.body as ChatCompletionRequest;

    // Validate required fields
    if (!request.model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }

    if (!request.messages || !Array.isArray(request.messages)) {
      res.status(400).json({ error: 'messages array is required' });
      return;
    }

    // Resolve model alias
    const resolvedModel = resolveModelAlias(request.model);
    const provider = getProviderForModel(resolvedModel);

    if (!provider) {
      res.status(400).json({
        error: `Unknown model: ${request.model}`,
        available_models: getAvailableModels().map((m) => m.id),
      });
      return;
    }

    if (!isProviderEnabled(provider)) {
      res.status(503).json({
        error: `Provider ${provider} is not configured on this service`,
      });
      return;
    }

    // Log request
    console.log(`[Chat] User ${req.user?.sub} requesting ${resolvedModel} via ${provider}`);

    // Route to provider
    const startTime = Date.now();
    const response = await routeChatCompletion({ ...request, model: resolvedModel });
    const latencyMs = Date.now() - startTime;

    console.log(`[Chat] Completed in ${latencyMs}ms, tokens: ${response.usage?.total_tokens || 0}`);

    res.json(response);
  } catch (error) {
    console.error('[Chat] Error:', error);

    if (error instanceof Error) {
      if (error.message.includes('API error')) {
        res.status(502).json({ error: error.message });
        return;
      }
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET / - Service info
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'pap-model-router',
    version: SERVICE_VERSION,
    region: SERVICE_REGION,
    endpoints: {
      health: 'GET /health',
      models: 'GET /v1/models',
      sync: 'POST /v1/models/sync',
      chat: 'POST /v1/chat/completions',
      adminSync: 'POST /admin/sync',
      adminModels: 'GET /admin/models',
    },
    documentation: 'https://github.com/VeriTeknik/PAP',
  });
});

// Error handling
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[PAP Model Router] Starting v${SERVICE_VERSION}`);
  console.log(`[PAP Model Router] Region: ${SERVICE_REGION}`);
  console.log(`[PAP Model Router] Listening on port ${PORT}`);

  // Log enabled providers
  const providers = ['openai', 'anthropic', 'google', 'xai', 'deepseek'] as const;
  const enabled = providers.filter(isProviderEnabled);
  console.log(`[PAP Model Router] Enabled providers: ${enabled.join(', ') || 'none'}`);

  if (enabled.length === 0) {
    console.warn('[PAP Model Router] WARNING: No providers configured!');
    console.warn('[PAP Model Router] Set API keys: OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.');
  }
});
