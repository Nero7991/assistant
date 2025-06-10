import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

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
  userId: number;
}

interface ReminderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reminder?: PendingNotification | null;
  mode: 'add' | 'edit';
}

const reminderTypes = [
  { value: 'reminder', label: 'Main Reminder', description: 'Time for task' },
  { value: 'pre_reminder', label: 'Pre-Reminder', description: '15min warning' },
  { value: 'post_reminder_follow_up', label: 'Follow-up', description: 'How did it go?' },
  { value: 'follow_up', label: 'General Check-in', description: 'General follow-up' },
  { value: 'morning_message', label: 'Morning Message', description: 'Daily check-in' }
];

export default function ReminderDialog({ isOpen, onClose, reminder, mode }: ReminderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    type: 'reminder',
    scheduledFor: '',
    taskId: '',
    content: ''
  });
  
  // Fetch user's tasks for selection
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
    retry: 1
  });
  
  // Reset form when dialog opens/closes or reminder changes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && reminder) {
        // Format date for datetime-local input
        const scheduledDate = new Date(reminder.scheduledFor);
        const formattedDate = format(scheduledDate, "yyyy-MM-dd'T'HH:mm");
        
        setFormData({
          title: reminder.title || '',
          type: reminder.type,
          scheduledFor: formattedDate,
          taskId: reminder.metadata?.taskId?.toString() || '',
          content: reminder.content || ''
        });
      } else {
        // Default to 1 hour from now for new reminders
        const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
        const formattedDate = format(defaultDate, "yyyy-MM-dd'T'HH:mm");
        
        setFormData({
          title: '',
          type: 'reminder',
          scheduledFor: formattedDate,
          taskId: '',
          content: ''
        });
      }
    }
  }, [isOpen, mode, reminder]);
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create reminder');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Success", description: "Reminder created successfully" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create reminder",
        variant: "destructive" 
      });
    }
  });
  
  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/reminders/${reminder!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update reminder');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Success", description: "Reminder updated successfully" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update reminder",
        variant: "destructive" 
      });
    }
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.title.trim() || !formData.scheduledFor) {
      toast({
        title: "Validation Error",
        description: "Title and scheduled time are required",
        variant: "destructive"
      });
      return;
    }
    
    // Prepare submission data
    const submitData = {
      title: formData.title.trim(),
      type: formData.type,
      scheduledFor: new Date(formData.scheduledFor).toISOString(),
      content: formData.content.trim() || undefined,
      ...(formData.taskId ? { taskId: parseInt(formData.taskId) } : {})
    };
    
    if (mode === 'edit') {
      updateMutation.mutate(submitData);
    } else {
      createMutation.mutate(submitData);
    }
  };
  
  const isLoading = createMutation.isPending || updateMutation.isPending;
  
  // Get selected task for display
  const selectedTask = formData.taskId ? tasks.find(t => t.id === parseInt(formData.taskId)) : null;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Edit Reminder' : 'Add New Reminder'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit' 
              ? 'Update the reminder details below.'
              : 'Create a new reminder to help you stay on track with your tasks.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter reminder title..."
              required
            />
          </div>
          
          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Reminder Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reminderTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Scheduled Time */}
          <div className="space-y-2">
            <Label htmlFor="scheduledFor">Scheduled Time *</Label>
            <Input
              id="scheduledFor"
              type="datetime-local"
              value={formData.scheduledFor}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduledFor: e.target.value }))}
              required
            />
          </div>
          
          {/* Task Selection */}
          <div className="space-y-2">
            <Label htmlFor="taskId">Related Task (Optional)</Label>
            <Select
              value={formData.taskId}
              onValueChange={(value) => setFormData(prev => ({ ...prev, taskId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a task..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No task selected</SelectItem>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={task.id.toString()}>
                    <div className="flex flex-col">
                      <span>{task.title}</span>
                      {task.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {task.description}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Message Content (Optional)</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Additional message content..."
              rows={3}
            />
          </div>
          
          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : mode === 'edit' ? 'Update Reminder' : 'Create Reminder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}