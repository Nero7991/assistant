# DevLM LLM Integration Analysis

## Overview

DevLM is a tool for automating software development using LLMs. It's integrated into the assistant as a submodule and provides an agent interface through WebSocket connections. The LLM integration is designed to support multiple providers with a unified interface.

## Current LLM Support

### 1. **Supported Providers**

DevLM currently supports three LLM providers through the `--source` argument:

- **Anthropic** (`anthropic`) - Direct API access
- **Google Cloud Vertex AI** (`gcloud`) - Can use both Google and Anthropic models
- **OpenAI** (`openai`) - Supports OpenAI and compatible APIs

### 2. **LLM Client Architecture**

The LLM implementation uses an abstract interface pattern:

```python
class LLMInterface(abc.ABC):
    @abc.abstractmethod
    def generate_response(self, prompt: str, max_tokens: int) -> str:
        pass
```

Each provider implements this interface:
- `AnthropicLLM` - Uses Claude models directly
- `VertexAILLM` - Uses Anthropic models through Vertex AI
- `GoogleVertexLLM` - Uses Google models (Gemini) through Vertex AI
- `OpenAILLM` - Uses OpenAI models or compatible servers

### 3. **Model Configuration**

#### Default Models:
- **Anthropic**: `claude-3-5-sonnet-20241022`
- **Google Vertex**: `gemini-1.5-flash-001`
- **OpenAI**: `gpt-4` (configurable)

#### Model Selection:
- Models can be specified via `--model` argument
- The system supports model switching during runtime
- Special handling for o1/o3 models (uses `max_completion_tokens` instead of `max_tokens`)

### 4. **Authentication Methods**

#### API Key Sources (Priority Order):
1. Command-line arguments (`--api-key`)
2. Environment variables:
   - `ANTHROPIC_API_KEY` for Anthropic
   - `OPENAI_API_KEY` for OpenAI
3. `.devlm.env` file (fallback)

#### Google Cloud Auth:
- Uses Application Default Credentials
- Requires `--project-id` and `--region`
- Optional `--publisher` parameter to choose between Google or Anthropic models on Vertex

### 5. **Integration with Assistant**

#### WebSocket API:
- Endpoint: `/api/devlm/ws`
- Authentication: Token-based (60-second expiry)
- Token endpoint: `/api/devlm/ws-token`

#### Session Management:
- Sessions stored in `devlmSessions` table
- API keys can be stored per session (encrypted)
- Configuration includes:
  - `sessionName`
  - `mode` (generate/test)
  - `model`
  - `source` (provider)
  - `publisher` (for Vertex AI)
  - `projectPath`
  - `writeMode`
  - Various flags (debugPrompt, noApproval, frontend)

#### Process Execution:
- DevLM runs as a subprocess via Python
- Real-time output streaming through WebSocket
- Support for stdin input to the process
- Process lifecycle management (start/stop/restart)

### 6. **Key Features**

#### Error Handling:
- Rate limiting with exponential backoff
- Automatic retry logic
- Daily rate limit handling (waits until midnight)
- Credit balance checks
- Overload handling

#### Context Management:
- Maximum prompt length: 200,000 characters
- Automatic truncation with warning
- Context includes:
  - Project structure
  - Previous actions
  - Running processes
  - User notes
  - History brief

#### WebSocket Events:
DevLM emits structured events for UI updates:
- `llm_request_start`
- `llm_request_success`
- `llm_request_error`
- `tool_execution_start`
- `tool_execution_result`
- `file_operation_start`
- `file_operation_complete`
- `system_log`
- `process_start`
- `process_end`

### 7. **Configuration Structure**

```typescript
interface StartScriptParams {
  task: string;
  mode: string;
  model: string;
  source: string;
  publisher?: string;
  projectPath: string;
  writeMode: string;
  projectId?: string;
  region?: string;
  serverUrl?: string;
  debugPrompt: boolean;
  noApproval: boolean;
  frontend: boolean;
  sessionId?: number | string;
}
```

### 8. **Adding New LLM Providers**

To add a new LLM provider:

1. Create a new class implementing `LLMInterface`
2. Add the provider to the `get_llm_client()` function
3. Update argument parsing to accept the new source
4. Handle authentication/configuration specifics
5. Implement error handling patterns
6. Update the WebSocket runner to pass required parameters

### 9. **Current Limitations**

1. **Context Recall**: Issues with needle-in-haystack problem in large contexts
2. **Model Verbosity**: Claude Sonnet 3.5 can be unnecessarily verbose
3. **Fixed Context Window**: Hard limit of 200k characters
4. **Single Model Per Session**: Cannot switch models mid-session easily

### 10. **Recommended Improvements**

1. **Dynamic Model Selection**: Allow model switching during a session
2. **Context Optimization**: Implement smarter context management to reduce token usage
3. **Streaming Responses**: Add streaming support for real-time feedback
4. **Local Model Support**: Complete llama.cpp integration for local models
5. **Better Token Tracking**: Implement token usage monitoring and reporting
6. **Multi-Provider Sessions**: Support using different providers for different tasks
7. **Response Caching**: Cache common operations to reduce API calls
8. **Parallel Processing**: Support running multiple LLM calls in parallel for faster execution