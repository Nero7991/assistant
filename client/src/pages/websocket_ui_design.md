# Design Document: Enhanced WebSocket UI in View.tsx

## 1. Objective

Revamp the DevLM Runner UI in `View.tsx` to parse, process, and display new detailed WebSocket events originating from `bootstrap.py`. The goal is to provide a richer, more informative, and user-friendly experience by visualizing the script's actions and progress in real-time.

## 2. Current WebSocket Handling

Currently, `View.tsx` receives WebSocket messages and primarily appends them to a raw text-based `output` state. The `onmessage` handler uses a `switch` statement for basic event types like `status`, `error`, `stdout`, `stderr`, and `end`.

## 3. Consuming New WebSocket Events

`View.tsx` will need to be updated to handle the new event types detailed in `devlm/websocket_event_design.md`. This involves:

*   **Defining Client-Side Types:** Create TypeScript interfaces for each new WebSocket event type and its payload to ensure type safety and clarity.
*   **Updating `onmessage` Handler:** Expand the `switch` statement in the WebSocket `onmessage` handler to recognize and process all new event types.
*   **State Management:** Introduce new state variables or modify existing ones to store and manage the information derived from these events.

## 4. Proposed UI Enhancements

Instead of a single undifferentiated stream of text, the UI will be enhanced to present information more structurally.

### 4.1. Structured Event Log / Activity Feed

*   **Component:** A new component (e.g., `<ActivityLogItem />`) will be created to render each significant event.
*   **Display:** Each item could show:
    *   Timestamp.
    *   Icon representing event type (e.g., ⚙️ for tool, 🧠 for LLM, 📄 for file op).
    *   Brief, human-readable summary of the event (e.g., "Started LLM request: Summarizing file...", "Executed tool: `edit_file` on `path/to/file.py` - Success").
    *   Collapsible section for detailed payload information (e.g., full command, LLM prompt/response summary, file diff).
*   **Styling:** Different event types can have distinct visual styles (colors, icons) for quick identification (e.g., errors in red, LLM interactions in blue, tool executions in green).
*   **Filtering/Searching:** (Future Enhancement) Consider adding options to filter the log by event type or search its content.

### 4.2. Status Indicators & Progress Display

*   **Overall Progress:** A visual indicator (e.g., a progress bar or status message area) to show the current `phaseName` from `phase_change` events.
*   **LLM Activity:** A specific indicator (e.g., a spinner or text like "LLM is thinking...") activated by `llm_request_start` and deactivated by `llm_request_success`/`llm_request_error`.
*   **Tool Activity:** Display the currently active tool based on `tool_execution_start` and its outcome from `tool_execution_result`.
*   **Task Summary:** Display the `taskId` and `taskDescription` from the `process_start` event prominently.

### 4.3. Interactive Approval Prompts

*   When a `waiting_for_approval` event is received:
    *   Display a modal dialog or a distinct UI section presenting the `actionDescription`, `proposedCommand`/`proposedEditDiff`.
    *   Provide "Approve" and "Deny" buttons.
    *   Clicking these buttons will send a corresponding message back to the server via WebSocket (e.g., `{ type: "user_approval_response", payload: { approvalId: string, approved: boolean } }`).
    *   The UI should indicate it's waiting for the `approval_response_received` event from the backend.

### 4.4. Enhanced Error Display

*   Errors from `llm_request_error`, `tool_execution_result` (with failure status), and `system_log` (with error level) should be clearly highlighted, possibly in a dedicated error panel or as prominent items in the activity feed.

## 5. State Management Strategy

*   `taskDetails: { id: string, description: string, configuration: any } | null` (from `process_start`)
*   `currentPhase: string | null` (from `phase_change`)
*   `llmOperation: { requestId: string, model: string, promptSummary: string, status: 'pending' | 'streaming' | 'success' | 'error', error?: string } | null`
*   `activeTool: { toolExecutionId: string, toolName: string, toolArgs: any, status: 'running' | 'success' | 'failure', resultSummary?: string, error?: string } | null`
*   `approvalRequest: { approvalId: string, actionDescription: string, proposedCommand?: string, proposedEditDiff?: string } | null` (from `waiting_for_approval`)
*   `activityLog: Array<ActivityLogEntry>` where `ActivityLogEntry` is a new type that can represent any of the incoming WebSocket events in a structured way, including timestamp, type, summary, and full payload.
    *   This `activityLog` will replace or augment the current `output: string[]`.
*   The existing `isRunning`, `error` states will be maintained and updated appropriately.

## 6. WebSocket `onmessage` Handler Logic Update

The `onmessage` handler will:
1.  Parse the incoming JSON event.
2.  Use a `switch (event.type)` to delegate to specific handler functions for each event type.
3.  Each handler function will:
    *   Update the relevant state variables (e.g., `currentPhase`, `llmOperation`, `activeTool`).
    *   Create a structured entry and add it to the `activityLog` state.
    *   Handle UI side-effects (e.g., displaying modals for approval).

## 7. Implementation Checklist

*   [ ] **Define Client-Side Event Types:** Create TypeScript interfaces for all WebSocket event payloads defined in `devlm/websocket_event_design.md`.
*   [ ] **Update `onmessage` Handler:** Refactor the `ws.onmessage` function to handle all new event types with dedicated logic.
*   [ ] **State Management:** Implement new state variables (`taskDetails`, `currentPhase`, `llmOperation`, `activeTool`, `approvalRequest`, `activityLog`) using `useState` or a more advanced state management solution if the complexity grows.
*   [ ] **UI Components:**
    *   [ ] Design and implement `<ActivityLogItem />` component.
    *   [ ] Design and implement the main activity feed/log display area that maps `activityLog` state to `<ActivityLogItem />` components.
    *   [ ] Implement status indicators for phase, LLM activity, and tool activity.
    *   [ ] Implement UI for `waiting_for_approval` (e.g., modal) and logic to send approval responses back to the server.
*   [ ] **Rendering Logic:** Update the main render function of `View.tsx` to incorporate the new UI components and display information from the new state variables.
*   [ ] **Styling:** Apply CSS/MUI styling to the new components for clarity, usability, and visual appeal. Differentiate event types visually.
*   [ ] **Error Handling:** Ensure robust display of errors from WebSocket events and connection issues.
*   [ ] **WebSocket Communication (Approval):** Implement the client-to-server WebSocket message for user approval responses.
*   [ ] **Backward Compatibility/Refinement:** Ensure existing functionalities (like displaying `stdout`/`stderr`, stopping script) are maintained or gracefully integrated into the new system.
*   [ ] **Testing:** Thoroughly test the UI with all new event types, ensuring correct parsing, state updates, and rendering. Test interactive elements like approval prompts.

## 8. Considerations

*   **Performance:** Rendering a very long `activityLog` can impact performance. Consider virtualization or pagination for the log if it becomes an issue.
*   **UI Complexity:** Balance information richness with UI clarity. Avoid overwhelming the user.
*   **Real-time Updates:** Ensure smooth and non-janky updates as events stream in. 