# PAP Model Router

Standalone microservice for routing LLM requests to multiple AI providers. Designed to be registered with plugged.in Station via the admin panel.

## Features

- **Multi-provider support**: OpenAI, Anthropic, Google AI, xAI, DeepSeek
- **OpenAI-compatible API**: Drop-in replacement for OpenAI chat completions
- **JWT authentication**: Secure token verification from plugged.in Station
- **Health monitoring**: Built-in health endpoint for service discovery
- **Model sync**: Accept model definitions from Station

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variables
export MODEL_ROUTER_JWT_SECRET="your-jwt-secret"  # Same as pluggedin-app
export OPENAI_API_KEY="sk-..."                     # Optional
export ANTHROPIC_API_KEY="sk-ant-..."              # Optional
export GOOGLE_AI_API_KEY="..."                     # Optional
export XAI_API_KEY="..."                           # Optional
export DEEPSEEK_API_KEY="..."                      # Optional

# Development
npm run dev

# Production
npm run build
npm start
```

## Docker

```bash
# Build
docker build -t pap-model-router .

# Run
docker run -p 8080:8080 \
  -e MODEL_ROUTER_JWT_SECRET="your-jwt-secret" \
  -e OPENAI_API_KEY="sk-..." \
  pap-model-router
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MODEL_ROUTER_JWT_SECRET` | Yes | JWT secret (same as pluggedin-app) |
| `MODEL_ROUTER_ADMIN_TOKEN` | Yes | Admin token for pluggedin-app sync |
| `PORT` | No | Server port (default: 8080) |
| `SERVICE_VERSION` | No | Version for health check (default: 1.0.0) |
| `SERVICE_REGION` | No | Region identifier (default: default) |
| `OPENAI_API_KEY` | No | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | Anthropic API key |
| `GOOGLE_AI_API_KEY` | No | Google AI API key |
| `XAI_API_KEY` | No | xAI API key |
| `DEEPSEEK_API_KEY` | No | DeepSeek API key |

## API Endpoints

### GET /health

Health check endpoint for service monitoring.

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime_seconds": 3600,
  "active_requests": 5,
  "error_rate_1m": 0.01,
  "load_percent": 5,
  "providers": {
    "openai": { "status": "ok" },
    "anthropic": { "status": "ok" }
  }
}
```

### GET /v1/models

List available models.

```json
{
  "object": "list",
  "data": [
    { "id": "gpt-4o", "object": "model", "owned_by": "openai" },
    { "id": "claude-3-5-sonnet-20241022", "object": "model", "owned_by": "anthropic" }
  ]
}
```

### POST /v1/models/sync

Accept model definitions from Station. Requires JWT authentication.

```json
{
  "models": [
    {
      "model_id": "gpt-4o",
      "provider": "openai",
      "display_name": "GPT-4o",
      "capabilities": ["streaming", "vision"]
    }
  ]
}
```

### POST /v1/chat/completions

OpenAI-compatible chat completions. Requires JWT authentication.

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### POST /admin/sync

Sync enabled models from pluggedin-app. Requires admin token authentication.

```bash
curl -X POST http://localhost:8080/admin/sync \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "models": [
      {
        "id": "gpt-5",
        "provider": "openai",
        "displayName": "GPT-5",
        "supportsVision": true
      }
    ]
  }'
```

Response:
```json
{
  "success": true,
  "count": 23,
  "models": ["gpt-5", "claude-opus-4-5-20251101", ...]
}
```

### GET /admin/models

Get currently synced models (for debugging). Requires admin token authentication.

```bash
curl http://localhost:8080/admin/models \
  -H "Authorization: Bearer <admin-token>"
```

## Registering with plugged.in

1. Deploy this service (e.g., `https://model-router.example.com`)
2. Go to plugged.in admin panel → Model Services
3. Click "Add Service"
4. Enter the service URL
5. Test connection
6. Sync models

The service will automatically:
- Receive health checks from Station
- Accept model sync requests
- Route agent requests to AI providers

## Supported Models

### OpenAI
- gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo
- o1-preview, o1-mini

### Anthropic
- claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022
- claude-3-opus-20240229, claude-3-sonnet-20240229, claude-3-haiku-20240307

### Google AI
- gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash, gemini-1.5-flash-8b

### xAI
- grok-beta, grok-2, grok-2-mini

### DeepSeek
- deepseek-chat, deepseek-coder

## Model Aliases

For convenience, these aliases are supported:
- `gpt4` → gpt-4o
- `claude` → claude-3-5-sonnet-20241022
- `gemini` → gemini-1.5-pro
- `grok` → grok-beta
- `deepseek` → deepseek-chat

## License

MIT
