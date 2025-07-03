import React, { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Typography,
  Box,
  TextField,
  Alert,
  AlertTitle,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper
} from '@mui/material';
import {
  ExpandMore,
  CheckCircle,
  Cancel,
  Warning,
  Terminal,
  InsertDriveFile,
  Edit,
  Add,
  DeleteForever,
  DifferenceOutlined
} from '@mui/icons-material';

// Props interface
interface ApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  onApprove: (message?: string) => void;
  onReject: (message?: string) => void;
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

// Helper to get operation icon
const getOperationIcon = (operation: string): React.ReactElement => {
  switch (operation.toLowerCase()) {
    case 'create':
    case 'add':
      return <Add color="success" />;
    case 'modify':
    case 'edit':
      return <Edit color="warning" />;
    case 'delete':
      return <DeleteForever color="error" />;
    default:
      return <InsertDriveFile />;
  }
};

// Helper to get operation color
const getOperationColor = (operation: string): 'success' | 'warning' | 'error' | 'info' => {
  switch (operation.toLowerCase()) {
    case 'create':
    case 'add':
      return 'success';
    case 'modify':
    case 'edit':
      return 'warning';
    case 'delete':
      return 'error';
    default:
      return 'info';
  }
};

const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  open,
  onClose,
  onApprove,
  onReject,
  approvalId,
  actionType,
  actionDescription,
  proposedCommand,
  proposedChanges
}) => {
  const [userMessage, setUserMessage] = useState('');
  const [showDiff, setShowDiff] = useState<string | null>(null);
  
  const handleApprove = () => {
    onApprove(userMessage.trim() || undefined);
    setUserMessage('');
    onClose();
  };
  
  const handleReject = () => {
    onReject(userMessage.trim() || undefined);
    setUserMessage('');
    onClose();
  };
  
  const handleCancel = () => {
    setUserMessage('');
    onClose();
  };
  
  const toggleDiff = (fileName: string) => {
    setShowDiff(showDiff === fileName ? null : fileName);
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      scroll="paper"
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="warning" />
          <Typography variant="h6">
            Approval Required
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Action Requires Your Approval</AlertTitle>
          The AI agent wants to perform an action that requires your permission.
        </Alert>
        
        {/* Action Description */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Action Type:
          </Typography>
          <Chip 
            label={actionType} 
            color="primary" 
            variant="outlined" 
            sx={{ mb: 2 }}
          />
          
          <Typography variant="subtitle1" gutterBottom>
            Description:
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {actionDescription}
          </Typography>
        </Box>
        
        {/* Proposed Command */}
        {proposedCommand && (
          <Accordion sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Terminal />
                <Typography variant="subtitle1">
                  Proposed Command
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Paper
                sx={{
                  p: 2,
                  backgroundColor: 'grey.900',
                  color: 'grey.100',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  borderRadius: 1,
                  overflow: 'auto'
                }}
              >
                {proposedCommand}
              </Paper>
            </AccordionDetails>
          </Accordion>
        )}
        
        {/* Proposed File Changes */}
        {proposedChanges && proposedChanges.length > 0 && (
          <Accordion sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InsertDriveFile />
                <Typography variant="subtitle1">
                  Proposed File Changes ({proposedChanges.length})
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <List disablePadding>
                {proposedChanges.map((change, index) => (
                  <React.Fragment key={index}>
                    <ListItem 
                      sx={{ 
                        px: 0,
                        flexDirection: 'column',
                        alignItems: 'stretch'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          {getOperationIcon(change.operation)}
                        </ListItemIcon>
                        <ListItemText
                          primary={change.file}
                          secondary={
                            <Chip 
                              label={change.operation.toUpperCase()} 
                              size="small"
                              color={getOperationColor(change.operation)}
                              variant="outlined"
                            />
                          }
                        />
                        {change.diff && (
                          <Button
                            size="small"
                            startIcon={<DifferenceOutlined />}
                            onClick={() => toggleDiff(change.file)}
                            variant="outlined"
                          >
                            {showDiff === change.file ? 'Hide' : 'Show'} Diff
                          </Button>
                        )}
                      </Box>
                      
                      {change.diff && showDiff === change.file && (
                        <Box sx={{ mt: 2, ml: 5 }}>
                          <Paper
                            sx={{
                              p: 2,
                              backgroundColor: 'grey.100',
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                              borderRadius: 1,
                              overflow: 'auto',
                              maxHeight: 300,
                              whiteSpace: 'pre-wrap',
                              '& .diff-added': {
                                backgroundColor: 'success.light',
                                color: 'success.contrastText'
                              },
                              '& .diff-removed': {
                                backgroundColor: 'error.light',
                                color: 'error.contrastText'
                              }
                            }}
                          >
                            {change.diff}
                          </Paper>
                        </Box>
                      )}
                    </ListItem>
                    {index < proposedChanges.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        )}
        
        {/* Optional Message */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Optional Message (for approval or rejection):
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            placeholder="Add any comments, modifications, or instructions..."
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            variant="outlined"
          />
        </Box>
        
        {/* Approval ID */}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          Approval ID: {approvalId}
        </Typography>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleCancel} color="inherit">
          Cancel
        </Button>
        <Button 
          onClick={handleReject} 
          color="error"
          variant="outlined"
          startIcon={<Cancel />}
        >
          Reject
        </Button>
        <Button 
          onClick={handleApprove} 
          color="success"
          variant="contained"
          startIcon={<CheckCircle />}
        >
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ApprovalDialog;