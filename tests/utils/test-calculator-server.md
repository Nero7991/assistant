# Calculator Web Server Test Plan

## Test Execution Steps

### 1. Initial Setup
- Start the WebSocket CLI tester
- Login with test credentials
- Verify WebSocket connection established

### 2. Task Submission
Send the following task:
```
task create a calculator web server with Express that supports basic operations (add, subtract, multiply, divide) via REST API endpoints. Include error handling for division by zero.
```

### 3. Expected DevLM Events Sequence

#### Phase 1: Planning
- `process_start` - DevLM process initiated
- `phase_change: planning` - Agent planning the implementation
- `llm_request_start` - LLM analyzing the task
- `llm_request_success` - Plan formulated

#### Phase 2: Implementation
- `phase_change: implementation` - Starting code generation
- `tool_execution_start: create_file` or `write_file` events for:
  - `calculator-server.js` or similar server file
  - `package.json` with dependencies
  - Possibly a README or test file
- `file_operation_start` events for each file
- `file_operation_complete` confirmations

#### Phase 3: Dependencies
- Possible `tool_execution_start: run_command` for `npm init` or `npm install`
- `stdout` events showing package installation

#### Phase 4: Completion
- `phase_change: complete` or similar
- `process_end` - Task completed
- Final `stdout` with instructions or success message

### 4. File Operations Verification

Expected files created:
1. **Server file** (e.g., `calculator-server.js`, `server.js`, or `app.js`)
   - Express server setup
   - REST endpoints for operations
   - Error handling middleware

2. **Package.json**
   - Dependencies: express, possibly body-parser or cors
   - Start script

3. **Optional files**
   - README with API documentation
   - Test file
   - `.gitignore`

### 5. Functional Testing

After completion, verify the server:

```bash
# In a new terminal
cd [created directory]
npm install (if not done by agent)
npm start

# Test endpoints
curl http://localhost:3000/add -X POST -H "Content-Type: application/json" -d '{"a": 5, "b": 3}'
# Expected: {"result": 8}

curl http://localhost:3000/subtract -X POST -H "Content-Type: application/json" -d '{"a": 10, "b": 4}'
# Expected: {"result": 6}

curl http://localhost:3000/multiply -X POST -H "Content-Type: application/json" -d '{"a": 6, "b": 7}'
# Expected: {"result": 42}

curl http://localhost:3000/divide -X POST -H "Content-Type: application/json" -d '{"a": 20, "b": 4}'
# Expected: {"result": 5}

# Test division by zero
curl http://localhost:3000/divide -X POST -H "Content-Type: application/json" -d '{"a": 10, "b": 0}'
# Expected: Error response (400 or similar)
```

### 6. Edge Cases to Test

1. **Missing parameters**
   ```bash
   curl http://localhost:3000/add -X POST -H "Content-Type: application/json" -d '{"a": 5}'
   ```

2. **Invalid data types**
   ```bash
   curl http://localhost:3000/add -X POST -H "Content-Type: application/json" -d '{"a": "five", "b": 3}'
   ```

3. **GET requests to POST endpoints**
   ```bash
   curl http://localhost:3000/add
   ```

### 7. Success Criteria

✅ **Pass Conditions:**
- All expected files created
- Server starts without errors
- All arithmetic endpoints work correctly
- Division by zero returns error (not crash)
- Proper HTTP status codes (200 for success, 400 for errors)
- Clean, readable code generated

❌ **Fail Conditions:**
- Missing endpoints
- Server crashes on any operation
- No error handling for edge cases
- Incorrect calculations
- Missing dependencies in package.json

### 8. Performance Observations

Monitor during execution:
- Time to complete task
- Number of LLM calls
- Any approval requests
- Error corrections made by agent

### 9. Cleanup

After testing:
```bash
# Stop the server (Ctrl+C)
# Remove test files if needed
rm -rf [created directory]
```

## Automated Test Script

See `test-calculator-agent.ts` for automated execution of this test plan.