
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Calendar, Clock, Bell, Check, ArrowRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link, useLocation } from "wouter";
import { Task, Subtask } from "@shared/schema";
import DailyScheduleComponent from "@/components/daily-schedule-component";

// Define interfaces for the API response
interface ScheduleData {
  pendingNotifications: PendingNotification[];
  scheduledTasks: Task[];
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

  // Fetch schedule data
  const { data, isLoading, error, refetch } = useQuery<ScheduleData>({
    queryKey: ['/api/schedule'],
    retry: 1
  });
  
  // Effect to refresh data only when page is first visited
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Handle refresh button click
  const handleRefresh = () => {
    refetch();
    toast({
      title: "Schedule refreshed",
      description: "Your schedule has been updated with the latest information.",
    });
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
                <div className="flex items-center">
                  Upcoming Check-ins
                  {pendingNotifications && pendingNotifications.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {pendingNotifications.length}
                    </Badge>
                  )}
                </div>
              </CardTitle>
              <CardDescription>
                Scheduled follow-ups and task reminders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!pendingNotifications || pendingNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No upcoming check-ins scheduled</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div>
                    {pendingNotifications.map((notification: PendingNotification) => {
                      // Find the associated task if it exists
                      const relatedTask = notification.metadata?.taskId ? 
                        scheduledTasks.find(t => t.id === notification.metadata?.taskId) : 
                        undefined;
                      
                      // Format timing info
                      const timing = formatDistanceToNow(new Date(notification.scheduledFor), { addSuffix: true });
                      const timeStr = format(new Date(notification.scheduledFor), "h:mm a");
                        
                      return (
                        <div key={notification.id} className="p-4 py-3 border-b last:border-b-0">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center">
                              <Bell className="h-4 w-4 mr-2 text-muted-foreground" />
                              <span className="font-medium">Check-in</span>
                            </div>
                            <div className="flex flex-col items-end text-right">
                              <span className="text-xs text-muted-foreground">
                                {timing}
                              </span>
                              <span className="text-xs mt-0.5">
                                {timeStr}
                              </span>
                            </div>
                          </div>
                          
                          <div className="text-sm text-muted-foreground">
                            {relatedTask ? (
                              <div>
                                {/* For related tasks */}
                                <div className="font-medium text-foreground">{relatedTask.title}</div>
                                {relatedTask.description && (
                                  <p className="text-sm mt-1 line-clamp-2">
                                    {relatedTask.description}
                                  </p>
                                )}
                                
                                {/* Show subtasks if available */}
                                {scheduledSubtasks && scheduledSubtasks[relatedTask.id!] && (
                                  <div className="mt-2">
                                    <ul className="pl-4 space-y-1">
                                      {scheduledSubtasks[relatedTask.id!]
                                        .filter(st => !st.completedAt)
                                        .slice(0, 3)
                                        .map(subtask => (
                                          <li key={subtask.id} className="list-disc">
                                            {subtask.title}
                                          </li>
                                        ))}
                                      {scheduledSubtasks[relatedTask.id!].filter(st => !st.completedAt).length > 3 && (
                                        <li>
                                          +{scheduledSubtasks[relatedTask.id!].filter(st => !st.completedAt).length - 3} more
                                        </li>
                                      )}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ) : (
                              // For general follow-ups
                              <div>
                                {notification.title ? (
                                  <div className="font-medium text-foreground">{notification.title}</div>
                                ) : (
                                  <div>
                                    {notification.type === 'morning_message' ? 
                                      'Daily morning schedule check-in' : 
                                      'General follow-up on your progress'}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}