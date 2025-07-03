import React, { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Typography,
  Paper
} from '@mui/material';
import {
  CheckCircle,
  Error,
  Warning,
  HourglassEmpty,
  ExpandMore,
  ExpandLess,
  InsertDriveFile,
  FolderOpen,
  Edit,
  DeleteForever,
  Add,
  Visibility,
  OpenInNew,
  DifferenceOutlined
} from '@mui/icons-material';

// Props interface
interface FileOperationNotificationProps {
  operationType: 'READ' | 'MODIFY' | 'CREATE' | 'DELETE' | 'INSPECT';
  filePath?: string;
  directoryPath?: string;
  operationId: string;
  success?: boolean;
  details?: string;
  error?: string;
  diff?: string;
  isComplete: boolean;
  timestamp: Date;
}

// Helper to get operation icon
const getOperationIcon = (operationType: string): React.ReactElement => {
  switch (operationType.toUpperCase()) {
    case 'READ':
      return <Visibility />;
    case 'MODIFY':
    case 'EDIT':
      return <Edit />;
    case 'CREATE':
    case 'ADD':
      return <Add />;
    case 'DELETE':
      return <DeleteForever />;
    case 'INSPECT':
      return <Visibility />;
    default:
      return <InsertDriveFile />;
  }
};

// Helper to get status icon
const getStatusIcon = (isComplete: boolean, success?: boolean): React.ReactElement => {
  if (!isComplete) {
    return <HourglassEmpty />;
  }
  if (success === false) {
    return <Error />;
  }
  return <CheckCircle />;
};

// Helper to get alert severity
const getAlertSeverity = (isComplete: boolean, success?: boolean): 'info' | 'success' | 'error' | 'warning' => {
  if (!isComplete) {
    return 'info';
  }
  if (success === false) {
    return 'error';
  }
  return 'success';
};

// Helper to get operation color
const getOperationColor = (operationType: string): 'primary' | 'success' | 'warning' | 'error' | 'info' => {
  switch (operationType.toUpperCase()) {
    case 'READ':
    case 'INSPECT':
      return 'info';
    case 'MODIFY':
    case 'EDIT':
      return 'warning';
    case 'CREATE':
    case 'ADD':
      return 'success';
    case 'DELETE':
      return 'error';
    default:
      return 'primary';
  }
};

// Helper to format file path
const formatFilePath = (filePath?: string, directoryPath?: string): string => {
  const path = filePath || directoryPath || 'Unknown file';
  const pathParts = path.split('/');
  const fileName = pathParts[pathParts.length - 1];
  const directory = pathParts.slice(0, -1).join('/');
  
  if (directory) {
    return `${directory}/${fileName}`;
  }
  return fileName;
};

// Helper to get file extension for icon
const getFileIcon = (filePath?: string, directoryPath?: string): React.ReactElement => {
  if (directoryPath) {
    return <FolderOpen />;
  }
  return <InsertDriveFile />;
};

const FileOperationNotification: React.FC<FileOperationNotificationProps> = ({
  operationType,
  filePath,
  directoryPath,
  operationId,
  success,
  details,
  error,
  diff,
  isComplete,
  timestamp
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  
  const fullPath = formatFilePath(filePath, directoryPath);
  const alertSeverity = getAlertSeverity(isComplete, success);
  const operationColor = getOperationColor(operationType);
  const hasDetails = details || error || diff;
  
  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };
  
  const handleShowDiff = () => {
    setShowDiffDialog(true);
  };
  
  const handleCloseDiff = () => {
    setShowDiffDialog(false);
  };
  
  const getStatusText = (): string => {
    if (!isComplete) {
      return `${operationType} operation in progress...`;
    }
    if (success === false) {
      return `${operationType} operation failed`;
    }
    return `${operationType} operation completed successfully`;
  };

  return (
    <>
      <Alert
        severity={alertSeverity}
        icon={getStatusIcon(isComplete, success)}
        sx={{
          mb: 1.5,
          '& .MuiAlert-message': {
            width: '100%'
          }
        }}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {timestamp.toLocaleTimeString()}
            </Typography>
            {hasDetails && (
              <IconButton
                size="small"
                onClick={handleToggleExpand}
                aria-label="toggle details"
              >
                {expanded ? <ExpandLess /> : <ExpandMore />}
              </IconButton>
            )}
          </Box>
        }
      >
        <AlertTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getFileIcon(filePath, directoryPath)}
            <Typography variant="subtitle1" component="span">
              {getStatusText()}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
            <Chip
              icon={getOperationIcon(operationType)}
              label={operationType}
              size="small"
              color={operationColor}
              variant="outlined"
            />
          </Box>
        </AlertTitle>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: hasDetails ? 1 : 0 }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {fullPath}
          </Typography>
          {diff && (
            <Button
              size="small"
              startIcon={<DifferenceOutlined />}
              onClick={handleShowDiff}
              variant="outlined"
            >
              View Diff
            </Button>
          )}
        </Box>
        
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Divider sx={{ my: 1 }} />
          
          {details && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Details:
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {details}
              </Typography>
            </Box>
          )}
          
          {error && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" color="error" gutterBottom>
                Error:
              </Typography>
              <Paper
                sx={{
                  p: 1,
                  bgcolor: 'error.light',
                  color: 'error.contrastText',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem'
                }}
              >
                {error}
              </Paper>
            </Box>
          )}
          
          <Typography variant="caption" color="text.secondary">
            Operation ID: {operationId.substring(0, 8)}...
          </Typography>
        </Collapse>
      </Alert>
      
      {/* Diff Dialog */}
      <Dialog
        open={showDiffDialog}
        onClose={handleCloseDiff}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle>
          File Diff: {fullPath}
        </DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{
              backgroundColor: 'grey.100',
              p: 2,
              borderRadius: 1,
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 500,
              '& .diff-added': {
                backgroundColor: 'success.light',
                color: 'success.contrastText'
              },
              '& .diff-removed': {
                backgroundColor: 'error.light',
                color: 'error.contrastText'
              },
              '& .diff-context': {
                color: 'text.secondary'
              }
            }}
          >
            {diff || 'No diff available'}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDiff}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default FileOperationNotification;