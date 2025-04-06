## Agentic LLM Interaction

The assistant utilizes an agentic approach for handling user requests related to tasks, schedules, and reminders within the chat interface. This allows for more natural language interaction where the LLM can proactively gather necessary information before executing actions.

**Core Goal:** Enable the LLM assistant to manage user tasks, subtasks, and scheduled messages/items through natural language conversation, acting as an agent that can proactively gather required information and interact with the database via predefined functions.

**Key Database Entities Involved:**

*   `tasks`: Main to-do items (title, description, status, due dates, recurrence, etc.).
*   `subtasks`: Child items linked to a `task`.
*   `schedule_items`: Time-blocked items within a `daily_schedule` (can be linked to tasks).
*   `message_schedules`: Specific messages to be sent at a scheduled time (e.g., reminders).

**LLM Interaction Workflow:**

1.  **Receive User Input:** The user sends a message in natural language (e.g., "add groceries to my shopping list task", "remind me to submit the report by Friday 5 PM").
2.  **Intent Recognition & Entity Extraction:** The LLM analyzes the input to determine the user's intent (e.g., `CREATE_TASK`, `UPDATE_TASK`) and extracts key entities (e.g., task title, due date).
3.  **Information Sufficiency Check:**
    *   The LLM determines if it has the minimum required information (defined by available backend functions) to proceed.
    *   **Contextual Lookup:** Before asking the user, the LLM may use `find*` functions to gather context (e.g., find the ID of an existing task to update) or check for duplicates.
4.  **Clarification Loop:**
    *   If information is missing or ambiguous (e.g., "Friday" needs a specific date), the LLM asks the user specific, targeted questions.
    *   It integrates the user's answers and re-evaluates information sufficiency.
5.  **Function Execution:**
    *   Once sufficient, unambiguous information is gathered, the LLM selects and formats arguments for the appropriate backend function (e.g., `createTask`, `scheduleMessage`).
    *   It executes the function call.
6.  **Response to User:**
    *   The LLM confirms success (e.g., "Okay, I've added 'New task'.") or reports failure based on the function's result.
    *   For queries, it presents the retrieved information.

**(Implementation Note:** This workflow relies on backend functions exposed to the LLM via a function-calling mechanism and a detailed system prompt outlining the process and function definitions.)
