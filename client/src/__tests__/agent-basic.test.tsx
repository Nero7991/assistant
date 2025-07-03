import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ActionBubble from '@/components/agent/ActionBubble';
import FileOperationNotification from '@/components/agent/FileOperationNotification';

const theme = createTheme();

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={theme}>
    {children}
  </ThemeProvider>
);

describe('Agent Components', () => {
  describe('ActionBubble', () => {
    it('renders tool execution with running status', () => {
      render(
        <TestWrapper>
          <ActionBubble
            actionType="read"
            toolName="ReadFile"
            status="running"
            goal="Read the configuration file"
            reason="Need to check current settings"
            toolExecutionId="test-123"
            startTime={new Date()}
          />
        </TestWrapper>
      );

      expect(screen.getByText('ReadFile')).toBeInTheDocument();
      expect(screen.getByText('Read the configuration file')).toBeInTheDocument();
      expect(screen.getByText('Need to check current settings')).toBeInTheDocument();
      expect(screen.getByText('RUNNING')).toBeInTheDocument();
    });

    it('renders tool execution with success status', () => {
      render(
        <TestWrapper>
          <ActionBubble
            actionType="modify"
            toolName="EditFile"
            status="success"
            goal="Update the configuration"
            reason="Apply new settings"
            toolExecutionId="test-456"
            startTime={new Date(Date.now() - 5000)}
            endTime={new Date()}
            output="File updated successfully"
          />
        </TestWrapper>
      );

      expect(screen.getByText('EditFile')).toBeInTheDocument();
      expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    });

    it('renders tool execution with failure status', () => {
      render(
        <TestWrapper>
          <ActionBubble
            actionType="delete"
            toolName="DeleteFile"
            status="failure"
            goal="Remove old file"
            reason="Clean up workspace"
            toolExecutionId="test-789"
            startTime={new Date(Date.now() - 3000)}
            endTime={new Date()}
            errorMessage="File not found"
          />
        </TestWrapper>
      );

      expect(screen.getByText('DeleteFile')).toBeInTheDocument();
      expect(screen.getByText('FAILURE')).toBeInTheDocument();
      expect(screen.getByText('File not found')).toBeInTheDocument();
    });
  });

  describe('FileOperationNotification', () => {
    it('renders file operation in progress', () => {
      render(
        <TestWrapper>
          <FileOperationNotification
            operationType="CREATE"
            filePath="/src/components/NewComponent.tsx"
            operationId="file-123"
            isComplete={false}
            timestamp={new Date()}
          />
        </TestWrapper>
      );

      expect(screen.getByText(/CREATE operation in progress/)).toBeInTheDocument();
      expect(screen.getByText(/NewComponent\.tsx/)).toBeInTheDocument();
    });

    it('renders completed file operation', () => {
      render(
        <TestWrapper>
          <FileOperationNotification
            operationType="MODIFY"
            filePath="/src/utils/helper.ts"
            operationId="file-456"
            isComplete={true}
            success={true}
            timestamp={new Date()}
            details="Added new utility function"
          />
        </TestWrapper>
      );

      expect(screen.getByText(/MODIFY operation completed successfully/)).toBeInTheDocument();
      expect(screen.getByText(/helper\.ts/)).toBeInTheDocument();
    });

    it('renders failed file operation', () => {
      render(
        <TestWrapper>
          <FileOperationNotification
            operationType="DELETE"
            filePath="/src/old/deprecated.js"
            operationId="file-789"
            isComplete={true}
            success={false}
            error="Permission denied"
            timestamp={new Date()}
          />
        </TestWrapper>
      );

      expect(screen.getByText(/DELETE operation failed/)).toBeInTheDocument();
      expect(screen.getByText(/deprecated\.js/)).toBeInTheDocument();
    });
  });
});