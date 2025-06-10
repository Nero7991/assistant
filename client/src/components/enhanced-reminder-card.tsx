import React, { useState } from 'react';
import { 
  Bell, 
  Clock, 
  CheckSquare, 
  Edit, 
  Trash2, 
  Copy, 
  MoreHorizontal,
  Sunrise,
  MessageCircle,
  Calendar
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PendingNotification {
  id: number;
  userId: number;
  type: string;
  title?: string;
  content?: string;
  scheduledFor: string;
  sentAt?: string;
  status: string;
  metadata?: {
    taskId?: number;
    rescheduled?: boolean;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

interface Task {
  id: number;
  title: string;
  description?: string;
}

interface EnhancedReminderCardProps {
  notification: PendingNotification;
  relatedTask?: Task;
  onEdit: (notification: PendingNotification) => void;
  onDelete: (notificationId: number) => void;
  onSnooze: (notificationId: number, minutes: number) => void;
  onDuplicate: (notification: PendingNotification) => void;
}

// Helper function to get reminder type info
function getReminderTypeInfo(type: string, title?: string) {
  switch (type) {
    case 'pre_reminder':
      return {
        label: '15min warning',
        description: 'Pre-reminder'
      };
    case 'reminder':
      return {
        label: 'Main reminder',
        description: 'Task reminder'
      };
    case 'post_reminder_follow_up':
      return {
        label: 'Follow-up check',
        description: 'How did it go?'
      };
    case 'morning_message':
      return {
        label: 'Daily Check-in',
        description: 'Morning schedule'
      };
    case 'follow_up':
      return {
        label: 'Follow-up',
        description: 'General check-in'
      };
    default:
      return {
        label: 'Notification',
        description: 'General'
      };
  }
}

export default function EnhancedReminderCard({
  notification,
  relatedTask,
  onEdit,
  onDelete,
  onSnooze,
  onDuplicate
}: EnhancedReminderCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const typeInfo = getReminderTypeInfo(notification.type, notification.title);
  const timing = formatDistanceToNow(new Date(notification.scheduledFor), { addSuffix: true });
  const timeStr = format(new Date(notification.scheduledFor), "h:mm a");
  
  // Extract task title from reminder title or use related task
  const taskTitle = relatedTask?.title || 
    notification.title?.replace(/^(🔔|⏰|✅|🌅|💬)\s*(Upcoming in 15min:|Time for:|How did it go\?|Daily Check-in)\s*/, '') ||
    notification.title?.replace(/^(Pre-)?Reminder: |^Check-in: /, '') ||
    'Unknown Task';

  const handleSnooze = (minutes: number) => {
    onSnooze(notification.id, minutes);
  };

  const handleDelete = () => {
    onDelete(notification.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
        {/* Header with type badge and actions */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-medium">
              {typeInfo.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {typeInfo.description}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">{timing}</div>
              <div className="text-xs font-medium">{timeStr}</div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onEdit(notification)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Reminder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(notification)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleSnooze(15)}>
                  <Clock className="h-4 w-4 mr-2" />
                  Snooze 15 min
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSnooze(30)}>
                  <Clock className="h-4 w-4 mr-2" />
                  Snooze 30 min
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSnooze(60)}>
                  <Clock className="h-4 w-4 mr-2" />
                  Snooze 1 hour
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <div className="font-medium text-foreground">
            {taskTitle}
          </div>
          
          {relatedTask?.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {relatedTask.description}
            </p>
          )}
          
          {notification.content && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {notification.content}
            </p>
          )}
          
          {/* Metadata indicators */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {notification.metadata?.snoozed && (
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Snoozed
              </Badge>
            )}
            {notification.metadata?.duplicatedFrom && (
              <Badge variant="secondary" className="text-xs">
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Badge>
            )}
            {relatedTask && (
              <Badge variant="secondary" className="text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                Task #{relatedTask.id}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reminder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this reminder? This action cannot be undone.
              <div className="mt-2 p-2 bg-muted rounded text-sm">
                <strong>{typeInfo.label}:</strong> {taskTitle} at {timeStr}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}