import React, { useState, useEffect, useRef } from 'react';
import {
  Card, CardContent, Typography, TextField, Button, Box, 
  Accordion, AccordionSummary, AccordionDetails, FormControl, InputLabel, Select, MenuItem, 
  FormControlLabel, Switch, Grid, IconButton, Tooltip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// Assuming DevlmSession type is imported or defined elsewhere if needed strongly
type DevlmSession = { id: number; sessionName: string; [key: string]: any };

// Exclude API keys from the type used on the frontend for safety
type DevlmSessionFrontend = Omit<DevlmSession, 'anthropicApiKey' | 'openaiApiKey'> & { id: number; sessionName: string };

// ---> Create memoized input components to potentially help with focus issues
const MemoizedTextField = React.memo(TextField);
const MemoizedSelect = React.memo(Select);
const MemoizedSwitch = React.memo(Switch);
// <--- End memoized components

const View: React.FC = () => {
  // --- State for Inputs ---
  const [taskInput, setTaskInput] = useState('');
  const [mode, setMode] = useState('test');
  const [model, setModel] = useState('claude');
  const [source, setSource] = useState('kona');
  const [publisher, setPublisher] = useState('anthropic');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [region, setRegion] = useState('');
  const [serverUrl, setServerUrl] = useState('https://api.openai.com/v1');
  const [projectPath, setProjectPath] = useState('.');
  const [writeMode, setWriteMode] = useState('diff');
  const [debugPrompt, setDebugPrompt] = useState(false);
  const [noApproval, setNoApproval] = useState(false);
  const [frontend, setFrontend] = useState(false);
  const [stdinInput, setStdinInput] = useState('');

  // --- State for Runner ---
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // --- State for Sessions ---
  const [sessions, setSessions] = useState<DevlmSessionFrontend[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | number>('');
  const [newSessionName, setNewSessionName] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);

  // --- API Fetching --- 
  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/devlm/sessions');
      if (!response.ok) throw new Error(`Failed to fetch sessions: ${response.statusText}`);
      const data: DevlmSessionFrontend[] = await response.json();
      setSessions(data);
      setSessionError(null);
    } catch (err: any) {
      console.error("Error fetching sessions:", err);
      setSessionError(err.message || "Could not load sessions.");
    }
  };

  const saveSession = async () => {
    if (!newSessionName.trim()) {
      setSessionError("Please enter a name for the session.");
      return;
    }
    const sessionData = {
      sessionName: newSessionName,
      taskDescription: taskInput,
      mode,
      model,
      source,
      publisher: source === 'gcloud' ? publisher : undefined,
      anthropicApiKey: source === 'anthropic' && anthropicApiKey ? anthropicApiKey : undefined,
      openaiApiKey: source === 'openai' && openaiApiKey ? openaiApiKey : undefined,
      projectId: source === 'gcloud' ? projectId : undefined,
      region: source === 'gcloud' ? region : undefined,
      serverUrl: source === 'openai' ? serverUrl : undefined,
      projectPath,
      writeMode,
      debugPrompt,
      noApproval,
      frontend,
    };
    try {
      const response = await fetch('/api/devlm/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });
      if (!response.ok) throw new Error(`Failed to save session: ${response.statusText}`);
      setNewSessionName('');
      setAnthropicApiKey('');
      setOpenaiApiKey('');
      setSessionError(null);
      await fetchSessions();
    } catch (err: any) {
      console.error("Error saving session:", err);
      setSessionError(err.message || "Could not save session.");
    }
  };

  const deleteSession = async (sessionId: number) => {
    if (!window.confirm("Are you sure you want to delete this session?")) return;
    try {
      const response = await fetch(`/api/devlm/sessions/${sessionId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Failed to delete session: ${response.statusText}`);
      setSessionError(null);
      setSelectedSessionId('');
      await fetchSessions();
    } catch (err: any) {
      console.error("Error deleting session:", err);
      setSessionError(err.message || "Could not delete session.");
    }
  };

  // --- Effects --- 
  useEffect(() => {
    fetchSessions();

    return () => {
      if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
        console.log("Closing WebSocket connection on component unmount.");
        webSocketRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      const selectedSession = sessions.find(s => s.id === selectedSessionId);
      if (selectedSession) {
        setTaskInput(selectedSession.taskDescription || '');
        setMode(selectedSession.mode || 'generate');
        setModel(selectedSession.model || 'claude');
        setSource(selectedSession.source || 'anthropic');
        setPublisher(selectedSession.publisher || (selectedSession.source === 'gcloud' ? 'anthropic' : ''));
        setAnthropicApiKey('');
        setOpenaiApiKey('');
        setProjectId(selectedSession.projectId || '');
        setRegion(selectedSession.region || '');
        setServerUrl(selectedSession.serverUrl || 'https://api.openai.com/v1');
        setProjectPath(selectedSession.projectPath || '.');
        setWriteMode(selectedSession.writeMode || 'diff');
        setDebugPrompt(selectedSession.debugPrompt || false);
        setNoApproval(selectedSession.noApproval || false);
        setFrontend(selectedSession.frontend || false);
        setError(null);
      }
    } else {
        setPublisher('anthropic');
        setAnthropicApiKey('');
        setOpenaiApiKey('');
    }
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  // --- Event Handlers & Helpers ---
  const handleRunScript = async () => {
    if (!taskInput.trim() || isRunning) return;

    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.close();
    }

    setOutput([]);
    setError(null);
    setIsRunning(true);

    let authToken: string | null = null;
    let ws: WebSocket | null = null;
    try {
      setOutput(prev => [...prev, '[INFO] Requesting authentication token...']);
      const tokenResponse = await fetch('/api/devlm/ws-token', { method: 'POST' });
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(errorData.message || `Failed to get auth token: ${tokenResponse.statusText}`);
      }
      const tokenData = await tokenResponse.json();
      authToken = tokenData.token;
      if (!authToken) {
         throw new Error('Auth token not received from server.');
      }
      setOutput(prev => [...prev, '[INFO] Authentication token received.']);

      // ---> Initialize WebSocket Correctly <--- 
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/devlm/ws`; 

    console.log(`Connecting to WebSocket: ${wsUrl}`);
      ws = new WebSocket(wsUrl);
    webSocketRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connection opened.");
      setOutput(prev => [...prev, '[INFO] WebSocket connection established. Authenticating...']);
      
        // Send auth token
        ws?.send(JSON.stringify({ type: 'auth', token: authToken }));
    };

    ws.onmessage = (event) => {
      try {
        const eventData = JSON.parse(event.data);
        const { type, payload } = eventData;
        
        let newOutputLine = '';
        
        switch (type) {
          case 'auth_success':
            console.log("WebSocket authenticated by server.");
            setOutput(prev => [...prev, `[INFO] ${payload.message}`]);
              // Send the run command AFTER successful auth
            const runPayload = {
              task: taskInput,
              mode,
              model,
              source,
              publisher: source === 'gcloud' ? publisher : undefined,
              projectPath,
              writeMode,
              projectId: source === 'gcloud' ? projectId : undefined,
              region: source === 'gcloud' ? region : undefined,
              serverUrl: source === 'openai' ? serverUrl : undefined,
              debugPrompt,
              noApproval,
              frontend,
              sessionId: selectedSessionId || undefined,
            };
              console.log("[WS Send] Preparing to send run command.");
              if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
                  webSocketRef.current.send(JSON.stringify({ type: 'run', payload: runPayload }));
                  console.log("[WS Send] Sent run command successfully.");
            setOutput(prev => [...prev, '[INFO] Running script...']);
              } else {
                  console.error("WebSocket not open when trying to send run command after auth.");
                  setError("Connection issue: Cannot start script.");
                  setIsRunning(false);
              }
            return;
          case 'status':
          case 'warning':
            newOutputLine = `[${type.toUpperCase()}] ${payload.message}`;
            break;
          case 'error':
            newOutputLine = `[ERROR] ${payload.message}`;
            setError(payload.message);
            break;
          case 'stdout':
          case 'stderr':
            newOutputLine = payload.data;
            break;
          case 'end':
            newOutputLine = `[INFO] Script finished (Code: ${payload.exitCode !== undefined ? payload.exitCode : 'N/A'}).`;
            setIsRunning(false);
            if (webSocketRef.current) {
              webSocketRef.current.close();
              webSocketRef.current = null;
            }
            break;
          default:
            console.warn("Received unknown message type:", type);
            return;
        }
        
        const lines = newOutputLine.split(/\r?\n/).filter(line => line || line === '');
        setOutput((prevOutput) => [...prevOutput, ...lines]);

      } catch (parseError) {
        console.error("Failed to parse WebSocket message data:", event.data, parseError);
        setError("Received malformed data from server.");
        setIsRunning(false);
        if (webSocketRef.current) {
          webSocketRef.current.close(); 
          webSocketRef.current = null;
        }
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setError(`WebSocket connection error. Is the server running and configured correctly?`);
      setIsRunning(false);
      webSocketRef.current = null;
    };

    ws.onclose = (event) => {
      console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        if (!event.wasClean && isRunning) { 
            setError("WebSocket connection closed unexpectedly. Please try running again.");
      }
      webSocketRef.current = null;
    };

    } catch (err: any) {
      console.error("Error fetching auth token:", err);
      setError(`Authentication setup failed: ${err.message}`);
      setIsRunning(false);
    }
  };

  const handleStopScript = () => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
      console.warn("Cannot stop: WebSocket is not open.");
      return;
    }
    console.log("Sending stop command via WebSocket...");
    webSocketRef.current.send(JSON.stringify({ type: 'stop' }));
    setOutput((prev) => [...prev, '[INFO] Stop request sent...']);
  };

  const handleSendStdin = () => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
      setError("Cannot send input: WebSocket is not open.");
      return;
    }
    if (!stdinInput) {
      return; 
    }
    console.log(`Sending stdin data: ${stdinInput}`);
    webSocketRef.current.send(JSON.stringify({ type: 'stdin', payload: { data: stdinInput + '\n' } }));
    setOutput(prev => [...prev, `[SENT STDIN] ${stdinInput}`]);
    setStdinInput('');
  };

  // Fix for MUI Grid 'item' prop issue
  const GridItem = (props: any) => <Grid item {...props} />;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        DevLM Runner
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Manage Sessions</Typography>
          {sessionError && <Typography color="error" sx={{ mb: 1 }}>{sessionError}</Typography>}
          <Grid container spacing={2} alignItems="center">
            <GridItem xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="load-session-label">Load Session</InputLabel>
                <Select
                  labelId="load-session-label"
                  label="Load Session"
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value as string)}
                  disabled={isRunning}
                >
                  <MenuItem value=""><em>None (Use Current Settings)</em></MenuItem>
                  {sessions.map((session) => (
                    <MenuItem key={session.id} value={session.id}>
                      {session.sessionName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </GridItem>
            <GridItem xs={12} sm={6} sx={{ display: 'flex', gap: 1}}>
               <TextField
                 fullWidth
                 size="small"
                 label="New Session Name"
                 value={newSessionName}
                 onChange={(e) => setNewSessionName(e.target.value)}
                 disabled={isRunning}
               />
               <Tooltip title="Save Current Settings as New Session">
                 <span>
                   <Button
                    size="small"
                    variant="contained"
                    color="primary" 
                    onClick={saveSession} 
                    disabled={isRunning || !newSessionName.trim()}
                   >
                     Save
                   </Button>
                 </span>
               </Tooltip>
               <Tooltip title="Delete Selected Session">
                 <span>
                   <Button
                     size="small"
                     variant="outlined"
                     color="error" 
                     onClick={() => selectedSessionId && deleteSession(Number(selectedSessionId))}
                     disabled={isRunning || !selectedSessionId}
                   >
                     Delete
                   </Button>
                 </span>
               </Tooltip>
            </GridItem>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Task Description
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            variant="outlined"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder="Describe the task for DevLM (e.g., 'Refactor function X in file Y.py', 'Build the Docker image in the ./app folder')"
            disabled={isRunning}
          />
        </CardContent>
      </Card>

      <Accordion sx={{ mb: 3 }} disabled={isRunning}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Configuration</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <GridItem xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Mode</InputLabel>
                <MemoizedSelect label="Mode" value={mode} onChange={(e) => setMode(String(e.target.value))}>
                  <MenuItem value="generate">generate</MenuItem>
                  <MenuItem value="test">test</MenuItem>
                </MemoizedSelect>
              </FormControl>
            </GridItem>
            <GridItem xs={12} sm={4}>
               <MemoizedTextField fullWidth size="small" label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
            </GridItem>
            <GridItem xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Source</InputLabel>
                <MemoizedSelect label="Source" value={source} onChange={(e) => setSource(String(e.target.value))}>
                  <MenuItem value="anthropic">anthropic</MenuItem>
                  <MenuItem value="gcloud">gcloud</MenuItem>
                  <MenuItem value="openai">openai</MenuItem>
                </MemoizedSelect>
              </FormControl>
            </GridItem>
            {source === 'gcloud' && (
              <>
                <GridItem xs={12}>
                  <MemoizedTextField 
                    fullWidth 
                    size="small" 
                    label="Publisher (Vertex AI)" 
                    value={publisher}
                    onChange={(e) => setPublisher(e.target.value)}
                    helperText="Usually 'google' (for Gemini) or 'anthropic' (for Claude)"
                    select
                  >
                      <MenuItem value="anthropic">anthropic</MenuItem>
                      <MenuItem value="google">google</MenuItem>
                  </MemoizedTextField>
                </GridItem>
                <GridItem xs={12} sm={6}>
                  <MemoizedTextField fullWidth size="small" label="Project ID (GCloud)" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
                </GridItem>
                <GridItem xs={12} sm={6}>
                  <MemoizedTextField fullWidth size="small" label="Region (GCloud)" value={region} onChange={(e) => setRegion(e.target.value)} />
                </GridItem>
              </>
            )}
            {source === 'openai' && (
              <GridItem xs={12}>
                <MemoizedTextField fullWidth size="small" label="Server URL (OpenAI Base)" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
              </GridItem>
            )}
            <GridItem xs={12} sm={6}>
              <MemoizedTextField fullWidth size="small" label="Project Path" value={projectPath} onChange={(e) => setProjectPath(e.target.value)} />
            </GridItem>
            <GridItem xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Write Mode</InputLabel>
                <MemoizedSelect label="Write Mode" value={writeMode} onChange={(e) => setWriteMode(String(e.target.value))}>
                  <MenuItem value="diff">diff</MenuItem>
                  <MenuItem value="direct">direct</MenuItem>
                  <MenuItem value="git_patch">git_patch</MenuItem>
                </MemoizedSelect>
              </FormControl>
            </GridItem>
            <GridItem xs={12} sm={4}>
               <FormControlLabel control={<MemoizedSwitch checked={debugPrompt} onChange={(e) => setDebugPrompt(e.target.checked)} />} label="Debug Prompt" />
            </GridItem>
            <GridItem xs={12} sm={4}>
               <FormControlLabel control={<MemoizedSwitch checked={noApproval} onChange={(e) => setNoApproval(e.target.checked)} />} label="No Approval Needed" />
            </GridItem>
             <GridItem xs={12} sm={4}>
               <FormControlLabel control={<MemoizedSwitch checked={frontend} onChange={(e) => setFrontend(e.target.checked)} />} label="Frontend Testing" />
            </GridItem>
            {source === 'anthropic' && (
              <GridItem xs={12}>
                <MemoizedTextField 
                  fullWidth 
                  size="small" 
                  label="Anthropic API Key" 
                  type="password" 
                  value={anthropicApiKey} 
                  onChange={(e) => setAnthropicApiKey(e.target.value)} 
                  helperText="Leave blank to use environment variable"
                />
              </GridItem>
            )}
            {source === 'openai' && (
              <GridItem xs={12}>
                <MemoizedTextField 
                  fullWidth 
                  size="small" 
                  label="OpenAI API Key" 
                  type="password" 
                  value={openaiApiKey} 
                  onChange={(e) => setOpenaiApiKey(e.target.value)} 
                  helperText="Leave blank to use environment variable"
                />
              </GridItem>
            )}
          </Grid>
        </AccordionDetails>
      </Accordion>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleRunScript}
          disabled={isRunning || !taskInput.trim()}
        >
          {isRunning ? 'Running...' : 'Run DevLM Script'}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleStopScript}
          disabled={!isRunning}
        >
          Stop Script
        </Button>
      </Box>
      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error.startsWith('Runner Error:') ? error : `Status: ${error}`}
        </Typography>
      )}

      {(output.length > 0 || isRunning) && (
         <Card sx={{ mt: 3 }}>
           <CardContent>
             <Typography variant="h6" gutterBottom>
               Live Output
             </Typography>
             <Box
               sx={{
                 backgroundColor: 'grey.900',
                 color: 'grey.100',
                 p: 2,
                 borderRadius: 1,
                 height: '500px',
                 overflowY: 'auto',
                 fontFamily: 'monospace',
                 whiteSpace: 'pre-wrap', 
                 wordWrap: 'break-word', 
               }}
             >
               {output.map((line, index) => (
                 <div key={index}>{line || '\u00A0'}</div>
               ))}
               <div ref={outputEndRef} /> 
             </Box>
           </CardContent>
         </Card>
       )}

      {isRunning && ( 
         <Card sx={{ mt: 3 }}>
           <CardContent>
             <Typography variant="h6" gutterBottom>
               Send Input to Script (stdin)
             </Typography>
             <Box sx={{ display: 'flex', gap: 1 }}>
               <TextField 
                 fullWidth
                 size="small"
                 variant="outlined"
                 placeholder="Type input and press Send..."
                 value={stdinInput}
                 onChange={(e) => setStdinInput(e.target.value)}
                 onKeyPress={(e) => { if (e.key === 'Enter') handleSendStdin(); }}
                 disabled={!isRunning} 
               />
               <Button 
                 variant="contained" 
                 onClick={handleSendStdin}
                 disabled={!isRunning || !stdinInput.trim()} 
               >
                 Send
               </Button>
             </Box>
           </CardContent>
         </Card>
       )}
    </Box>
  );
};

export default View; 