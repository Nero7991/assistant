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

// Define interfaces for the API response
interface ScheduleData {
  pendingNotifications: PendingNotification[];
  scheduledTasks: Task[];
  scheduledSubtasks: Record<number, Subtask[]>;
  lastScheduleUpdate: MessageHistoryItem | null;
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
    lastScheduleUpdate = null 
  } = data || {};
  
  const hasScheduleData = 
    pendingNotifications.length > 0 || 
    scheduledTasks.length > 0 ||
    lastScheduleUpdate !== null;

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
            {/* Main schedule section */}
            {lastScheduleUpdate && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Day Plan</CardTitle>
                  <CardDescription>
                    Created {lastScheduleUpdate.createdAt 
                      ? formatDistanceToNow(new Date(lastScheduleUpdate.createdAt), { addSuffix: true }) 
                      : "recently"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[280px] pr-4">
                    <div className="space-y-4">
                      <div className="whitespace-pre-wrap">
                        {lastScheduleUpdate.content}
                      </div>
                    </div>
                  </ScrollArea>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <div className="text-sm text-muted-foreground">
                    {lastScheduleUpdate.createdAt 
                      ? format(new Date(lastScheduleUpdate.createdAt), "PPpp") 
                      : ""}
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/chat">
                      View in Chat <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            )}

            {/* Tasks section */}
            {scheduledTasks && scheduledTasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Scheduled Tasks</CardTitle>
                  <CardDescription>
                    Your planned activities for today
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[320px] pr-4">
                    <div className="space-y-4">
                      {scheduledTasks.map((task: Task) => (
                        <div key={task.id} className="flex items-start space-x-4 p-3 rounded-lg border">
                          <div className="flex-shrink-0 mt-0.5">
                            {task.completedAt ? (
                              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                                <Check className="h-4 w-4 text-primary" />
                              </div>
                            ) : (
                              <div className="h-6 w-6 rounded-full border-2 border-muted" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{task.title}</h4>
                              {task.priority && (
                                <Badge variant={
                                  String(task.priority) === 'high' ? "destructive" : 
                                  String(task.priority) === 'medium' ? "default" : 
                                  "secondary"
                                }>
                                  {task.priority}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                            {task.scheduledTime && (
                              <div className="flex items-center text-xs text-muted-foreground mt-1">
                                <Clock className="mr-1 h-3 w-3" />
                                {format(new Date(task.scheduledTime), "h:mm a")}
                              </div>
                            )}
                            {/* Show subtasks if available */}
                            {scheduledSubtasks && 
                             scheduledSubtasks[task.id!] && 
                             scheduledSubtasks[task.id!].length > 0 && (
                              <div className="mt-3 pt-2 border-t">
                                <p className="text-xs font-medium mb-2">Subtasks:</p>
                                <div className="space-y-2">
                                  {scheduledSubtasks[task.id!].map((subtask: Subtask) => (
                                    <div key={subtask.id} className="flex items-center text-sm">
                                      <div className="h-4 w-4 mr-2 rounded-full border border-muted-foreground flex-shrink-0" />
                                      <span>{subtask.title}</span>
                                      {subtask.scheduledTime && (
                                        <span className="ml-auto text-xs text-muted-foreground">
                                          {format(new Date(subtask.scheduledTime), "h:mm a")}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" size="sm" asChild className="w-full">
                    <Link href="/tasks">
                      View All Tasks
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>

          {/* Notifications section */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center">
                    Notifications
                    {pendingNotifications && pendingNotifications.length > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {pendingNotifications.length}
                      </Badge>
                    )}
                  </div>
                </CardTitle>
                <CardDescription>
                  Upcoming check-ins and reminders
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!pendingNotifications || pendingNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Bell className="h-8 w-8 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No pending notifications</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {pendingNotifications.map((notification: PendingNotification) => (
                        <div key={notification.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center">
                              <Bell className="h-4 w-4 mr-2 text-primary" />
                              <span className="font-medium">{notification.messageType}</span>
                            </div>
                            <Badge variant="outline">
                              {formatDistanceToNow(new Date(notification.scheduledFor), { addSuffix: true })}
                            </Badge>
                          </div>
                          
                          <Separator className="my-2" />
                          
                          <div className="text-sm text-muted-foreground">
                            {notification.scheduledFor ? (
                              <div className="flex items-center text-xs mt-1">
                                <Clock className="mr-1 h-3 w-3" />
                                {format(new Date(notification.scheduledFor), "h:mm a")}
                              </div>
                            ) : null}
                            
                            {notification.context && notification.context.taskId && (
                              <div className="mt-1 text-xs">
                                Related to task ID: {notification.context.taskId}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
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