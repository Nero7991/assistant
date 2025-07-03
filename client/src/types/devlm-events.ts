// DevLM Event Type Definitions
// These types match the events emitted by bootstrap.py in the DevLM system

export type DevLMEventType = 
  | 'tool_execution_start' 
  | 'tool_execution_result' 
  | 'file_operation_start' 
  | 'file_operation_complete' 
  | 'llm_request_start' 
  | 'llm_request_success' 
  | 'llm_request_error' 
  | 'system_log' 
  | 'process_start' 
  | 'process_end' 
  | 'phase_change' 
  | 'waiting_for_approval' 
  | 'approval_response_received'
  | 'chat_response'
  | 'chat_response_chunk'
  | 'chat_error'
  | 'llm_actions_available'
  | 'llm_action_started'
  | 'llm_action_progress'
  | 'llm_action_completed'
  | 'llm_action_failed'
  | 'chat_request'
  | 'chat_response_received'
  | 'user_interrupt_received';

// Base event structure
export interface DevLMEvent<T = any> {
  type: DevLMEventType;
  payload: T;
  timestamp: string;
  id?: string;
}

// Event-specific payload interfaces

export interface ToolExecutionStartPayload {
  toolExecutionId: string;
  toolName: string;
  toolArgs: Record<string, any>;
  explanation?: string;
}

export interface ToolExecutionResultPayload {
  toolExecutionId: string;
  toolName: string;
  status: 'success' | 'failure' | 'warning';
  resultSummary?: string;
  output?: any;
  errorMessage?: string;
}

export interface FileOperationStartPayload {
  operationType: 'READ' | 'MODIFY' | 'CREATE' | 'DELETE' | 'INSPECT';
  filePath?: string;
  directoryPath?: string;
  operationId: string;
}

export interface FileOperationCompletePayload {
  operationType: 'READ' | 'MODIFY' | 'CREATE' | 'DELETE' | 'INSPECT';
  filePath?: string;
  directoryPath?: string;
  operationId: string;
  success: boolean;
  details?: string;
  error?: string;
  diff?: string;
}

export interface LLMRequestStartPayload {
  requestId: string;
  model: string;
  promptSummary: string;
  tokenCount?: number;
}

export interface LLMRequestSuccessPayload {
  requestId: string;
  model: string;
  responseSummary?: string;
  tokenCount?: number;
  actions?: Array<{
    actionType: string;
    goal?: string;
    reason?: string;
    parameters?: Record<string, any>;
  }>;
}

export interface LLMRequestErrorPayload {
  requestId: string;
  model: string;
  errorMessage: string;
  errorType?: string;
}

export interface SystemLogPayload {
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  source?: string;
  details?: any;
}

export interface ProcessStartPayload {
  processId: string;
  taskDescription: string;
  mode?: string;
  model?: string;
}

export interface ProcessEndPayload {
  processId: string;
  status: 'success' | 'failure' | 'cancelled';
  message?: string;
  exitCode?: number;
}

export interface PhaseChangePayload {
  phaseId: string;
  phaseName: string;
  details?: string;
  previousPhase?: string;
}

export interface WaitingForApprovalPayload {
  approvalId: string;
  actionType: string;
  actionDescription: string;
  proposedCommand?: string;
  proposedChanges?: Array<{
    file: string;
    operation: string;
    diff?: string;
  }>;
}

export interface ApprovalResponseReceivedPayload {
  approvalId: string;
  approved: boolean;
  message?: string;
  userInput?: string;
}

export interface ChatResponsePayload {
  messageId: string;
  message: string;
  parentMessageId?: string;
  streaming: boolean;
  sessionId?: string;
}

export interface ChatResponseChunkPayload {
  messageId: string;
  chunk: string;
  done: boolean;
  sessionId?: string;
}

export interface ChatErrorPayload {
  error: string;
  messageId?: string;
  sessionId?: string;
}

export interface LLMActionsAvailablePayload {
  sessionId: string;
  actions: Array<{
    actionId: string;
    actionType: string;
    description: string;
    parameters?: Record<string, any>;
  }>;
}

export interface LLMActionStartedPayload {
  actionId: string;
  actionType: string;
  description: string;
  sessionId: string;
}

export interface LLMActionProgressPayload {
  actionId: string;
  progress: number;
  message?: string;
  sessionId: string;
}

export interface LLMActionCompletedPayload {
  actionId: string;
  summary?: string;
  result?: any;
  sessionId: string;
}

export interface LLMActionFailedPayload {
  actionId: string;
  error: string;
  sessionId: string;
}

export interface ChatRequestPayload {
  chatId: string;
  question: string;
  iteration?: number;
}

export interface ChatResponseReceivedPayload {
  chatId: string;
  response: string;
}

export interface UserInterruptReceivedPayload {
  message?: string;
}

// Type-safe event mapping
export interface DevLMEventPayloadMap {
  'tool_execution_start': ToolExecutionStartPayload;
  'tool_execution_result': ToolExecutionResultPayload;
  'file_operation_start': FileOperationStartPayload;
  'file_operation_complete': FileOperationCompletePayload;
  'llm_request_start': LLMRequestStartPayload;
  'llm_request_success': LLMRequestSuccessPayload;
  'llm_request_error': LLMRequestErrorPayload;
  'system_log': SystemLogPayload;
  'process_start': ProcessStartPayload;
  'process_end': ProcessEndPayload;
  'phase_change': PhaseChangePayload;
  'waiting_for_approval': WaitingForApprovalPayload;
  'approval_response_received': ApprovalResponseReceivedPayload;
  'chat_response': ChatResponsePayload;
  'chat_response_chunk': ChatResponseChunkPayload;
  'chat_error': ChatErrorPayload;
  'llm_actions_available': LLMActionsAvailablePayload;
  'llm_action_started': LLMActionStartedPayload;
  'llm_action_progress': LLMActionProgressPayload;
  'llm_action_completed': LLMActionCompletedPayload;
  'llm_action_failed': LLMActionFailedPayload;
  'chat_request': ChatRequestPayload;
  'chat_response_received': ChatResponseReceivedPayload;
  'user_interrupt_received': UserInterruptReceivedPayload;
}

// Type-safe event creator
export function createDevLMEvent<T extends DevLMEventType>(
  type: T,
  payload: DevLMEventPayloadMap[T],
  id?: string
): DevLMEvent<DevLMEventPayloadMap[T]> {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
    id: id || `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
}

// Helper to extract GOAL and REASON from LLM explanations
export function extractGoalAndReason(explanation?: string): { goal?: string; reason?: string } {
  if (!explanation) return {};
  
  const goalMatch = explanation.match(/GOAL:\s*([^\n]+)/i);
  const reasonMatch = explanation.match(/REASON:\s*([^\n]+)/i);
  
  return {
    goal: goalMatch?.[1]?.trim(),
    reason: reasonMatch?.[1]?.trim()
  };
}

// Action types commonly used in DevLM
export const DEVLM_ACTION_TYPES = {
  READ: 'READ',
  MODIFY: 'MODIFY',
  CREATE: 'CREATE',
  DELETE: 'DELETE',
  INSPECT: 'INSPECT',
  RUN: 'RUN',
  CHAT: 'CHAT',
  SEARCH: 'SEARCH',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT'
} as const;

export type DevLMActionType = typeof DEVLM_ACTION_TYPES[keyof typeof DEVLM_ACTION_TYPES];