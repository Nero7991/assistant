# DevLM Workflow Understanding

## Overview

DevLM (Development Language Model) is an AI-powered development assistant integrated into the Kona application. It allows users to execute development tasks through natural language instructions, with the AI agent performing file operations, running commands, and making code changes.

## Architecture Components

### 1. **Frontend (React)**
- **DevlmRunnerContext**: React context managing WebSocket connection and state
- **Agent Page**: UI for interacting with DevLM (chat and task modes)
- **WebSocket Client**: Real-time bidirectional communication

### 2. **Backend (Node.js/Express)**
- **WebSocket Server**: Handles connections at `/api/devlm/ws`
- **Authentication**: Token-based auth with 60-second expiry
- **Process Management**: Spawns and manages Python bootstrap.py processes
- **LLM Routing**: Routes LLM requests from DevLM to appropriate providers

### 3. **DevLM Core (Python)**
- **bootstrap.py**: Main execution engine
- **LLM Clients**: Implementations for various LLM providers
- **Tool System**: File operations, command execution, etc.
- **Event System**: WebSocket event emission for UI updates

## Workflow Modes

### 1. **Test Mode** (Default)
- Used for development and testing tasks
- Full access to file operations and command execution
- Suitable for code generation, refactoring, debugging

### 2. **Debug Mode**
- Enhanced logging and debugging information
- Saves prompts and responses to disk
- Useful for troubleshooting LLM interactions

### 3. **Generate Mode**
- Focused on code generation tasks
- May have different approval requirements

## Message Flow During Task Execution

### 1. **Task Initiation**
```
User → Agent Page → DevlmRunnerContext → WebSocket → Backend → bootstrap.py
```

1. User enters task in Agent Page
2. DevlmRunnerContext calls `startScript()` with parameters
3. WebSocket connection established (if not already)
4. Authentication token obtained and validated
5. Backend spawns bootstrap.py process with task

### 2. **Task Processing**
```
bootstrap.py → LLM → Tools → File System/Commands
     ↓
WebSocket Events → Backend → WebSocket → Frontend
```

1. bootstrap.py processes the task
2. Emits `process_start` event
3. Makes LLM requests for understanding and planning
4. Executes tools (file operations, commands)
5. Emits events for each operation

### 3. **WebSocket Events**

#### Process Events:
- `process_start`: Task execution begins
- `phase_change`: Major phase transitions
- `process_end`: Task completion

#### LLM Events:
- `llm_request_start`: LLM call initiated
- `llm_request_success`: Response received
- `llm_request_error`: LLM error occurred

#### Tool Events:
- `tool_execution_start`: Tool being executed
- `tool_execution_result`: Tool execution complete
- `file_operation_start`: File operation beginning
- `file_operation_complete`: File operation done

#### System Events:
- `system_log`: General logging
- `waiting_for_approval`: User approval needed
- `approval_response_received`: Approval processed

### 4. **Chat Mode**

During task execution, users can interact via chat:

1. User sends message via `sendChatMessage()`
2. Message sent via WebSocket as `chat_message` event
3. DevLM processes in context of current task
4. Response sent back as `chat_response` events
5. Streaming supported with `chat_response_chunk`

## State Management

### Frontend State (DevlmRunnerContext):
- `output[]`: Terminal output lines
- `isRunning`: Task execution status
- `error`: Current error state
- `isConnected`: WebSocket connection status
- `chatMessages[]`: Chat history
- `isTyping`: AI typing indicator
- `currentSessionId`: Active session identifier

### Backend State:
- `runningDevlmProcesses`: Map of userId → process info
- `wsAuthTokens`: Authentication tokens
- Active WebSocket connections

### DevLM State:
- Task context and history
- File operation tracking
- Command execution history
- LLM conversation context

## Authentication Flow

1. Frontend requests token: `POST /api/devlm/ws-token`
2. Backend generates token (32 bytes, 60s expiry)
3. Frontend connects to WebSocket
4. Sends `auth` message with token
5. Backend validates and associates connection with user
6. `auth_success` sent back to frontend

## LLM Integration

### Supported Providers:
- **Anthropic**: Direct Claude API
- **OpenAI**: GPT models and compatible APIs
- **Google Cloud**: Gemini models via Vertex AI
- **Kona**: Routes through Kona's LLM system

### LLM Request Flow:
1. DevLM needs LLM response
2. Sends `llm_request_to_kona` via stdout
3. Backend captures and parses JSON event
4. Routes to appropriate LLM provider
5. Response sent back via WebSocket

## Error Handling

### Connection Errors:
- Automatic reconnection with exponential backoff
- Session persistence across reconnections
- Authentication timeout (10 seconds)

### Process Errors:
- stderr captured and sent as error events
- Process exit codes tracked
- Graceful shutdown on errors

### LLM Errors:
- Rate limiting with retry logic
- Token limit handling
- Provider-specific error codes

## Best Practices

### For Users:
1. Use clear, specific task descriptions
2. Start with test mode for development tasks
3. Monitor the event stream for progress
4. Use chat for clarifications during execution

### For Developers:
1. Always emit appropriate events for UI feedback
2. Handle errors gracefully with informative messages
3. Keep context within token limits
4. Use structured events for better parsing

## Key Differences Between Modes

### Test Mode:
- Full functionality enabled
- Automatic approval for most operations
- Best for active development

### Debug Mode:
- Additional logging to `.devlm/debug/`
- Verbose prompt/response tracking
- Performance impact due to extra I/O

### Chat-Only Mode:
- No task execution
- Pure conversational interface
- Lower resource usage

## Session Lifecycle

1. **Start**: User initiates task or chat
2. **Authentication**: WebSocket authenticated
3. **Execution**: Task processed or chat handled
4. **Interaction**: User can chat during execution
5. **Completion**: Task finishes or user stops
6. **Cleanup**: Process terminated, resources freed

## Future Enhancements

1. **Multi-task Sessions**: Run multiple tasks in parallel
2. **Task Templates**: Predefined task configurations
3. **Visual Diff Preview**: Show changes before applying
4. **Approval UI**: Interactive approval interface
5. **Progress Tracking**: Better progress indicators
6. **Session Persistence**: Resume interrupted sessions