/**
 * Basic tests for Agent Page component without complex mocking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Create a minimal mock for the DevlmRunnerContext
const mockUseDevlmRunner = vi.fn();

vi.mock('@/context/devlm-runner-context', () => ({
  useDevlmRunner: () => mockUseDevlmRunner(),
  DevlmRunnerProvider: ({ children }: { children: React.ReactNode }) => children
}));

// Mock fetch for sessions
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import AgentPage from '@/pages/agent-page';

describe('AgentPage Basic Functionality', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    
    // Default mock return value
    mockUseDevlmRunner.mockReturnValue({
      output: [],
      isRunning: false,
      error: null,
      isConnected: true,
      startScript: vi.fn(),
      stopScript: vi.fn(),
      sendStdin: vi.fn(),
    });

    // Mock successful sessions fetch
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 1,
          sessionName: 'Test Session 1',
          taskDescription: 'Test task 1',
          mode: 'generate',
          model: 'claude',
          source: 'anthropic'
        }
      ])
    });
  });

  describe('Rendering', () => {
    it('should render the main page title', () => {
      render(<AgentPage />);
      
      expect(screen.getByText('🤖 Agent')).toBeInTheDocument();
    });

    it('should render the task input field', () => {
      render(<AgentPage />);
      
      expect(screen.getByPlaceholderText('Describe what you want the agent to do...')).toBeInTheDocument();
    });

    it('should render the Start Agent button', () => {
      render(<AgentPage />);
      
      expect(screen.getByText('Start Agent')).toBeInTheDocument();
    });

    it('should render the Activity Feed section', () => {
      render(<AgentPage />);
      
      expect(screen.getByText('Activity Feed')).toBeInTheDocument();
    });
  });

  describe('Status Display', () => {
    it('should show Ready status when not running', () => {
      render(<AgentPage />);
      
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('should show Running status when script is running', () => {
      mockUseDevlmRunner.mockReturnValue({
        output: [],
        isRunning: true,
        error: null,
        isConnected: true,
        startScript: vi.fn(),
        stopScript: vi.fn(),
        sendStdin: vi.fn(),
      });

      render(<AgentPage />);
      
      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('should show Disconnected status when not connected', () => {
      mockUseDevlmRunner.mockReturnValue({
        output: [],
        isRunning: false,
        error: null,
        isConnected: false,
        startScript: vi.fn(),
        stopScript: vi.fn(),
        sendStdin: vi.fn(),
      });

      render(<AgentPage />);
      
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });
  });

  describe('Task Input', () => {
    it('should update task value when user types', async () => {
      const user = userEvent.setup();
      render(<AgentPage />);

      const taskInput = screen.getByPlaceholderText('Describe what you want the agent to do...');
      await user.type(taskInput, 'Create a new component');

      expect(taskInput).toHaveValue('Create a new component');
    });

    it('should enable Start Agent button when task is entered', async () => {
      const user = userEvent.setup();
      render(<AgentPage />);

      const startButton = screen.getByText('Start Agent');
      expect(startButton).toBeDisabled();

      const taskInput = screen.getByPlaceholderText('Describe what you want the agent to do...');
      await user.type(taskInput, 'Test task');

      expect(startButton).toBeEnabled();
    });
  });

  describe('Button States', () => {
    it('should disable start button when running', () => {
      mockUseDevlmRunner.mockReturnValue({
        output: [],
        isRunning: true,
        error: null,
        isConnected: true,
        startScript: vi.fn(),
        stopScript: vi.fn(),
        sendStdin: vi.fn(),
      });

      render(<AgentPage />);
      
      const startButton = screen.getByText('Running...');
      expect(startButton).toBeDisabled();
    });

    it('should enable stop button when running', () => {
      mockUseDevlmRunner.mockReturnValue({
        output: [],
        isRunning: true,
        error: null,
        isConnected: true,
        startScript: vi.fn(),
        stopScript: vi.fn(),
        sendStdin: vi.fn(),
      });

      render(<AgentPage />);
      
      const stopButton = screen.getByText('Stop');
      expect(stopButton).toBeEnabled();
    });

    it('should disable stop button when not running', () => {
      render(<AgentPage />);
      
      const stopButton = screen.getByText('Stop');
      expect(stopButton).toBeDisabled();
    });
  });

  describe('Activity Feed', () => {
    it('should show empty message when no output', () => {
      render(<AgentPage />);
      
      expect(screen.getByText('No activity yet. Start an agent task to see real-time updates.')).toBeInTheDocument();
    });

    it('should display output lines when available', () => {
      mockUseDevlmRunner.mockReturnValue({
        output: [
          '[PROCESS] Started: Test task',
          '[LLM] Starting request to claude-3-5-sonnet',
          '[TOOL SUCCESS] execute_command: Command completed'
        ],
        isRunning: false,
        error: null,
        isConnected: true,
        startScript: vi.fn(),
        stopScript: vi.fn(),
        sendStdin: vi.fn(),
      });

      render(<AgentPage />);
      
      expect(screen.getByText('[PROCESS] Started: Test task')).toBeInTheDocument();
      expect(screen.getByText('[LLM] Starting request to claude-3-5-sonnet')).toBeInTheDocument();
      expect(screen.getByText('[TOOL SUCCESS] execute_command: Command completed')).toBeInTheDocument();
    });

    it('should display error message when present', () => {
      mockUseDevlmRunner.mockReturnValue({
        output: [],
        isRunning: false,
        error: 'Connection failed',
        isConnected: false,
        startScript: vi.fn(),
        stopScript: vi.fn(),
        sendStdin: vi.fn(),
      });

      render(<AgentPage />);
      
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });

  describe('Script Control', () => {
    it('should call startScript when Start Agent button is clicked', async () => {
      const mockStartScript = vi.fn();
      mockUseDevlmRunner.mockReturnValue({
        output: [],
        isRunning: false,
        error: null,
        isConnected: true,
        startScript: mockStartScript,
        stopScript: vi.fn(),
        sendStdin: vi.fn(),
      });

      const user = userEvent.setup();
      render(<AgentPage />);

      const taskInput = screen.getByPlaceholderText('Describe what you want the agent to do...');
      await user.type(taskInput, 'Test task');

      const startButton = screen.getByText('Start Agent');
      await user.click(startButton);

      expect(mockStartScript).toHaveBeenCalledWith(expect.objectContaining({
        task: 'Test task',
        mode: 'generate',
        model: 'claude',
        source: 'anthropic',
      }));
    });

    it('should call stopScript when Stop button is clicked', async () => {
      const mockStopScript = vi.fn();
      mockUseDevlmRunner.mockReturnValue({
        output: [],
        isRunning: true,
        error: null,
        isConnected: true,
        startScript: vi.fn(),
        stopScript: mockStopScript,
        sendStdin: vi.fn(),
      });

      const user = userEvent.setup();
      render(<AgentPage />);

      const stopButton = screen.getByText('Stop');
      await user.click(stopButton);

      expect(mockStopScript).toHaveBeenCalled();
    });
  });
});