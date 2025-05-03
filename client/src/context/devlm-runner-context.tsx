import React, { createContext, useState, useRef, useEffect, useCallback, useContext, ReactNode } from 'react';

// Define the shape of the context state and actions
interface DevlmRunnerState {
  output: string[];
  isRunning: boolean;
  error: string | null;
  isConnected: boolean;
  startScript: (params: StartScriptParams) => Promise<void>;
  stopScript: () => void;
  sendStdin: (input: string) => void;
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
  const webSocketRef = useRef<WebSocket | null>(null);
  const currentRunParams = useRef<StartScriptParams | null>(null); // Store params for retries/reconnects
  const authToken = useRef<string | null>(null); // Store auth token
  constisAuthenticated = useRef<boolean>(false); // Track WS auth status

  // Function to add output lines, handling newlines
  const addOutput = useCallback((data: string) => {
    const lines = data.split(/\r?\n/).filter(line => line || line === '');
    setOutput(prev => [...prev, ...lines]);
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
                        // Consider setting isRunning false on script error?
                        // setIsRunning(false);
                        break;
                    case 'stdout':
                    case 'stderr':
                        addOutput(payload.data);
                        break;
                    case 'end':
                        addOutput(`[INFO] Script finished (Code: ${payload.exitCode !== undefined ? payload.exitCode : 'N/A'}).`);
                        setIsRunning(false);
                        // Don't close WS here, keep it open for next run
                        break;
                    default:
                        console.warn("[WS Context] Received unknown message type:", type);
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

  // Effect to ensure connection is established (optional, could connect on demand)
  // useEffect(() => {
  //   connectWebSocket(); 
  //   return () => {
  //     if (webSocketRef.current) {
  //       console.log("[WS Context] Closing WebSocket on provider unmount.");
  //       webSocketRef.current.close();
  //     }
  //   };
  // }, [connectWebSocket]);

  // Value provided by the context
  const value = {
    output,
    isRunning,
    error,
    isConnected,
    startScript,
    stopScript,
    sendStdin,
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