
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Calendar, Clock, Bell, Check, ArrowRight, Plus } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link, useLocation } from "wouter";
import { Task as DbTask, Subtask } from "@shared/schema";
import DailyScheduleComponent from "@/components/daily-schedule-component";
import EnhancedReminderCard from "@/components/enhanced-reminder-card";

// Local Task interface for UI components
interface Task {
  id: number;
  title: string;
  description?: string;
}
import ReminderDialog from "@/components/reminder-dialog";

// Define interfaces for the API response
interface ScheduleData {
  pendingNotifications: PendingNotification[];
  scheduledTasks: DbTask[];
  scheduledSubtasks: Record<number, Subtask[]>;
  lastScheduleUpdate: MessageHistoryItem | null;
  dailySchedule?: DailySchedule;
  scheduleItems?: ScheduleItem[];
}

interface DailySchedule {
  id: number;
  userId: number;
  date: string;
  status: string;
  originalContent: string;
  formattedSchedule: any;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ScheduleItem {
  id: number;
  scheduleId: number;
  taskId: number | null;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  status: string;
  notificationSent: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

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

interface MessageHistoryItem {
  id: number;
  userId: number;
  content: string;
  type: string;
  status: string;
  createdAt: string;
  metadata?: any;
}

export default function SchedulePage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingReminder, setEditingReminder] = useState<PendingNotification | null>(null);

  // Fetch schedule data
  const { data, isLoading, error, refetch } = useQuery<ScheduleData>({
    queryKey: ['/api/schedule'],
    retry: 1
  });
  
  // Fetch reminders separately for better control
  const { data: reminders = [] } = useQuery<PendingNotification[]>({
    queryKey: ['/api/reminders'],
    retry: 1
  });
  
  // Effect to refresh data only when page is first visited
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Handle refresh button click
  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
    toast({
      title: "Schedule refreshed",
      description: "Your schedule has been updated with the latest information.",
    });
  };
  
  // API mutations for reminder operations
  const deleteReminderMutation = useMutation({
    mutationFn: async (reminderId: number) => {
      const response = await fetch(`/api/reminders/${reminderId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete reminder');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Reminder deleted", description: "The reminder has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete reminder.", variant: "destructive" });
    }
  });
  
  const snoozeReminderMutation = useMutation({
    mutationFn: async ({ reminderId, minutes }: { reminderId: number; minutes: number }) => {
      const response = await fetch(`/api/reminders/${reminderId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ minutes })
      });
      if (!response.ok) throw new Error('Failed to snooze reminder');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Reminder snoozed", description: data.message });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to snooze reminder.", variant: "destructive" });
    }
  });
  
  const duplicateReminderMutation = useMutation({
    mutationFn: async (reminderId: number) => {
      const response = await fetch(`/api/reminders/${reminderId}/duplicate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to duplicate reminder');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Reminder duplicated", description: "A copy of the reminder has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to duplicate reminder.", variant: "destructive" });
    }
  });
  
  // Handler functions for reminder operations
  const handleEditReminder = (reminder: PendingNotification) => {
    setEditingReminder(reminder);
  };
  
  const handleDeleteReminder = (reminderId: number) => {
    deleteReminderMutation.mutate(reminderId);
  };
  
  const handleSnoozeReminder = (reminderId: number, minutes: number) => {
    snoozeReminderMutation.mutate({ reminderId, minutes });
  };
  
  const handleDuplicateReminder = (reminder: PendingNotification) => {
    duplicateReminderMutation.mutate(reminder.id);
  };
  
  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setEditingReminder(null);
  };

  // Handle reschedule day button click  
  const handleRescheduleDay = async () => {
    setLocation("/chat");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] space-y-4 p-4">
        <div className="text-destructive text-xl font-semibold">Unable to load schedule</div>
        <p className="text-center max-w-md">
          There was an error loading your schedule. Please try refreshing the page.
        </p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  // Use empty defaults for data
  const { 
    pendingNotifications = [], 
    scheduledTasks = [], 
    scheduledSubtasks = {}, 
    lastScheduleUpdate = null,
    dailySchedule = null,
    scheduleItems = [] 
  } = data || {};
  
  // Use the separate reminders query data, fallback to schedule data
  const displayReminders = reminders.length > 0 ? reminders : pendingNotifications;
  
  // Check if we have a confirmed schedule
  const hasConfirmedSchedule = dailySchedule && dailySchedule.confirmedAt && scheduleItems && scheduleItems.length > 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Today's Schedule</h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleRefresh}>
            Refresh
          </Button>
          <Button onClick={handleRescheduleDay}>
            Reschedule Day
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Daily Schedule Display */}
          {hasConfirmedSchedule ? (
            <DailyScheduleComponent 
              dailySchedule={dailySchedule!} 
              scheduleItems={scheduleItems!}
              tasks={scheduledTasks}
            />
          ) : (
            <Card className="flex flex-col items-center text-center p-8 space-y-4">
              <Calendar className="h-12 w-12 text-muted-foreground" />
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">No schedule yet</h2>
                <p className="text-muted-foreground max-w-md">
                  You don't have any scheduled activities for today. Click "Reschedule Day" to create a new schedule
                  based on your tasks.
                </p>
              </div>
              <Button onClick={handleRescheduleDay} className="mt-4">
                Create Schedule
              </Button>
            </Card>
          )}
        </div>

        {/* Notifications section */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    Reminders
                    {displayReminders && displayReminders.length > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {displayReminders.length}
                      </Badge>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowAddDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                Scheduled reminders, check-ins, and follow-ups
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!displayReminders || displayReminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No reminders or check-ins scheduled</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setShowAddDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Reminder
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {displayReminders.map((notification: PendingNotification) => {
                      // Find the associated task if it exists
                      const foundTask = notification.metadata?.taskId ? 
                        scheduledTasks.find(t => t.id === notification.metadata?.taskId) : 
                        undefined;
                      
                      // Convert database task to UI Task type
                      const relatedTask: Task | undefined = foundTask ? {
                        id: foundTask.id,
                        title: foundTask.title,
                        description: foundTask.description ?? undefined
                      } : undefined;
                        
                      return (
                        <EnhancedReminderCard
                          key={notification.id}
                          notification={notification}
                          relatedTask={relatedTask}
                          onEdit={handleEditReminder}
                          onDelete={handleDeleteReminder}
                          onSnooze={handleSnoozeReminder}
                          onDuplicate={handleDuplicateReminder}
                        />
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Add/Edit Reminder Dialog */}
      <ReminderDialog
        isOpen={showAddDialog || editingReminder !== null}
        onClose={handleCloseDialog}
        reminder={editingReminder}
        mode={editingReminder ? 'edit' : 'add'}
      />
    </div>
  );
}