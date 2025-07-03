import React, { createContext, useState, useRef, useEffect, useCallback, useContext, ReactNode } from 'react';
import { 
  DevLMEvent, 
  DevLMEventPayloadMap, 
  DevLMEventType,
  extractGoalAndReason 
} from '@/types/devlm-events';

// Chat message interface
export interface ChatMessage {
  id: string;
  content: string;
  type: 'user' | 'assistant';
  timestamp: Date;
  parentMessageId?: string;
  isStreaming?: boolean;
}

// Define the shape of the context state and actions
interface DevlmRunnerState {
  output: string[];
  isRunning: boolean;
  error: string | null;
  isConnected: boolean;
  chatMessages: ChatMessage[];
  isTyping: boolean;
  currentSessionId: string | null;
  devlmEvents: DevLMEvent[]; // New: Store parsed DevLM events
  startScript: (params: StartScriptParams) => Promise<void>;
  stopScript: () => void;
  sendStdin: (input: string) => void;
  sendChatMessage: (message: string) => void;
  clearChat: () => void;
  sendInterrupt: () => void; // New: For user interruption
  sendApprovalResponse: (approvalId: string, approved: boolean, message?: string) => void; // New: For approval flow
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; // New: Expose chat message setter
}

export interface StartScriptParams {
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

// Create the context with a default undefined value initially
const DevlmRunnerContext = createContext<DevlmRunnerState | undefined>(undefined);

// Create the Provider component
interface DevlmRunnerProviderProps {
  children: ReactNode;
}

export const DevlmRunnerProvider: React.FC<DevlmRunnerProviderProps> = ({ children }) => {
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [devlmEvents, setDevlmEvents] = useState<DevLMEvent[]>([]); // New: Store DevLM events
  const webSocketRef = useRef<WebSocket | null>(null);
  const currentRunParams = useRef<StartScriptParams | null>(null); // Store params for retries/reconnects
  const authToken = useRef<string | null>(null); // Store auth token
  const isAuthenticated = useRef<boolean>(false); // Track WS auth status

  // Function to add output lines, handling newlines
  const addOutput = useCallback((data: string) => {
    const lines = data.split(/\r?\n/).filter(line => line || line === '');
    setOutput(prev => [...prev, ...lines]);
  }, []);

  // Function to add DevLM event
  const addDevLMEvent = useCallback((event: DevLMEvent) => {
    setDevlmEvents(prev => [...prev, event]);
  }, []);

  // Function to establish WebSocket connection
  const connectWebSocket = useCallback(async () => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      console.log("[WS Context] Already connected.");
      return; // Already connected
    }

    // Close existing connection if any (e.g., in CLOSING state)
    if (webSocketRef.current) {
        try {
            webSocketRef.current.close();
        } catch (e) { /* ignore */ }
    }
    
    setIsConnected(false);
    isAuthenticated.current = false;
    setError(null);
    addOutput('[INFO] Connecting to runner...');

    // Fetch auth token first
    try {
        const tokenResponse = await fetch('/api/devlm/ws-token', { method: 'POST' });
        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            throw new Error(errorData.message || `Failed to get auth token: ${tokenResponse.statusText}`);
        }
        const tokenData = await tokenResponse.json();
        authToken.current = tokenData.token;
        if (!authToken.current) {
            throw new Error('Auth token not received from server.');
        }
        addOutput('[INFO] Authentication token obtained.');
    } catch (err: any) {        
        console.error("[WS Context] Error fetching auth token:", err);
        setError(`Authentication setup failed: ${err.message}`);
        setIsRunning(false); // Stop running state if auth fails
        return;
    }

    // Proceed with WebSocket connection
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/devlm/ws`;
    console.log(`[WS Context] Connecting to WebSocket: ${wsUrl}`);

    try {
        const ws = new WebSocket(wsUrl);
        webSocketRef.current = ws;

        ws.onopen = () => {
            console.log("[WS Context] WebSocket connection opened.");
            setIsConnected(true);
            addOutput('[INFO] WebSocket connection established. Authenticating...');
            // Send auth message
            if (authToken.current) {
                ws.send(JSON.stringify({ type: 'auth', token: authToken.current }));
            } else {
                 console.error("[WS Context] Auth token missing when sending auth message.");
                 setError("Authentication failed: Token missing.");
                 ws.close();
            }
        };

        ws.onmessage = (event) => {
            try {
                const eventData = JSON.parse(event.data);
                const { type, payload } = eventData;

                // Handle DevLM events - check if this is a known DevLM event type
                const devlmEventTypes = [
                    'tool_execution_start', 'tool_execution_result', 
                    'file_operation_start', 'file_operation_complete',
                    'llm_request_start', 'llm_request_success', 'llm_request_error',
                    'system_log', 'process_start', 'process_end', 'phase_change',
                    'waiting_for_approval', 'approval_response_received',
                    'chat_response', 'chat_response_chunk', 'chat_error',
                    'llm_actions_available', 'llm_action_started', 'llm_action_progress',
                    'llm_action_completed', 'llm_action_failed'
                ];
                
                if (devlmEventTypes.includes(type)) {
                    const devlmEvent: DevLMEvent = {
                        type: type as DevLMEventType,
                        payload,
                        timestamp: new Date().toISOString(),
                        id: eventData.id || `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                    };
                    addDevLMEvent(devlmEvent);
                }

                switch (type) {
                    case 'auth_success':
                        console.log("[WS Context] WebSocket authenticated.");
                        isAuthenticated.current = true;
                        addOutput(`[INFO] ${payload.message}`);
                        // If we intended to run a script immediately after connecting, send run command
                        if (currentRunParams.current) {
                            console.log("[WS Context] Sending run command post-auth.");
                            sendRunCommand(currentRunParams.current);
                            currentRunParams.current = null; // Clear after sending
                        }
                        break;
                    case 'status':
                    case 'warning':
                        addOutput(`[${type.toUpperCase()}] ${payload.message}`);
                        break;
                    case 'error':
                        addOutput(`[ERROR] ${payload.message}`);
                        setError(payload.message);
                        break;
                    case 'stdout':
                    case 'stderr':
                        addOutput(payload.data);
                        break;
                    case 'end':
                        addOutput(`[INFO] Script finished (Code: ${payload.exitCode !== undefined ? payload.exitCode : 'N/A'}).`);
                        setIsRunning(false);
                        break;
                    
                    // DevLM Events - Enhanced handling
                    case 'process_start':
                        addOutput(`[PROCESS] Started: ${payload.taskDescription}`);
                        break;
                    case 'process_end':
                        addOutput(`[PROCESS] Ended: ${payload.status} - ${payload.message || 'No message'}`);
                        setIsRunning(false);
                        break;
                    case 'phase_change':
                        addOutput(`[PHASE] ${payload.phaseName}: ${payload.details || ''}`);
                        break;
                    case 'llm_request_start':
                        addOutput(`[LLM] Starting request to ${payload.model}: ${payload.promptSummary}`);
                        break;
                    case 'llm_request_success':
                        addOutput(`[LLM] Request completed: ${payload.responseSummary || 'Response received'}`);
                        // Extract and process actions if available
                        if (payload.actions && payload.actions.length > 0) {
                            payload.actions.forEach((action: any) => {
                                const { goal, reason } = extractGoalAndReason(action.explanation);
                                console.log(`[LLM Action] Type: ${action.actionType}, Goal: ${goal}, Reason: ${reason}`);
                            });
                        }
                        break;
                    case 'llm_request_error':
                        addOutput(`[LLM ERROR] ${payload.errorMessage}`);
                        setError(`LLM Error: ${payload.errorMessage}`);
                        break;
                    case 'tool_execution_start':
                        const { goal: startGoal, reason: startReason } = extractGoalAndReason(payload.explanation);
                        addOutput(`[TOOL] Starting: ${payload.toolName} - ${startGoal || payload.explanation || 'No details'}`);
                        break;
                    case 'tool_execution_result':
                        const status = payload.status.toUpperCase();
                        addOutput(`[TOOL ${status}] ${payload.toolName}: ${payload.resultSummary || 'Completed'}`);
                        if (payload.status === 'failure' && payload.errorMessage) {
                            setError(`Tool Error: ${payload.errorMessage}`);
                        }
                        break;
                    case 'file_operation_start':
                        addOutput(`[FILE] ${payload.operationType} operation starting on ${payload.filePath || payload.directoryPath}`);
                        break;
                    case 'file_operation_complete':
                        const fileStatus = payload.success ? 'SUCCESS' : 'FAILED';
                        addOutput(`[FILE ${fileStatus}] ${payload.operationType}: ${payload.details || (payload.error || 'Completed')}`);
                        if (!payload.success && payload.error) {
                            setError(`File Error: ${payload.error}`);
                        }
                        break;
                    case 'system_log':
                        const logLevel = payload.level.toUpperCase();
                        addOutput(`[${logLevel}] ${payload.message}`);
                        if (payload.level === 'error') {
                            setError(payload.message);
                        }
                        break;
                    case 'waiting_for_approval':
                        addOutput(`[APPROVAL REQUIRED] ${payload.actionDescription}`);
                        if (payload.proposedCommand) {
                            addOutput(`[APPROVAL] Command: ${payload.proposedCommand}`);
                        }
                        break;
                    case 'approval_response_received':
                        const approvalStatus = payload.approved ? 'APPROVED' : 'DENIED';
                        addOutput(`[APPROVAL ${approvalStatus}] ${payload.message || 'User response received'}`);
                        break;
                        
                    // Chat Events
                    case 'chat_response':
                        if (payload.streaming) {
                            setIsTyping(true);
                            const assistantMessage: ChatMessage = {
                                id: payload.messageId,
                                content: payload.message,
                                type: 'assistant',
                                timestamp: new Date(),
                                parentMessageId: payload.parentMessageId,
                                isStreaming: true
                            };
                            setChatMessages(prev => [...prev, assistantMessage]);
                        } else {
                            setIsTyping(false);
                            const assistantMessage: ChatMessage = {
                                id: payload.messageId,
                                content: payload.message,
                                type: 'assistant',
                                timestamp: new Date(),
                                parentMessageId: payload.parentMessageId,
                                isStreaming: false
                            };
                            setChatMessages(prev => [...prev, assistantMessage]);
                        }
                        break;
                        
                    case 'chat_response_chunk':
                        setIsTyping(!payload.done);
                        setChatMessages(prev => prev.map(msg => 
                            msg.id === payload.messageId 
                                ? { 
                                    ...msg, 
                                    content: msg.content + payload.chunk,
                                    isStreaming: !payload.done
                                }
                                : msg
                        ));
                        break;
                        
                    case 'chat_error':
                        setIsTyping(false);
                        setError(`Chat error: ${payload.error}`);
                        addOutput(`[CHAT ERROR] ${payload.error}`);
                        break;
                        
                    // LLM Action Events
                    case 'llm_actions_available':
                        addOutput(`[ACTIONS] ${payload.actions.length} actions available`);
                        break;
                        
                    case 'llm_action_started':
                        addOutput(`[ACTION STARTED] ${payload.actionId}`);
                        break;
                        
                    case 'llm_action_progress':
                        addOutput(`[ACTION PROGRESS] ${payload.actionId}: ${payload.progress}% - ${payload.message || ''}`);
                        break;
                        
                    case 'llm_action_completed':
                        addOutput(`[ACTION COMPLETED] ${payload.actionId}: ${payload.summary || 'Success'}`);
                        break;
                        
                    case 'llm_action_failed':
                        addOutput(`[ACTION FAILED] ${payload.actionId}: ${payload.error}`);
                        setError(`Action failed: ${payload.error}`);
                        break;
                        
                    case 'chat_request':
                        // Handle new chat request event
                        const chatQuestion = payload.question;
                        const chatMessage: ChatMessage = {
                            id: `chat-request-${payload.chatId}`,
                            content: chatQuestion,
                            type: 'assistant',
                            timestamp: new Date(),
                            isStreaming: false
                        };
                        setChatMessages((prev: ChatMessage[]) => [...prev, chatMessage]);
                        addOutput(`[CHAT REQUEST] ${chatQuestion}`);
                        break;
                        
                    case 'llm_response':
                        // Handle LLM response events - format nicely and filter out CoT
                        let content = payload.content || 'Response received';
                        
                        // Remove <cot> content
                        content = content.replace(/<cot>[\s\S]*?<\/cot>/g, '').trim();
                        
                        // Check if this is a CHAT action - if so, don't display as LLM response
                        if (content.includes('ACTION: CHAT:')) {
                            // Skip displaying CHAT actions as LLM responses since they'll appear as chat messages
                            return;
                        }
                        
                        // Format ACTION, GOAL, REASON nicely
                        const actionMatch = content.match(/ACTION:\s*(.*?)(?=\n|$)/);
                        const goalMatch = content.match(/GOAL:\s*(.*?)(?=\n|$)/);
                        const reasonMatch = content.match(/REASON:\s*(.*?)(?=\n|$)/);
                        
                        if (actionMatch || goalMatch || reasonMatch) {
                            let formattedContent = '';
                            if (actionMatch) formattedContent += `🎯 **Action:** ${actionMatch[1]}\n`;
                            if (goalMatch) formattedContent += `🎯 **Goal:** ${goalMatch[1]}\n`;
                            if (reasonMatch) formattedContent += `💭 **Reason:** ${reasonMatch[1]}`;
                            
                            addOutput(`[LLM ACTION]\n${formattedContent}`);
                        } else {
                            addOutput(`[LLM RESPONSE] ${content}`);
                        }
                        break;
                        
                    default:
                        console.warn("[WS Context] Received unknown message type:", type);
                        addOutput(`[UNKNOWN EVENT] ${type}: ${JSON.stringify(payload)}`);
                }
            } catch (parseError) {
                console.error("[WS Context] Failed to parse message data:", event.data, parseError);
                addOutput("[ERROR] Received malformed data from server.");
            }
        };

        ws.onerror = (error) => {
            console.error("[WS Context] WebSocket error:", error);
            setError(`WebSocket connection error.`);
            setIsConnected(false);
            setIsRunning(false); // Stop running if connection errors out
            isAuthenticated.current = false;
            webSocketRef.current = null;
        };

        ws.onclose = (event) => {
            console.log(`[WS Context] WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
            setIsConnected(false);
            isAuthenticated.current = false;
            if (!event.wasClean && isRunning) {
                setError("WebSocket connection closed unexpectedly.");
                setIsRunning(false); // Connection lost during run
            }
            webSocketRef.current = null;
        };
    } catch (error) {
        console.error("[WS Context] WebSocket constructor failed:", error);
        setError("Failed to establish WebSocket connection.");
        setIsRunning(false);
    }
  }, [addOutput]);

  // Function to send the run command
  const sendRunCommand = useCallback((params: StartScriptParams) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN && isAuthenticated.current) {
        console.log("[WS Context] Sending run command:", params.task);
        webSocketRef.current.send(JSON.stringify({ type: 'run', payload: params }));
        addOutput('[INFO] Running script...');
        setIsRunning(true); // Set running state when run is sent
        setError(null); // Clear previous errors
    } else {
        const errMsg = !isAuthenticated.current 
            ? "WebSocket not authenticated."
            : "WebSocket not open.";
        console.error(`[WS Context] Cannot send run command: ${errMsg}`);
        setError(`Connection issue: ${errMsg}`);
        setIsRunning(false);
    }
  }, [addOutput]);

  // Function exposed to start a script
  const startScript = useCallback(async (params: StartScriptParams) => {
    setOutput([]); // Clear output for new run
    setError(null);
    setIsRunning(true); // Set running immediately for UI feedback
    currentRunParams.current = params; // Store params
    
    // Generate new session ID for this run
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setCurrentSessionId(sessionId);

    // Connect if not connected, otherwise send run command directly
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
        addOutput('[INFO] WebSocket not connected. Establishing connection...');
        await connectWebSocket();
        // The run command will be sent by connectWebSocket after auth_success
    } else if (!isAuthenticated.current) {
        addOutput('[INFO] WebSocket connected but not authenticated. Re-authenticating...');
        await connectWebSocket(); // Will re-auth and send run
    } else {
        // Already connected and authenticated, just send run
        sendRunCommand(params);
    }
  }, [connectWebSocket, sendRunCommand]);

  // Function exposed to stop a script
  const stopScript = useCallback(() => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN && isAuthenticated.current) {
        console.log("[WS Context] Sending stop command.");
        webSocketRef.current.send(JSON.stringify({ type: 'stop' }));
        addOutput('[INFO] Stop request sent...');
        // Note: isRunning state is set to false when the 'end' message arrives
    } else {
        console.warn("[WS Context] Cannot send stop command: WebSocket not open or authenticated.");
    }
  }, [addOutput]);

  // Function exposed to send stdin
  const sendStdin = useCallback((input: string) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN && isAuthenticated.current) {
        if (!input) return;
        console.log(`[WS Context] Sending stdin data: ${input}`);
        webSocketRef.current.send(JSON.stringify({ type: 'stdin', payload: { data: input + '\n' } }));
        addOutput(`[SENT STDIN] ${input}`);
    } else {
         setError("Cannot send input: WebSocket not open or authenticated.");
    }
  }, [addOutput]);

  // Function to send chat message
  const sendChatMessage = useCallback((message: string) => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN || !isAuthenticated.current) {
        setError("Cannot send chat message: WebSocket not connected or authenticated.");
        return;
    }
    
    if (!message.trim()) return;
    
    // Generate unique message ID
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Add user message to chat history immediately for optimistic UI
    const userMessage: ChatMessage = {
        id: messageId,
        content: message,
        type: 'user',
        timestamp: new Date(),
        isStreaming: false
    };
    setChatMessages(prev => [...prev, userMessage]);
    
    // Send to server
    console.log(`[WS Context] Sending chat message: ${message}`);
    webSocketRef.current.send(JSON.stringify({
        type: 'chat_message',
        payload: {
            sessionId: currentSessionId,
            message,
            messageId,
        }
    }));
    
    // Set typing indicator
    setIsTyping(true);
  }, [currentSessionId]);

  // Function to clear chat history
  const clearChat = useCallback(() => {
    setChatMessages([]);
    setIsTyping(false);
    setDevlmEvents([]); // Also clear DevLM events
  }, []);

  // Function to send user interrupt
  const sendInterrupt = useCallback(() => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN && isAuthenticated.current) {
      console.log("[WS Context] Sending user interrupt.");
      webSocketRef.current.send(JSON.stringify({ 
        type: 'user_interrupt',
        payload: {
          message: 'User requested pause'
        }
      }));
      addOutput('[INFO] Interrupt request sent...');
    } else {
      setError("Cannot send interrupt: WebSocket not open or authenticated.");
    }
  }, [addOutput]);

  // Function to send approval response
  const sendApprovalResponse = useCallback((approvalId: string, approved: boolean, message?: string) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN && isAuthenticated.current) {
      console.log(`[WS Context] Sending approval response: ${approved ? 'approved' : 'rejected'}`);
      webSocketRef.current.send(JSON.stringify({ 
        type: 'approval_response',
        payload: {
          approvalId,
          approved,
          message
        }
      }));
      addOutput(`[INFO] Approval response sent: ${approved ? 'APPROVED' : 'REJECTED'}`);
    } else {
      setError("Cannot send approval response: WebSocket not open or authenticated.");
    }
  }, [addOutput]);

  // Effect to ensure connection is established when the component mounts
  useEffect(() => {
    connectWebSocket(); 
    return () => {
      if (webSocketRef.current) {
        console.log("[WS Context] Closing WebSocket on provider unmount.");
        webSocketRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // Value provided by the context
  const value = {
    output,
    isRunning,
    error,
    isConnected,
    chatMessages,
    isTyping,
    currentSessionId,
    devlmEvents, // New: Expose DevLM events
    startScript,
    stopScript,
    sendStdin,
    sendChatMessage,
    clearChat,
    sendInterrupt, // New: Expose interrupt function
    sendApprovalResponse, // New: Expose approval function
    setChatMessages, // New: Expose chat message setter
  };

  return (
    <DevlmRunnerContext.Provider value={value}>
      {children}
    </DevlmRunnerContext.Provider>
  );
};

// Custom hook to use the context
export const useDevlmRunner = (): DevlmRunnerState => {
  const context = useContext(DevlmRunnerContext);
  if (context === undefined) {
    throw new Error('useDevlmRunner must be used within a DevlmRunnerProvider');
  }
  return context;
}; 