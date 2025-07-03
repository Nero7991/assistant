import { DevLMEvent, extractGoalAndReason } from '@/types/devlm-events';
import { ChatMessage } from '@/context/devlm-runner-context';

// Unified event interface for the agent page
export interface UnifiedEvent {
  id: string;
  type: 'chat-user' | 'chat-assistant' | 'system' | 'file' | 'error' | 'info' | 'task-start' | 'task-end' | 'llm-action' | 'terminal';
  content: string;
  timestamp: Date;
  metadata?: {
    [key: string]: any;
  };
}

// Event processor configuration
export interface EventProcessorConfig {
  maxEvents?: number;
  enableFiltering?: boolean;
  enableAggregation?: boolean;
  sortByTimestamp?: boolean;
}

// Event filter options
export interface EventFilter {
  types?: UnifiedEvent['type'][];
  timeRange?: {
    start: Date;
    end: Date;
  };
  searchTerm?: string;
  showOnlyErrors?: boolean;
  showOnlyApprovals?: boolean;
}

// Event aggregation result
export interface EventAggregation {
  totalEvents: number;
  eventsByType: Record<UnifiedEvent['type'], number>;
  errorCount: number;
  successfulActions: number;
  failedActions: number;
  approvalCount: number;
  timeSpan: {
    start: Date;
    end: Date;
  };
}

export class EventProcessor {
  private config: EventProcessorConfig;
  private eventHistory: UnifiedEvent[] = [];

  constructor(config: EventProcessorConfig = {}) {
    this.config = {
      maxEvents: 1000,
      enableFiltering: true,
      enableAggregation: true,
      sortByTimestamp: true,
      ...config
    };
  }

  /**
   * Convert DevLM events to unified events
   */
  processDevLMEvents(
    devlmEvents: DevLMEvent[],
    lastProcessedIndex: number,
    setChatMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void,
    setAwaitingInput: (awaiting: boolean) => void,
    setCurrentApprovalRequest: (request: any) => void
  ): UnifiedEvent[] {
    const newEvents: UnifiedEvent[] = [];

    for (let i = lastProcessedIndex; i < devlmEvents.length; i++) {
      const devlmEvent = devlmEvents[i];
      const timestamp = new Date(devlmEvent.timestamp);
      
      const unifiedEvents = this.convertDevLMEventToUnified(
        devlmEvent, 
        timestamp, 
        i,
        setChatMessages,
        setAwaitingInput,
        setCurrentApprovalRequest
      );
      
      newEvents.push(...unifiedEvents);
    }

    return newEvents;
  }

  /**
   * Convert a single DevLM event to unified events
   */
  private convertDevLMEventToUnified(
    devlmEvent: DevLMEvent,
    timestamp: Date,
    index: number,
    setChatMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void,
    setAwaitingInput: (awaiting: boolean) => void,
    setCurrentApprovalRequest: (request: any) => void
  ): UnifiedEvent[] {
    const events: UnifiedEvent[] = [];

    switch (devlmEvent.type) {
      case 'tool_execution_start':
        const { goal: startGoal, reason: startReason } = extractGoalAndReason(devlmEvent.payload.explanation);
        events.push({
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

      case 'file_operation_start':
        events.push({
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

      case 'phase_change':
        events.push({
          id: devlmEvent.id || `devlm-${index}-${timestamp.getTime()}`,
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
        events.push({
          id: devlmEvent.id || `devlm-${index}-${timestamp.getTime()}`,
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

      case 'system_log':
        // Handle CHAT actions
        if (devlmEvent.payload.message.includes('CHAT:')) {
          const chatContent = devlmEvent.payload.message.split('CHAT:')[1].trim();
          const assistantMessage: ChatMessage = {
            id: `chat-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            content: chatContent,
            type: 'assistant',
            timestamp: new Date(devlmEvent.timestamp),
            isStreaming: false
          };
          setChatMessages(prev => [...prev, assistantMessage]);
          
          events.push({
            id: devlmEvent.id || `devlm-${index}-${timestamp.getTime()}`,
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
          events.push({
            id: devlmEvent.id || `devlm-${index}-${timestamp.getTime()}`,
            type: 'error',
            content: devlmEvent.payload.message,
            timestamp,
            metadata: {
              source: devlmEvent.payload.source,
              details: devlmEvent.payload.details
            }
          });
        } else {
          events.push({
            id: devlmEvent.id || `devlm-${index}-${timestamp.getTime()}`,
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
        events.push({
          id: devlmEvent.id || `devlm-${index}-${timestamp.getTime()}`,
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
        events.push({
          id: devlmEvent.id || `devlm-${index}-${timestamp.getTime()}`,
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
    }

    return events;
  }

  /**
   * Process chat messages into unified events
   */
  processChatMessages(chatMessages: ChatMessage[], lastProcessedIndex: number): UnifiedEvent[] {
    const newEvents: UnifiedEvent[] = [];
    
    for (let i = lastProcessedIndex; i < chatMessages.length; i++) {
      const msg = chatMessages[i];
      newEvents.push({
        id: msg.id,
        type: msg.type === 'user' ? 'chat-user' : 'chat-assistant',
        content: msg.content,
        timestamp: msg.timestamp,
        metadata: {
          isStreaming: msg.isStreaming,
          parentMessageId: msg.parentMessageId
        }
      });
    }
    
    return newEvents;
  }

  /**
   * Process terminal output into unified events
   */
  processOutput(output: string[], lastProcessedIndex: number): UnifiedEvent[] {
    const newEvents: UnifiedEvent[] = [];
    
    for (let i = lastProcessedIndex; i < output.length; i++) {
      const line = output[i];
      const timestamp = new Date();
      
      // Skip empty lines
      if (!line.trim()) {
        continue;
      }
      
      let eventType: UnifiedEvent['type'] = 'terminal';
      let metadata: UnifiedEvent['metadata'] = {};
      
      // Parse different types of output
      if (line.includes('[FILE]') || line.includes('Writing to') || line.includes('Created file')) {
        eventType = 'file';
        metadata.filename = this.extractFilename(line);
        metadata.operation = this.extractOperation(line);
      } else if (line.includes('[ERROR]') || line.includes('Error:')) {
        eventType = 'error';
      } else if (line.includes('[INFO]') || line.includes('Starting') || line.includes('Completed')) {
        eventType = 'info';
      } else if (line.includes('[SYSTEM]') || line.includes('System:')) {
        eventType = 'system';
      } else if (line.includes('Task started:')) {
        eventType = 'task-start';
        metadata.taskId = line.match(/Task started: (.+)/)?.[1];
      } else if (line.includes('Task completed:')) {
        eventType = 'task-end';
        metadata.taskId = line.match(/Task completed: (.+)/)?.[1];
      } else if (line.includes('LLM Action:')) {
        eventType = 'llm-action';
        metadata.actionType = line.match(/LLM Action: (.+)/)?.[1];
      }
      
      newEvents.push({
        id: `output-${i}-${timestamp.getTime()}`,
        type: eventType,
        content: line,
        timestamp,
        metadata
      });
    }
    
    return newEvents;
  }

  /**
   * Filter events based on criteria
   */
  filterEvents(events: UnifiedEvent[], filter: EventFilter): UnifiedEvent[] {
    if (!this.config.enableFiltering) {
      return events;
    }

    return events.filter(event => {
      // Filter by type
      if (filter.types && !filter.types.includes(event.type)) {
        return false;
      }

      // Filter by time range
      if (filter.timeRange) {
        if (event.timestamp < filter.timeRange.start || event.timestamp > filter.timeRange.end) {
          return false;
        }
      }

      // Filter by search term
      if (filter.searchTerm) {
        const searchLower = filter.searchTerm.toLowerCase();
        if (!event.content.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Filter errors only
      if (filter.showOnlyErrors && event.type !== 'error') {
        return false;
      }

      // Filter approvals only
      if (filter.showOnlyApprovals && !event.metadata?.needsApproval) {
        return false;
      }

      return true;
    });
  }

  /**
   * Aggregate events for analytics
   */
  aggregateEvents(events: UnifiedEvent[]): EventAggregation {
    if (!this.config.enableAggregation) {
      return this.getEmptyAggregation();
    }

    const eventsByType: Record<UnifiedEvent['type'], number> = {
      'chat-user': 0,
      'chat-assistant': 0,
      'system': 0,
      'file': 0,
      'error': 0,
      'info': 0,
      'task-start': 0,
      'task-end': 0,
      'llm-action': 0,
      'terminal': 0
    };

    let errorCount = 0;
    let successfulActions = 0;
    let failedActions = 0;
    let approvalCount = 0;
    let start = new Date();
    let end = new Date(0);

    events.forEach(event => {
      eventsByType[event.type]++;
      
      if (event.type === 'error') {
        errorCount++;
      }
      
      if (event.type === 'llm-action') {
        if (event.metadata?.status === 'success') {
          successfulActions++;
        } else if (event.metadata?.status === 'failure') {
          failedActions++;
        }
      }
      
      if (event.metadata?.needsApproval) {
        approvalCount++;
      }
      
      if (event.timestamp < start) {
        start = event.timestamp;
      }
      if (event.timestamp > end) {
        end = event.timestamp;
      }
    });

    return {
      totalEvents: events.length,
      eventsByType,
      errorCount,
      successfulActions,
      failedActions,
      approvalCount,
      timeSpan: { start, end }
    };
  }

  /**
   * Sort events by timestamp if enabled
   */
  sortEvents(events: UnifiedEvent[]): UnifiedEvent[] {
    if (!this.config.sortByTimestamp) {
      return events;
    }

    return [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Maintain event history within limits
   */
  maintainEventHistory(events: UnifiedEvent[]): UnifiedEvent[] {
    this.eventHistory = [...this.eventHistory, ...events];
    
    if (this.config.maxEvents && this.eventHistory.length > this.config.maxEvents) {
      const excess = this.eventHistory.length - this.config.maxEvents;
      this.eventHistory = this.eventHistory.slice(excess);
    }
    
    return this.eventHistory;
  }

  /**
   * Get current event history
   */
  getEventHistory(): UnifiedEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearEventHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Export events for persistence
   */
  exportEvents(): string {
    return JSON.stringify({
      events: this.eventHistory,
      timestamp: new Date().toISOString(),
      config: this.config
    }, null, 2);
  }

  /**
   * Import events from persistence
   */
  importEvents(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      if (parsed.events && Array.isArray(parsed.events)) {
        this.eventHistory = parsed.events.map((event: any) => ({
          ...event,
          timestamp: new Date(event.timestamp)
        }));
        return true;
      }
    } catch (error) {
      console.error('Failed to import events:', error);
    }
    return false;
  }

  // Helper methods
  private extractFilename(line: string): string {
    const match = line.match(/(?:file |path |Writing to |Created file )([^\s]+)/i);
    return match ? match[1] : 'unknown';
  }
  
  private extractOperation(line: string): string {
    if (line.includes('CREATE') || line.includes('Created')) return 'create';
    if (line.includes('MODIFY') || line.includes('EDIT') || line.includes('Writing')) return 'modify';
    if (line.includes('DELETE')) return 'delete';
    return 'unknown';
  }

  private getEmptyAggregation(): EventAggregation {
    return {
      totalEvents: 0,
      eventsByType: {
        'chat-user': 0,
        'chat-assistant': 0,
        'system': 0,
        'file': 0,
        'error': 0,
        'info': 0,
        'task-start': 0,
        'task-end': 0,
        'llm-action': 0,
        'terminal': 0
      },
      errorCount: 0,
      successfulActions: 0,
      failedActions: 0,
      approvalCount: 0,
      timeSpan: {
        start: new Date(),
        end: new Date()
      }
    };
  }
}