import React, { useState, useEffect, useRef } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  TextField, 
  Button, 
  Box, 
  Chip, 
  IconButton, 
  Divider, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  Avatar,
  Paper,
  CircularProgress,
  Alert,
  AlertTitle
} from '@mui/material';
import { 
  Send, 
  Stop, 
  Person, 
  Computer, 
  Clear, 
  PlayArrow,
  Terminal,
  InsertDriveFile,
  Error as ErrorIcon,
  Info,
  CheckCircle,
  Warning,
  Code,
  Pause,
  PlayCircle
} from '@mui/icons-material';
import { useDevlmRunner, ChatMessage } from '@/context/devlm-runner-context';
import { DevLMEvent, extractGoalAndReason } from '@/types/devlm-events';
import ActionBubble from '@/components/agent/ActionBubble';
import FileOperationNotification from '@/components/agent/FileOperationNotification';
import ApprovalDialog from '@/components/agent/ApprovalDialog';
import { EventProcessor, UnifiedEvent as ProcessorUnifiedEvent } from '@/utils/eventProcessor';

// Use the UnifiedEvent type from EventProcessor
type UnifiedEvent = ProcessorUnifiedEvent;

const AgentPage: React.FC = () => {
  // DevLM Runner Context
  const { 
    output, 
    isRunning, 
    error, 
    isConnected, 
    chatMessages,
    isTyping,
    currentSessionId,
    devlmEvents, // New: Get DevLM events
    startScript, 
    stopScript,
    sendChatMessage,
    clearChat,
    sendInterrupt, // New: Interrupt function
    sendApprovalResponse, // New: Approval function
    setChatMessages // New: Chat message setter
  } = useDevlmRunner();

  // State
  const [message, setMessage] = useState('');
  const [unifiedEvents, setUnifiedEvents] = useState<UnifiedEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<UnifiedEvent | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [expandedInfoEvents, setExpandedInfoEvents] = useState<Set<string>>(new Set());
  const [currentApprovalRequest, setCurrentApprovalRequest] = useState<{
    approvalId: string;
    actionType: string;
    actionDescription: string;
    proposedCommand?: string;
    proposedChanges?: Array<{
      file: string;
      operation: string;
      diff?: string;
    }>;
  } | null>(null);
  // Remove manual mode toggle - mode is determined by state
  
  // Refs
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedOutputLength = useRef(0);
  const lastProcessedChatLength = useRef(0);
  const lastProcessedDevlmEventsLength = useRef(0);
  const eventProcessor = useRef(new EventProcessor({
    maxEvents: 1000,
    enableFiltering: true,
    enableAggregation: true,
    sortByTimestamp: true
  }));

  // Auto-scroll to bottom
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [unifiedEvents]);

  // Process chat messages into unified events using EventProcessor
  useEffect(() => {
    if (chatMessages.length > lastProcessedChatLength.current) {
      const newEvents = eventProcessor.current.processChatMessages(
        chatMessages,
        lastProcessedChatLength.current
      );
      
      setUnifiedEvents(prev => [...prev, ...newEvents]);
      lastProcessedChatLength.current = chatMessages.length;
    }
  }, [chatMessages]);

  // Process DevLM events into unified events
  useEffect(() => {
    if (devlmEvents.length > lastProcessedDevlmEventsLength.current) {
      const newEvents: UnifiedEvent[] = [];
      
      for (let i = lastProcessedDevlmEventsLength.current; i < devlmEvents.length; i++) {
        const devlmEvent = devlmEvents[i];
        const timestamp = new Date(devlmEvent.timestamp);
        
        // Convert DevLM events to unified events based on type
        switch (devlmEvent.type) {
          case 'tool_execution_start':
            const { goal: startGoal, reason: startReason } = extractGoalAndReason(devlmEvent.payload.explanation);
            newEvents.push({
              id: `tool-${devlmEvent.payload.toolExecutionId}`,
              type: 'llm-action',
              content: `Tool: ${devlmEvent.payload.toolName}${startGoal ? ` - Goal: ${startGoal}` : ''}${startReason ? ` - Reason: ${startReason}` : ''}`,
              timestamp,
              metadata: {
                actionType: devlmEvent.payload.toolName,
                status: 'running',
                goal: startGoal,
                reason: startReason,
                toolExecutionId: devlmEvent.payload.toolExecutionId,
                startTime: timestamp
              }
            });
            break;
            
          case 'tool_execution_result':
            // Update existing tool execution event
            setUnifiedEvents(prev => prev.map(event => {
              if (event.id === `tool-${devlmEvent.payload.toolExecutionId}`) {
                return {
                  ...event,
                  metadata: {
                    ...event.metadata,
                    status: devlmEvent.payload.status,
                    output: devlmEvent.payload.output || devlmEvent.payload.resultSummary,
                    errorMessage: devlmEvent.payload.errorMessage,
                    endTime: timestamp
                  }
                };
              }
              return event;
            }));
            break;
            
          case 'file_operation_start':
            newEvents.push({
              id: `file-${devlmEvent.payload.operationId}`,
              type: 'file',
              content: `${devlmEvent.payload.operationType} ${devlmEvent.payload.filePath || devlmEvent.payload.directoryPath || 'file'}`,
              timestamp,
              metadata: {
                operationType: devlmEvent.payload.operationType,
                filePath: devlmEvent.payload.filePath,
                directoryPath: devlmEvent.payload.directoryPath,
                operationId: devlmEvent.payload.operationId,
                isComplete: false,
                startTime: timestamp
              }
            });
            break;
            
          case 'file_operation_complete':
            // Update existing file operation event
            setUnifiedEvents(prev => prev.map(event => {
              if (event.id === `file-${devlmEvent.payload.operationId}`) {
                return {
                  ...event,
                  metadata: {
                    ...event.metadata,
                    isComplete: true,
                    success: devlmEvent.payload.success,
                    details: devlmEvent.payload.details,
                    error: devlmEvent.payload.error,
                    diff: devlmEvent.payload.diff,
                    endTime: timestamp
                  }
                };
              }
              return event;
            }));
            break;
            
          case 'phase_change':
            newEvents.push({
              id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
              type: 'system',
              content: `Phase: ${devlmEvent.payload.phaseName} - ${devlmEvent.payload.details || 'Phase changed'}`,
              timestamp,
              metadata: {
                phaseId: devlmEvent.payload.phaseId,
                phaseName: devlmEvent.payload.phaseName
              }
            });
            break;
            
          case 'waiting_for_approval':
            newEvents.push({
              id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
              type: 'system',
              content: `Approval Required: ${devlmEvent.payload.actionDescription}`,
              timestamp,
              metadata: {
                needsApproval: true,
                approvalId: devlmEvent.payload.approvalId,
                proposedCommand: devlmEvent.payload.proposedCommand,
                proposedChanges: devlmEvent.payload.proposedChanges
              }
            });
            setAwaitingInput(true);
            setCurrentApprovalRequest({
              approvalId: devlmEvent.payload.approvalId,
              actionType: devlmEvent.payload.actionType || 'Unknown Action',
              actionDescription: devlmEvent.payload.actionDescription,
              proposedCommand: devlmEvent.payload.proposedCommand,
              proposedChanges: devlmEvent.payload.proposedChanges
            });
            break;
            
          case 'approval_response_received':
            setAwaitingInput(false);
            setCurrentApprovalRequest(null);
            break;
            
          case 'system_log':
            // Check for CHAT actions in system_log messages
            if (devlmEvent.payload.message.includes('CHAT:')) {
              const chatContent = devlmEvent.payload.message.split('CHAT:')[1].trim();
              // Create a chat message event from CHAT action
              const assistantMessage: ChatMessage = {
                id: `chat-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                content: chatContent,
                type: 'assistant',
                timestamp: new Date(devlmEvent.timestamp),
                isStreaming: false
              };
              setChatMessages((prev: ChatMessage[]) => [...prev, assistantMessage]);
              
              // Also add to unified events
              newEvents.push({
                id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
                type: 'chat-assistant',
                content: chatContent,
                timestamp,
                metadata: {
                  fromChatAction: true,
                  awaitingResponse: true
                }
              });
              setAwaitingInput(true);
            } else if (devlmEvent.payload.level === 'error') {
              newEvents.push({
                id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
                type: 'error',
                content: devlmEvent.payload.message,
                timestamp,
                metadata: {
                  source: devlmEvent.payload.source,
                  details: devlmEvent.payload.details
                }
              });
            } else {
              // Add other system logs as system events
              newEvents.push({
                id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
                type: 'system',
                content: devlmEvent.payload.message,
                timestamp,
                metadata: {
                  level: devlmEvent.payload.level,
                  source: devlmEvent.payload.source,
                  details: devlmEvent.payload.details
                }
              });
            }
            break;
            
          case 'process_start':
            newEvents.push({
              id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
              type: 'task-start',
              content: `Task Started: ${devlmEvent.payload.taskDescription}`,
              timestamp,
              metadata: {
                processId: devlmEvent.payload.processId,
                taskDescription: devlmEvent.payload.taskDescription,
                mode: devlmEvent.payload.mode,
                model: devlmEvent.payload.model
              }
            });
            break;

          case 'process_end':
            newEvents.push({
              id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
              type: 'task-end',
              content: `Task ${devlmEvent.payload.status}: ${devlmEvent.payload.message || 'Completed'}`,
              timestamp,
              metadata: {
                processId: devlmEvent.payload.processId,
                status: devlmEvent.payload.status,
                exitCode: devlmEvent.payload.exitCode
              }
            });
            break;
            
          case 'chat_request':
            // Handle new chat request event
            const chatQuestion = devlmEvent.payload.question;
            const chatMessage: ChatMessage = {
              id: `chat-request-${devlmEvent.payload.chatId}`,
              content: chatQuestion,
              type: 'assistant',
              timestamp: new Date(devlmEvent.timestamp),
              isStreaming: false
            };
            setChatMessages((prev: ChatMessage[]) => [...prev, chatMessage]);
            
            newEvents.push({
              id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
              type: 'chat-assistant',
              content: chatQuestion,
              timestamp,
              metadata: {
                chatId: devlmEvent.payload.chatId,
                iteration: devlmEvent.payload.iteration,
                awaitingResponse: true
              }
            });
            setAwaitingInput(true);
            break;
            
          case 'chat_response_received':
            // Handle chat response acknowledgment
            newEvents.push({
              id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
              type: 'system',
              content: `Chat response received: ${devlmEvent.payload.response}`,
              timestamp,
              metadata: {
                chatId: devlmEvent.payload.chatId
              }
            });
            setAwaitingInput(false);
            break;
            
          case 'user_interrupt_received':
            // Handle user interrupt acknowledgment
            newEvents.push({
              id: devlmEvent.id || `devlm-${i}-${timestamp.getTime()}`,
              type: 'system',
              content: `User interrupt: ${devlmEvent.payload.message || 'User paused the agent'}`,
              timestamp,
              metadata: {
                interruptId: devlmEvent.payload.interruptId
              }
            });
            break;
        }
      }
      
      if (newEvents.length > 0) {
        setUnifiedEvents(prev => [...prev, ...newEvents]);
      }
      
      lastProcessedDevlmEventsLength.current = devlmEvents.length;
    }
  }, [devlmEvents]);

  // Process DevLM output into unified events using EventProcessor
  useEffect(() => {
    if (output.length > lastProcessedOutputLength.current) {
      const newEvents = eventProcessor.current.processOutput(
        output,
        lastProcessedOutputLength.current
      );
      
      setUnifiedEvents(prev => [...prev, ...newEvents]);
      lastProcessedOutputLength.current = output.length;
    }
  }, [output]);

  // Add typing indicator as an event
  useEffect(() => {
    if (isTyping) {
      const typingEvent: UnifiedEvent = {
        id: 'typing-indicator',
        type: 'system',
        content: 'AI is typing...',
        timestamp: new Date(),
        metadata: { isStreaming: true }
      };
      setUnifiedEvents(prev => [...prev.filter(e => e.id !== 'typing-indicator'), typingEvent]);
    } else {
      setUnifiedEvents(prev => prev.filter(e => e.id !== 'typing-indicator'));
    }
  }, [isTyping]);

  // Helper functions
  const formatTimestamp = (timestamp: Date): string => {
    return timestamp.toLocaleTimeString();
  };

  // Determine current input mode based on DevLM state
  const getCurrentInputMode = (): 'task' | 'chat' => {
    // If no session has been started yet, first message should start a task
    if (!currentSessionId && !isRunning) {
      return 'task';
    }
    // If a session exists or is running, we're in chat mode
    return 'chat';
  };

  const handleSend = async () => {
    if (!message.trim()) return;

    const currentMode = getCurrentInputMode();

    if (currentMode === 'chat') {
      sendChatMessage(message);
    } else {
      // Task mode - start a new DevLM task
      // Add task start event
      const taskStartEvent: UnifiedEvent = {
        id: `task-start-${Date.now()}`,
        type: 'task-start',
        content: `Starting DevLM task: ${message}`,
        timestamp: new Date(),
        metadata: { taskId: message }
      };
      setUnifiedEvents(prev => [...prev, taskStartEvent]);

      const params = {
        task: message,
        mode: 'test',
        model: 'claude',
        source: 'kona',
        projectPath: '.',
        writeMode: 'diff',
        debugPrompt: false,
        noApproval: true,
        frontend: false,
      };

      await startScript(params);
    }
    
    setMessage('');
  };

  const handleButtonClick = async () => {
    if (isPaused) {
      // Resume with message
      handlePauseResume();
      return;
    }
    
    if (awaitingInput) {
      // Send response to waiting approval or chat
      sendChatMessage(message);
      setMessage('');
      setAwaitingInput(false); // Clear awaiting input state
      return;
    }
    
    const currentMode = getCurrentInputMode();
    
    if (currentMode === 'task' && isRunning) {
      // Stop the running task
      stopScript();
    } else {
      // Send message (either chat or start task)
      await handleSend();
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleButtonClick();
    }
  };
  
  const handleEventClick = (event: UnifiedEvent) => {
    if (event.type === 'info') {
      // Toggle INFO event expansion
      setExpandedInfoEvents(prev => {
        const newSet = new Set(prev);
        if (newSet.has(event.id)) {
          newSet.delete(event.id);
        } else {
          newSet.add(event.id);
        }
        return newSet;
      });
    } else if (event.metadata?.filename || event.metadata?.diff) {
      setSelectedEvent(event);
      setShowDetailDialog(true);
    }
  };

  const handleClearAll = () => {
    setUnifiedEvents([]);
    setExpandedInfoEvents(new Set());
    lastProcessedOutputLength.current = 0;
    lastProcessedChatLength.current = 0;
    lastProcessedDevlmEventsLength.current = 0;
    clearChat();
  };

  const handlePauseResume = () => {
    if (isPaused) {
      setIsPaused(false);
      // If there's a message to send when resuming
      if (message.trim()) {
        sendChatMessage(message);
        setMessage('');
      }
    } else {
      setIsPaused(true);
      sendInterrupt();
    }
  };

  const handleApproval = (approved: boolean, message?: string) => {
    if (currentApprovalRequest) {
      sendApprovalResponse(currentApprovalRequest.approvalId, approved, message);
      setCurrentApprovalRequest(null);
      setAwaitingInput(false);
    }
  };

  const handleApprove = (message?: string) => {
    handleApproval(true, message);
  };

  const handleReject = (message?: string) => {
    handleApproval(false, message);
  };

  const handleCloseApprovalDialog = () => {
    setCurrentApprovalRequest(null);
  };

  const getInputPlaceholder = (): string => {
    if (isPaused) {
      return "Agent is paused. Provide guidance or instructions, then click Resume...";
    }
    if (awaitingInput) {
      return "Agent is waiting for your input or approval...";
    }
    
    const currentMode = getCurrentInputMode();
    if (currentMode === 'task') {
      return "Describe what you want to build or fix (e.g., 'Add a login form to the app', 'Fix the bug in user registration')...";
    } else {
      return "Chat with the AI assistant...";
    }
  };

  const getButtonText = (): string => {
    if (isPaused) {
      return 'Resume';
    }
    if (awaitingInput) {
      return 'Send Response';
    }
    
    const currentMode = getCurrentInputMode();
    if (currentMode === 'task') {
      return isRunning ? 'Stop' : 'Start Task';
    } else {
      return 'Send';
    }
  };

  const getButtonIcon = () => {
    if (isPaused) {
      return <PlayCircle />;
    }
    if (awaitingInput) {
      return <Send />;
    }
    
    const currentMode = getCurrentInputMode();
    if (currentMode === 'task') {
      return isRunning ? <Stop /> : <PlayArrow />;
    } else {
      return <Send />;
    }
  };

  const getButtonColor = (): 'primary' | 'error' => {
    const currentMode = getCurrentInputMode();
    return (currentMode === 'task' && isRunning) ? 'error' : 'primary';
  };

  const isButtonDisabled = (): boolean => {
    const currentMode = getCurrentInputMode();
    
    if (!isConnected) return true;
    
    if (currentMode === 'task') {
      return (!message.trim() && !isRunning);
    } else {
      return (!message.trim() || isTyping);
    }
  };

  const getStatusColor = () => {
    if (!isConnected) return 'error';
    if (isRunning) return 'warning';
    return 'success';
  };

  const getStatusText = () => {
    if (!isConnected) return 'Disconnected';
    if (isRunning) return 'Running';
    return 'Ready';
  };

  // Render a single event in the unified timeline
  const renderEvent = (event: UnifiedEvent) => {
    const { type, content, timestamp, metadata } = event;
    
    // Choose styling based on event type
    let icon = <Info />;
    let bgcolor = 'grey.100';
    let borderColor = 'grey.300';
    let textColor = 'text.primary';
    let fontFamily = 'inherit';
    
    switch (type) {
      case 'chat-user':
        return (
          <Box
            key={event.id}
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              mb: 2,
              alignItems: 'flex-start'
            }}
          >
            <Paper
              sx={{
                p: 2,
                maxWidth: '70%',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                borderRadius: 2,
              }}
            >
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {content}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7, textAlign: 'right' }}>
                {formatTimestamp(timestamp)}
              </Typography>
            </Paper>
            <Avatar sx={{ bgcolor: 'secondary.main', ml: 1, mt: 0.5 }}>
              <Person />
            </Avatar>
          </Box>
        );
        
      case 'chat-assistant':
        return (
          <Box
            key={event.id}
            sx={{
              display: 'flex',
              justifyContent: 'flex-start',
              mb: 2,
              alignItems: 'flex-start'
            }}
          >
            <Avatar sx={{ bgcolor: 'primary.main', mr: 1, mt: 0.5 }}>
              <Computer />
            </Avatar>
            <Paper
              sx={{
                p: 2,
                maxWidth: '70%',
                bgcolor: 'grey.100',
                color: 'text.primary',
                borderRadius: 2,
              }}
            >
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {content}
                {metadata?.isStreaming && (
                  <Box component="span" sx={{ ml: 1 }}>
                    <CircularProgress size={12} />
                  </Box>
                )}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7, textAlign: 'right' }}>
                {formatTimestamp(timestamp)}
              </Typography>
            </Paper>
          </Box>
        );
        
      case 'file':
        // Render FileOperationNotification component for file operations
        return (
          <Box key={event.id} sx={{ mb: 1.5 }}>
            <FileOperationNotification
              operationType={metadata?.operationType || 'READ'}
              filePath={metadata?.filePath}
              directoryPath={metadata?.directoryPath}
              operationId={metadata?.operationId || event.id}
              success={metadata?.success}
              details={metadata?.details}
              error={metadata?.error}
              diff={metadata?.diff}
              isComplete={metadata?.isComplete || false}
              timestamp={timestamp}
            />
          </Box>
        );
        
      case 'error':
        icon = <ErrorIcon />;
        bgcolor = 'error.light';
        borderColor = 'error.main';
        textColor = 'error.contrastText';
        break;
        
      case 'task-start':
        icon = <PlayArrow />;
        bgcolor = 'info.light';
        borderColor = 'info.main';
        break;
        
      case 'task-end':
        icon = <CheckCircle />;
        bgcolor = 'success.light';
        borderColor = 'success.main';
        break;
        
      case 'llm-action':
        // Render ActionBubble component for tool executions
        return (
          <Box key={event.id} sx={{ mb: 1.5 }}>
            <ActionBubble
              actionType={metadata?.actionType || 'unknown'}
              toolName={metadata?.actionType || 'Unknown Tool'}
              goal={metadata?.goal}
              reason={metadata?.reason}
              status={metadata?.status || 'running'}
              output={metadata?.output}
              errorMessage={metadata?.errorMessage}
              toolExecutionId={metadata?.toolExecutionId || event.id}
              startTime={metadata?.startTime || timestamp}
              endTime={metadata?.endTime}
            />
          </Box>
        );
        
      case 'terminal':
        icon = <Terminal />;
        bgcolor = 'grey.900';
        borderColor = 'grey.700';
        textColor = 'grey.100';
        fontFamily = 'monospace';
        break;
        
      case 'system':
        icon = <Info />;
        bgcolor = metadata?.isStreaming ? 'primary.light' : 'grey.200';
        borderColor = metadata?.isStreaming ? 'primary.main' : 'grey.400';
        break;
        
      case 'info':
        icon = <Info />;
        bgcolor = 'info.light';
        borderColor = 'info.main';
        break;
    }
    
    // For non-chat events, use a consistent card layout
    if (type === 'system' || type === 'error' || type === 'info' || 
        type === 'task-start' || type === 'task-end' || type === 'terminal') {
      return (
        <Box key={event.id} sx={{ mb: 1.5 }}>
          <Paper
            sx={{
              p: 1.5,
              backgroundColor: bgcolor,
              color: textColor,
              border: 1,
              borderColor: borderColor,
              borderRadius: 1,
              cursor: metadata?.filename || type === 'info' ? 'pointer' : 'default',
              '&:hover': metadata?.filename || type === 'info' ? { 
                backgroundColor: bgcolor,
                filter: 'brightness(0.95)'
              } : {}
            }}
            onClick={() => handleEventClick(event)}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Box sx={{ mt: 0.5 }}>{icon}</Box>
              <Box sx={{ flex: 1 }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    whiteSpace: 'pre-wrap',
                    fontFamily: fontFamily,
                    wordBreak: 'break-word'
                  }}
                >
                  {type === 'info' && !expandedInfoEvents.has(event.id) 
                    ? content.length > 50 
                      ? `${content.substring(0, 50)}...` 
                      : content
                    : content}
                </Typography>
                {type === 'info' && content.length > 50 && (
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      display: 'block', 
                      mt: 0.5, 
                      opacity: 0.7,
                      fontStyle: 'italic'
                    }}
                  >
                    {expandedInfoEvents.has(event.id) ? 'Click to collapse' : 'Click to expand'}
                  </Typography>
                )}
                {metadata?.filename && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
                    File: {metadata.filename} ({metadata.operation})
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" sx={{ flexShrink: 0, opacity: 0.7 }}>
                {formatTimestamp(timestamp)}
              </Typography>
            </Box>
          </Paper>
        </Box>
      );
    }
    
    return null;
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', p: 2, gap: 2 }}>
      {/* Header */}
      <Card>
        <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
          <Box>
            <Typography variant="h5" component="h1">
              DevLM AI Agent
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Unified view of all agent activities and conversations
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Chip 
              label={getStatusText()} 
              color={getStatusColor()} 
              variant="outlined"
            />
            {currentSessionId && (
              <Typography variant="caption" color="text.secondary">
                Session: {currentSessionId.substring(0, 8)}...
              </Typography>
            )}
            {(isRunning || isPaused) && (
              <IconButton 
                onClick={handlePauseResume}
                color={isPaused ? "success" : "warning"}
                title={isPaused ? "Resume" : "Pause"}
              >
                {isPaused ? <PlayCircle /> : <Pause />}
              </IconButton>
            )}
            <IconButton 
              onClick={handleClearAll} 
              disabled={unifiedEvents.length === 0}
              title="Clear All"
            >
              <Clear />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      {/* Main Content - Unified Timeline */}
      <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Box 
          sx={{ 
            flex: 1, 
            overflow: 'auto', 
            p: 2,
            backgroundColor: 'grey.50',
          }}
        >
          {unifiedEvents.length === 0 ? (
            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <Typography color="text.secondary" gutterBottom>
                No activity yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Start a conversation or run a DevLM task to see all events here
              </Typography>
            </Box>
          ) : (
            <>
              {unifiedEvents.map(renderEvent)}
            </>
          )}
          <div ref={scrollEndRef} />
        </Box>
        
        {/* Input Area */}
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'grey.200' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            {/* Input Field */}
            <TextField
              fullWidth
              multiline
              maxRows={4}
              placeholder={getInputPlaceholder()}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!isConnected}
              sx={{ flex: 1 }}
            />
            
            {/* Action Button */}
            <Button
              variant="contained"
              color={getButtonColor()}
              endIcon={getButtonIcon()}
              onClick={handleButtonClick}
              disabled={isButtonDisabled()}
              sx={{ minWidth: 120 }}
            >
              {getButtonText()}
            </Button>
          </Box>
          
          {/* Mode indicator */}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {isPaused 
              ? 'Agent paused - provide guidance and click Resume to continue'
              : awaitingInput
                ? 'Agent is waiting for your response or approval'
                : getCurrentInputMode() === 'task' 
                  ? (currentSessionId ? 'Task session active - continue or start new task' : 'Enter your first task to begin')
                  : 'Chat mode - ask questions or provide feedback'
            }
          </Typography>
        </Box>
      </Card>

      {/* Detail Dialog */}
      <Dialog 
        open={showDetailDialog} 
        onClose={() => setShowDetailDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Event Details: {selectedEvent?.metadata?.filename || selectedEvent?.type}
        </DialogTitle>
        <DialogContent>
          {selectedEvent && (
            <>
              <Typography variant="body2" gutterBottom>
                Type: {selectedEvent.type}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Time: {selectedEvent.timestamp.toLocaleString()}
              </Typography>
              {selectedEvent.metadata?.operation && (
                <Typography variant="body2" gutterBottom>
                  Operation: {selectedEvent.metadata.operation}
                </Typography>
              )}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Content:</Typography>
                <Box 
                  component="pre" 
                  sx={{ 
                    backgroundColor: 'grey.100', 
                    p: 2, 
                    borderRadius: 1, 
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem'
                  }}
                >
                  {selectedEvent.content}
                </Box>
              </Box>
              {selectedEvent.metadata?.diff && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Diff:</Typography>
                  <Box 
                    component="pre" 
                    sx={{ 
                      backgroundColor: 'grey.100', 
                      p: 2, 
                      borderRadius: 1, 
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem'
                    }}
                  >
                    {selectedEvent.metadata.diff}
                  </Box>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDetailDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Approval Dialog */}
      {currentApprovalRequest && (
        <ApprovalDialog
          open={!!currentApprovalRequest}
          onClose={handleCloseApprovalDialog}
          onApprove={handleApprove}
          onReject={handleReject}
          approvalId={currentApprovalRequest.approvalId}
          actionType={currentApprovalRequest.actionType}
          actionDescription={currentApprovalRequest.actionDescription}
          proposedCommand={currentApprovalRequest.proposedCommand}
          proposedChanges={currentApprovalRequest.proposedChanges}
        />
      )}
    </Box>
  );
};

export default AgentPage;