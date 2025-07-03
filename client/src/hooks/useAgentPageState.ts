import { useState, useRef, useCallback, useEffect } from 'react';
import { UnifiedEvent } from '@/utils/eventProcessor';
import { ChatMessage } from '@/context/devlm-runner-context';
import { DevLMEvent } from '@/types/devlm-events';

// Comprehensive agent page state interface
export interface AgentPageState {
  // Execution state
  currentTask: string | null;
  isRunning: boolean;
  isPaused: boolean;
  currentPhase: string;
  
  // Event collections
  actionBubbles: ActionBubble[];
  chatMessages: ChatMessage[];
  systemLogs: SystemLog[];
  fileOperations: FileOperation[];
  unifiedEvents: UnifiedEvent[];
  
  // Interaction state
  awaitingApproval: ApprovalRequest | null;
  awaitingChatResponse: boolean;
  showApprovalDialog: boolean;
  
  // Process tracking
  runningProcesses: ProcessInfo[];
  llmRequests: LLMRequest[];
  
  // UI state
  selectedEvent: UnifiedEvent | null;
  showDetailDialog: boolean;
  eventFilter: EventFilter;
  
  // Performance tracking
  eventCount: number;
  errorCount: number;
  lastActivity: Date;
}

// Supporting interfaces
export interface ActionBubble {
  id: string;
  toolName: string;
  status: 'running' | 'success' | 'failure' | 'warning';
  goal?: string;
  reason?: string;
  startTime: Date;
  endTime?: Date;
  output?: any;
  errorMessage?: string;
}

export interface SystemLog {
  id: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  timestamp: Date;
  source?: string;
}

export interface FileOperation {
  id: string;
  operationType: 'READ' | 'MODIFY' | 'CREATE' | 'DELETE' | 'INSPECT';
  filePath: string;
  status: 'running' | 'success' | 'failure';
  diff?: string;
  startTime: Date;
  endTime?: Date;
}

export interface ApprovalRequest {
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

export interface ProcessInfo {
  id: string;
  description: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
}

export interface LLMRequest {
  id: string;
  model: string;
  promptSummary: string;
  status: 'pending' | 'success' | 'error';
  startTime: Date;
  endTime?: Date;
  tokenCount?: number;
}

export interface EventFilter {
  types: UnifiedEvent['type'][];
  showOnlyErrors: boolean;
  showOnlyApprovals: boolean;
  searchTerm: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

// State persistence interface
export interface AgentPageStateSnapshot {
  state: AgentPageState;
  timestamp: Date;
  version: string;
}

// Hook for managing agent page state
export const useAgentPageState = () => {
  // Core state
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('idle');
  
  // Event collections
  const [actionBubbles, setActionBubbles] = useState<ActionBubble[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [fileOperations, setFileOperations] = useState<FileOperation[]>([]);
  const [unifiedEvents, setUnifiedEvents] = useState<UnifiedEvent[]>([]);
  
  // Interaction state
  const [awaitingApproval, setAwaitingApproval] = useState<ApprovalRequest | null>(null);
  const [awaitingChatResponse, setAwaitingChatResponse] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  
  // Process tracking
  const [runningProcesses, setRunningProcesses] = useState<ProcessInfo[]>([]);
  const [llmRequests, setLLMRequests] = useState<LLMRequest[]>([]);
  
  // UI state
  const [selectedEvent, setSelectedEvent] = useState<UnifiedEvent | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>({
    types: [],
    showOnlyErrors: false,
    showOnlyApprovals: false,
    searchTerm: '',
  });
  
  // Performance tracking
  const [eventCount, setEventCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [lastActivity, setLastActivity] = useState(new Date());
  
  // Refs for optimization
  const stateSnapshot = useRef<AgentPageStateSnapshot | null>(null);
  
  // Computed state values
  const isRunning = runningProcesses.length > 0;
  const chatMessages: ChatMessage[] = []; // This would come from DevlmRunner context
  
  // Comprehensive state object
  const state: AgentPageState = {
    currentTask,
    isRunning,
    isPaused,
    currentPhase,
    actionBubbles,
    chatMessages,
    systemLogs,
    fileOperations,
    unifiedEvents,
    awaitingApproval,
    awaitingChatResponse,
    showApprovalDialog,
    runningProcesses,
    llmRequests,
    selectedEvent,
    showDetailDialog,
    eventFilter,
    eventCount,
    errorCount,
    lastActivity,
  };

  // Action creators
  const addActionBubble = useCallback((bubble: Omit<ActionBubble, 'id'>) => {
    const newBubble: ActionBubble = {
      ...bubble,
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    setActionBubbles(prev => [...prev, newBubble]);
    setLastActivity(new Date());
  }, []);

  const updateActionBubble = useCallback((id: string, updates: Partial<ActionBubble>) => {
    setActionBubbles(prev => prev.map(bubble => 
      bubble.id === id ? { ...bubble, ...updates } : bubble
    ));
    setLastActivity(new Date());
  }, []);

  const addSystemLog = useCallback((log: Omit<SystemLog, 'id'>) => {
    const newLog: SystemLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    setSystemLogs(prev => [...prev, newLog]);
    if (log.level === 'error') {
      setErrorCount(prev => prev + 1);
    }
    setLastActivity(new Date());
  }, []);

  const addFileOperation = useCallback((operation: Omit<FileOperation, 'id'>) => {
    const newOperation: FileOperation = {
      ...operation,
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    setFileOperations(prev => [...prev, newOperation]);
    setLastActivity(new Date());
  }, []);

  const updateFileOperation = useCallback((id: string, updates: Partial<FileOperation>) => {
    setFileOperations(prev => prev.map(op => 
      op.id === id ? { ...op, ...updates } : op
    ));
    setLastActivity(new Date());
  }, []);

  const addUnifiedEvent = useCallback((event: UnifiedEvent) => {
    setUnifiedEvents(prev => [...prev, event]);
    setEventCount(prev => prev + 1);
    setLastActivity(new Date());
  }, []);

  const addUnifiedEvents = useCallback((events: UnifiedEvent[]) => {
    setUnifiedEvents(prev => [...prev, ...events]);
    setEventCount(prev => prev + events.length);
    setLastActivity(new Date());
  }, []);

  const startProcess = useCallback((process: Omit<ProcessInfo, 'id' | 'status' | 'startTime'>) => {
    const newProcess: ProcessInfo = {
      ...process,
      id: `process-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'running',
      startTime: new Date(),
    };
    setRunningProcesses(prev => [...prev, newProcess]);
    setCurrentTask(process.description);
    setLastActivity(new Date());
  }, []);

  const endProcess = useCallback((id: string, status: 'completed' | 'failed') => {
    setRunningProcesses(prev => prev.map(process => 
      process.id === id 
        ? { ...process, status, endTime: new Date() }
        : process
    ).filter(process => process.status === 'running')); // Remove completed processes
    
    if (runningProcesses.length === 1) { // Last process ending
      setCurrentTask(null);
      setCurrentPhase('idle');
    }
    setLastActivity(new Date());
  }, [runningProcesses.length]);

  const addLLMRequest = useCallback((request: Omit<LLMRequest, 'id' | 'status' | 'startTime'>) => {
    const newRequest: LLMRequest = {
      ...request,
      id: `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      startTime: new Date(),
    };
    setLLMRequests(prev => [...prev, newRequest]);
    setLastActivity(new Date());
  }, []);

  const updateLLMRequest = useCallback((id: string, updates: Partial<LLMRequest>) => {
    setLLMRequests(prev => prev.map(request => 
      request.id === id ? { ...request, ...updates } : request
    ));
    setLastActivity(new Date());
  }, []);

  const setApprovalRequest = useCallback((request: ApprovalRequest | null) => {
    setAwaitingApproval(request);
    setShowApprovalDialog(!!request);
    setAwaitingChatResponse(!!request);
    setLastActivity(new Date());
  }, []);

  const clearApprovalRequest = useCallback(() => {
    setAwaitingApproval(null);
    setShowApprovalDialog(false);
    setAwaitingChatResponse(false);
    setLastActivity(new Date());
  }, []);

  const clearAllEvents = useCallback(() => {
    setUnifiedEvents([]);
    setActionBubbles([]);
    setSystemLogs([]);
    setFileOperations([]);
    setRunningProcesses([]);
    setLLMRequests([]);
    setEventCount(0);
    setErrorCount(0);
    setLastActivity(new Date());
  }, []);

  const pauseExecution = useCallback(() => {
    setIsPaused(true);
    setCurrentPhase('paused');
    setLastActivity(new Date());
  }, []);

  const resumeExecution = useCallback(() => {
    setIsPaused(false);
    setCurrentPhase('running');
    setLastActivity(new Date());
  }, []);

  // State persistence
  const saveStateSnapshot = useCallback(() => {
    const snapshot: AgentPageStateSnapshot = {
      state,
      timestamp: new Date(),
      version: '1.0.0',
    };
    stateSnapshot.current = snapshot;
    
    // Save to localStorage
    try {
      localStorage.setItem('agent-page-state', JSON.stringify(snapshot));
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error);
    }
  }, [state]);

  const loadStateSnapshot = useCallback(() => {
    try {
      const saved = localStorage.getItem('agent-page-state');
      if (saved) {
        const snapshot: AgentPageStateSnapshot = JSON.parse(saved);
        stateSnapshot.current = snapshot;
        
        // Restore state (selective restoration)
        setEventFilter(snapshot.state.eventFilter);
        setSelectedEvent(snapshot.state.selectedEvent);
        
        return snapshot;
      }
    } catch (error) {
      console.warn('Failed to load state from localStorage:', error);
    }
    return null;
  }, []);

  const exportState = useCallback(() => {
    const snapshot: AgentPageStateSnapshot = {
      state,
      timestamp: new Date(),
      version: '1.0.0',
    };
    
    const dataStr = JSON.stringify(snapshot, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-session-${new Date().toISOString().slice(0, 19)}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  }, [state]);

  const importState = useCallback((data: string) => {
    try {
      const snapshot: AgentPageStateSnapshot = JSON.parse(data);
      
      // Validate and restore state
      if (snapshot.state && snapshot.version) {
        setEventFilter(snapshot.state.eventFilter || {
          types: [],
          showOnlyErrors: false,
          showOnlyApprovals: false,
          searchTerm: '',
        });
        
        // Note: We don't restore runtime state like running processes
        // Only restore UI preferences and filters
        
        return true;
      }
    } catch (error) {
      console.error('Failed to import state:', error);
    }
    return false;
  }, []);

  // Auto-save effect
  useEffect(() => {
    const autoSave = setInterval(() => {
      saveStateSnapshot();
    }, 30000); // Auto-save every 30 seconds
    
    return () => clearInterval(autoSave);
  }, [saveStateSnapshot]);

  // Load initial state
  useEffect(() => {
    loadStateSnapshot();
  }, [loadStateSnapshot]);

  return {
    // State
    state,
    
    // Individual state pieces for direct access
    currentTask,
    isRunning,
    isPaused,
    currentPhase,
    actionBubbles,
    systemLogs,
    fileOperations,
    unifiedEvents,
    awaitingApproval,
    awaitingChatResponse,
    showApprovalDialog,
    runningProcesses,
    llmRequests,
    selectedEvent,
    showDetailDialog,
    eventFilter,
    eventCount,
    errorCount,
    lastActivity,
    
    // Actions
    addActionBubble,
    updateActionBubble,
    addSystemLog,
    addFileOperation,
    updateFileOperation,
    addUnifiedEvent,
    addUnifiedEvents,
    startProcess,
    endProcess,
    addLLMRequest,
    updateLLMRequest,
    setApprovalRequest,
    clearApprovalRequest,
    clearAllEvents,
    pauseExecution,
    resumeExecution,
    
    // UI actions
    setSelectedEvent,
    setShowDetailDialog,
    setEventFilter,
    
    // Persistence
    saveStateSnapshot,
    loadStateSnapshot,
    exportState,
    importState,
  };
};