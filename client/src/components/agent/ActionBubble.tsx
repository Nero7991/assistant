import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Collapse,
  IconButton,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Alert,
  Divider
} from '@mui/material';
import {
  ExpandMore,
  CheckCircle,
  Error,
  Warning,
  HourglassEmpty,
  Code,
  Description,
  Folder,
  Terminal,
  Search,
  Chat,
  Build
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

// Props interface
interface ActionBubbleProps {
  actionType: string;
  toolName: string;
  goal?: string;
  reason?: string;
  status: 'running' | 'success' | 'failure' | 'warning';
  output?: any;
  errorMessage?: string;
  startTime?: Date;
  endTime?: Date;
  toolExecutionId: string;
}

// Styled components
const ExpandMoreIcon = styled((props: any) => {
  const { expand, ...other } = props;
  return <IconButton {...other} />;
})(({ theme, expand }) => ({
  transform: !expand ? 'rotate(0deg)' : 'rotate(180deg)',
  marginLeft: 'auto',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest,
  }),
}));

// Helper to get icon for tool
const getToolIcon = (toolName: string): React.ReactElement => {
  const toolNameLower = toolName.toLowerCase();
  
  if (toolNameLower.includes('read') || toolNameLower.includes('inspect')) {
    return <Description />;
  } else if (toolNameLower.includes('write') || toolNameLower.includes('modify') || toolNameLower.includes('create')) {
    return <Code />;
  } else if (toolNameLower.includes('delete')) {
    return <Error />;
  } else if (toolNameLower.includes('run') || toolNameLower.includes('execute')) {
    return <Terminal />;
  } else if (toolNameLower.includes('search') || toolNameLower.includes('find')) {
    return <Search />;
  } else if (toolNameLower.includes('chat') || toolNameLower.includes('message')) {
    return <Chat />;
  } else if (toolNameLower.includes('build') || toolNameLower.includes('compile')) {
    return <Build />;
  } else if (toolNameLower.includes('folder') || toolNameLower.includes('directory')) {
    return <Folder />;
  }
  
  return <Code />;
};

// Helper to get status icon
const getStatusIcon = (status: string): React.ReactElement => {
  switch (status) {
    case 'running':
      return <HourglassEmpty />;
    case 'success':
      return <CheckCircle />;
    case 'failure':
      return <Error />;
    case 'warning':
      return <Warning />;
    default:
      return <HourglassEmpty />;
  }
};

// Helper to get card styling based on status
const getCardStyling = (status: string) => {
  switch (status) {
    case 'running':
      return {
        borderColor: 'primary.main',
        bgcolor: 'primary.light',
        bgcolorDark: 'primary.dark'
      };
    case 'success':
      return {
        borderColor: 'success.main',
        bgcolor: 'success.light',
        bgcolorDark: 'success.dark'
      };
    case 'failure':
      return {
        borderColor: 'error.main',
        bgcolor: 'error.light',
        bgcolorDark: 'error.dark'
      };
    case 'warning':
      return {
        borderColor: 'warning.main',
        bgcolor: 'warning.light',
        bgcolorDark: 'warning.dark'
      };
    default:
      return {
        borderColor: 'grey.400',
        bgcolor: 'grey.100',
        bgcolorDark: 'grey.300'
      };
  }
};

// Helper to format execution time
const formatExecutionTime = (startTime?: Date, endTime?: Date): string => {
  if (!startTime) return '';
  
  const start = startTime.getTime();
  const end = endTime ? endTime.getTime() : Date.now();
  const duration = end - start;
  
  if (duration < 1000) {
    return `${duration}ms`;
  } else if (duration < 60000) {
    return `${(duration / 1000).toFixed(1)}s`;
  } else {
    return `${(duration / 60000).toFixed(1)}m`;
  }
};

// Helper to format output for display
const formatOutput = (output: any): string => {
  if (typeof output === 'string') {
    return output;
  } else if (output === null || output === undefined) {
    return '';
  } else {
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  }
};

const ActionBubble: React.FC<ActionBubbleProps> = ({
  actionType,
  toolName,
  goal,
  reason,
  status,
  output,
  errorMessage,
  startTime,
  endTime,
  toolExecutionId
}) => {
  const [expanded, setExpanded] = useState(false);
  const styling = getCardStyling(status);
  const hasOutput = output || errorMessage;
  const executionTime = formatExecutionTime(startTime, endTime);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  return (
    <Card
      sx={{
        mb: 2,
        border: 2,
        borderColor: styling.borderColor,
        borderRadius: 2,
        backgroundColor: 'background.paper',
        boxShadow: status === 'running' ? 3 : 1,
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: 3
        }
      }}
    >
      <CardHeader
        avatar={
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: styling.bgcolor,
              color: styling.bgcolorDark
            }}
          >
            {getToolIcon(toolName)}
          </Box>
        }
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={getStatusIcon(status)}
              label={status.toUpperCase()}
              size="small"
              color={status === 'running' ? 'primary' : status === 'success' ? 'success' : status === 'failure' ? 'error' : 'warning'}
              variant={status === 'running' ? 'filled' : 'outlined'}
            />
            {executionTime && (
              <Typography variant="caption" color="text.secondary">
                {executionTime}
              </Typography>
            )}
            {hasOutput && (
              <ExpandMoreIcon
                expand={expanded}
                onClick={handleExpandClick}
                aria-expanded={expanded}
                aria-label="show more"
              >
                <ExpandMore />
              </ExpandMoreIcon>
            )}
          </Box>
        }
        title={
          <Typography variant="subtitle1" fontWeight="bold">
            {toolName}
          </Typography>
        }
        subheader={
          <Typography variant="caption" color="text.secondary">
            ID: {toolExecutionId.substring(0, 8)}...
          </Typography>
        }
        sx={{ pb: 1 }}
      />
      
      {status === 'running' && (
        <LinearProgress
          variant="indeterminate"
          sx={{
            height: 2,
            bgcolor: 'grey.200',
            '& .MuiLinearProgress-bar': {
              bgcolor: styling.borderColor
            }
          }}
        />
      )}
      
      <CardContent sx={{ pt: 1, pb: 1 }}>
        {goal && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Goal:
            </Typography>
            <Typography variant="body2">
              {goal}
            </Typography>
          </Box>
        )}
        
        {reason && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Reason:
            </Typography>
            <Typography variant="body2">
              {reason}
            </Typography>
          </Box>
        )}
        
        {errorMessage && status === 'failure' && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {errorMessage}
          </Alert>
        )}
      </CardContent>
      
      {hasOutput && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Divider />
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Output:
            </Typography>
            <Box
              component="pre"
              sx={{
                backgroundColor: 'grey.100',
                p: 2,
                borderRadius: 1,
                overflow: 'auto',
                maxHeight: 400,
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                m: 0
              }}
            >
              {formatOutput(output || errorMessage)}
            </Box>
          </CardContent>
        </Collapse>
      )}
    </Card>
  );
};

export default ActionBubble;