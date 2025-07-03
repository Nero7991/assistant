# WebSocket CLI Tester for Kona DevLM

A command-line interface for testing the Kona DevLM WebSocket API, mimicking the functionality of the agent page.

## Features

- Interactive login with email/password
- Real-time WebSocket connection to DevLM
- Send tasks and receive live output
- Track file operations
- Handle approval requests
- Colored output for better readability

## Setup

1. Install dependencies:
```bash
cd tests/utils
npm install
```

2. Create a `.env` file (optional):
```env
API_URL=http://localhost:5001
```

## Usage

Run the CLI tester:
```bash
npm start
```

Or directly with tsx:
```bash
npx tsx websocket-cli-tester.ts
```

### Commands

Once logged in and connected:

- `task <message>` - Send a DevLM task (e.g., `task create a hello world python script`)
- `stop` - Stop the currently running task
- `files` - Show all file operations from the current session
- `help` - Show available commands
- `exit` or `quit` - Exit the program

### Example Session

```
$ npm start

[INFO] Welcome to Kona WebSocket CLI Tester
Email: testuser@example.com
Password: ********
[SUCCESS] Logged in as testuser@example.com
[INFO] Connecting to WebSocket at ws://localhost:5001/api/devlm/ws...
[SUCCESS] WebSocket connected
[SUCCESS] WebSocket authenticated

Kona WebSocket CLI Tester - Interactive Mode
Commands: task <message>, stop, files, exit

> task create a simple calculator in Python

[INFO] Sending task: create a simple calculator in Python
[INFO] DevLM process started
[INFO] Phase: planning
[INFO] LLM Request: gemini - gemini-2.0-flash-exp
...

> files

File Operations:
1. write calculator.py at 2024-01-15T10:30:45.123Z

> exit
[INFO] Goodbye!
```

## Event Types

The tester handles all DevLM WebSocket events:

- Authentication events (`auth_success`)
- Status messages (`status`, `warning`, `error`)
- Process output (`stdout`, `stderr`)
- DevLM lifecycle (`process_start`, `process_end`)
- LLM interactions (`llm_request_start`, `llm_request_success`)
- Tool executions (`tool_execution_start`, `tool_execution_result`)
- File operations (`file_operation_start`, `file_operation_complete`)
- Approval requests (`waiting_for_approval`)

## Testing Different Scenarios

1. **Basic task execution:**
   ```
   > task write a hello world script
   ```

2. **File operations tracking:**
   ```
   > task create a React component for a todo list
   > files
   ```

3. **Approval handling:**
   ```
   > task delete all files in the current directory
   ```
   (This should trigger an approval request)

4. **Error handling:**
   ```
   > task [invalid task that might cause errors]
   ```

## Development

To modify the tester, edit `websocket-cli-tester.ts` and run with tsx for immediate feedback without compilation.