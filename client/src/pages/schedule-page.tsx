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
            {/* Tasks section */}
            {/* Daily Schedule Display */}
            {dailySchedule && scheduleItems.length > 0 && (
              <DailyScheduleComponent 
                dailySchedule={dailySchedule} 
                scheduleItems={scheduleItems} 
              />
            )}
            
            {/* Scheduled Tasks Display */}
            {scheduledTasks && scheduledTasks.length > 0 && (() => {
              // Function to render individual task
              function renderTask(task: Task) {
                return (
                  <div key={task.id} className="flex items-start group hover:bg-accent/30 rounded-md p-2 transition-colors">
                    <div className="flex-shrink-0 mt-0.5">
                      {task.completedAt ? (
                        <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted group-hover:border-primary transition-colors" />
                      )}
                    </div>
                    <div className="flex-1 ml-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium">{task.title}</h4>
                          {task.priority && (
                            <Badge variant={
                              String(task.priority) === 'high' ? "destructive" : 
                              String(task.priority) === 'medium' ? "default" : 
                              "outline"
                            } className="ml-2 text-xs">
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                        {task.scheduledTime && (() => {
                          // Parse time string like "08:00"
                          const timeString = task.scheduledTime.includes(':') ? task.scheduledTime : `${task.scheduledTime}:00`;
                          const [hours, minutes] = timeString.split(':').map(Number);
                          
                          const date = new Date();
                          date.setHours(hours, minutes, 0);
                          
                          return (
                            <span className="text-xs text-muted-foreground font-medium">
                              {format(date, "h:mm a")}
                            </span>
                          );
                        })()}
                      </div>
                      
                      {task.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                      )}
                      
                      {/* Show subtasks if available */}
                      {scheduledSubtasks && 
                       scheduledSubtasks[task.id!] && 
                       scheduledSubtasks[task.id!].length > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium">Subtasks</p>
                            <span className="text-xs text-muted-foreground">
                              {scheduledSubtasks[task.id!].filter(st => st.completedAt).length}/{scheduledSubtasks[task.id!].length}
                            </span>
                          </div>
                          <div className="grid gap-1">
                            {scheduledSubtasks[task.id!].slice(0, 3).map((subtask: Subtask) => (
                              <div key={subtask.id} className="flex items-center text-xs group">
                                {subtask.completedAt ? (
                                  <Check className="h-3 w-3 mr-2 text-primary" />
                                ) : (
                                  <div className="h-3 w-3 mr-2 rounded-full border border-muted-foreground flex-shrink-0" />
                                )}
                                <span className={subtask.completedAt ? "text-muted-foreground line-through" : ""}>{subtask.title}</span>
                                {subtask.scheduledTime && (() => {
                                  // Parse time string like "08:00"
                                  const timeString = subtask.scheduledTime.includes(':') ? subtask.scheduledTime : `${subtask.scheduledTime}:00`;
                                  const [hours, minutes] = timeString.split(':').map(Number);
                                  
                                  const date = new Date();
                                  date.setHours(hours, minutes, 0);
                                  
                                  return (
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      {format(date, "h:mm a")}
                                    </span>
                                  );
                                })()}
                              </div>
                            ))}
                            {scheduledSubtasks[task.id!].length > 3 && (
                              <div className="text-xs text-muted-foreground pl-5">
                                +{scheduledSubtasks[task.id!].length - 3} more subtasks
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              
              return (
                <Card>
                  <CardHeader>
                    <CardTitle>Today's Schedule</CardTitle>
                    <CardDescription>
                      Your planned activities organized by time
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[320px] pr-4">
                      <div>
                        {/* Group tasks by time periods */}
                        {(() => {
                          // Sort tasks by scheduled time
                          const sortedTasks = [...scheduledTasks].sort((a, b) => {
                            if (!a.scheduledTime) return 1;
                            if (!b.scheduledTime) return -1;
                            
                            // Parse time strings like "08:00" into today's date
                            const timeA = a.scheduledTime.includes(':') ? a.scheduledTime : `${a.scheduledTime}:00`;
                            const timeB = b.scheduledTime.includes(':') ? b.scheduledTime : `${b.scheduledTime}:00`;
                            
                            const today = new Date();
                            const [hoursA, minutesA] = timeA.split(':').map(Number);
                            const [hoursB, minutesB] = timeB.split(':').map(Number);
                            
                            const dateA = new Date(today);
                            dateA.setHours(hoursA, minutesA, 0);
                            
                            const dateB = new Date(today);
                            dateB.setHours(hoursB, minutesB, 0);
                            
                            return dateA.getTime() - dateB.getTime();
                          });
                          
                          // Helper function to get hours from time string
                          const getHoursFromTimeString = (timeStr: string | null | undefined) => {
                            if (!timeStr) return 0;
                            
                            const timeString = timeStr.includes(':') ? timeStr : `${timeStr}:00`;
                            const [hours] = timeString.split(':').map(Number);
                            return hours;
                          };
                          
                          // Setup time blocks
                          const morningTasks = sortedTasks.filter(t => 
                            t.scheduledTime && getHoursFromTimeString(t.scheduledTime) < 12
                          );
                          const afternoonTasks = sortedTasks.filter(t => {
                            const hours = getHoursFromTimeString(t.scheduledTime);
                            return t.scheduledTime && hours >= 12 && hours < 17;
                          });
                          const eveningTasks = sortedTasks.filter(t => 
                            t.scheduledTime && getHoursFromTimeString(t.scheduledTime) >= 17
                          );
                          const unscheduledTasks = sortedTasks.filter(t => !t.scheduledTime);
                          
                          // Create a component for time block headers
                          const TimeBlock = ({ title, tasks }: { title: string, tasks: Task[] }) => (
                            tasks.length > 0 ? (
                              <div className="mb-6">
                                <div className="flex items-center space-x-2 mb-3">
                                  <div className="h-px flex-1 bg-border"></div>
                                  <span className="text-sm font-medium text-muted-foreground px-2">{title}</span>
                                  <div className="h-px flex-1 bg-border"></div>
                                </div>
                                <div className="space-y-3">
                                  {tasks.map(task => renderTask(task))}
                                </div>
                              </div>
                            ) : null
                          );
                          
                          return (
                            <>
                              <TimeBlock title="Morning" tasks={morningTasks} />
                              <TimeBlock title="Afternoon" tasks={afternoonTasks} />
                              <TimeBlock title="Evening" tasks={eveningTasks} />
                              {unscheduledTasks.length > 0 && (
                                <TimeBlock title="Unscheduled" tasks={unscheduledTasks} />
                              )}
                            </>
                          );
                        })()}
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
              );
            })()}
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