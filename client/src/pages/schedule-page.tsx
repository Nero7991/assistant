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
  messageType: string;
  scheduledFor: string;
  status: string;
  context?: {
    taskId?: number;
    rescheduled?: boolean;
    [key: string]: any;
  };
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
  
  const hasScheduleData = 
    pendingNotifications.length > 0 || 
    scheduledTasks.length > 0 ||
    (dailySchedule && scheduleItems.length > 0);

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

      {!hasScheduleData ? (
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Daily Schedule Display */}
            {dailySchedule && scheduleItems.length > 0 && (
              <DailyScheduleComponent 
                dailySchedule={dailySchedule} 
                scheduleItems={scheduleItems}
                tasks={scheduledTasks}
              />
            )}
            
            {/* We've removed the duplicate Today's Schedule card */}
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
                    <div className="space-y-4">
                      {pendingNotifications.map((notification: PendingNotification) => {
                        // Find the associated task if it exists
                        const relatedTask = notification.context?.taskId ? 
                          scheduledTasks.find(t => t.id === notification.context?.taskId) : 
                          undefined;
                        
                        // Get a readable type label
                        const typeLabel = 
                          notification.messageType === 'follow_up' ? 'Task Check-in' :
                          notification.messageType === 'morning_message' ? 'Morning Schedule' :
                          notification.messageType === 'reminder' ? 'Task Reminder' : 
                          'Check-in';
                          
                        return (
                          <div key={notification.id} className="rounded-lg border p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center">
                                <Bell className="h-4 w-4 mr-2 text-primary" />
                                <span className="font-medium">{typeLabel}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <Badge variant={
                                  formatDistanceToNow(new Date(notification.scheduledFor)).includes('minute') ? 
                                  "destructive" : "outline"
                                }>
                                  {formatDistanceToNow(new Date(notification.scheduledFor), { addSuffix: true })}
                                </Badge>
                                <span className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(notification.scheduledFor), "h:mm a")}
                                </span>
                              </div>
                            </div>
                            
                            <Separator className="my-2" />
                            
                            <div className="text-sm">
                              {relatedTask ? (
                                <div className="space-y-3">
                                  <div className="flex items-start space-x-2">
                                    <div className={`w-1 h-full rounded-full self-stretch ${
                                      String(relatedTask.priority) === 'high' ? 'bg-destructive' : 
                                      String(relatedTask.priority) === 'medium' ? 'bg-primary' : 
                                      'bg-muted'
                                    }`} />
                                    <div className="flex-1">
                                      <div className="font-medium">{relatedTask.title}</div>
                                      {relatedTask.description && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                          {relatedTask.description}
                                        </p>
                                      )}
                                      
                                      {/* Show subtasks if available */}
                                      {scheduledSubtasks && scheduledSubtasks[relatedTask.id!] && (
                                        <div className="mt-2 space-y-1">
                                          <p className="text-xs font-medium">Subtasks to check:</p>
                                          <ul className="text-xs pl-4 space-y-1">
                                            {scheduledSubtasks[relatedTask.id!]
                                              .filter(st => !st.completedAt)
                                              .slice(0, 3)
                                              .map(subtask => (
                                                <li key={subtask.id} className="list-disc text-muted-foreground">
                                                  {subtask.title}
                                                </li>
                                              ))}
                                            {scheduledSubtasks[relatedTask.id!].filter(st => !st.completedAt).length > 3 && (
                                              <li className="text-muted-foreground">
                                                +{scheduledSubtasks[relatedTask.id!].filter(st => !st.completedAt).length - 3} more
                                              </li>
                                            )}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {notification.context?.rescheduled && (
                                    <div className="text-xs bg-muted/30 p-2 rounded">
                                      <span className="font-medium">Note:</span> This is a rescheduled check-in
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center py-2 text-muted-foreground">
                                  {notification.messageType === 'morning_message' ? 
                                    'Daily morning schedule check-in' : 
                                    'General follow-up on your progress'}
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
      )}
    </div>
  );
}