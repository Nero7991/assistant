import React from 'react';
import { format, parseISO } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Check, Clock } from 'lucide-react';
import { Task } from '@shared/schema';

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

interface DailyScheduleComponentProps {
  dailySchedule: DailySchedule;
  scheduleItems: ScheduleItem[];
  className?: string;
  tasks?: Task[]; // Optional tasks array to show task names
}

export default function DailyScheduleComponent({
  dailySchedule,
  scheduleItems,
  className = '',
  tasks = []
}: DailyScheduleComponentProps) {
  // Group schedule items by time periods (morning, afternoon, evening)
  const morningItems = scheduleItems.filter((item) => {
    const timeStr = item.startTime;
    const [hours] = timeStr.split(':').map(Number);
    return hours < 12;
  });

  const afternoonItems = scheduleItems.filter((item) => {
    const timeStr = item.startTime;
    const [hours] = timeStr.split(':').map(Number);
    return hours >= 12 && hours < 17;
  });

  const eveningItems = scheduleItems.filter((item) => {
    const timeStr = item.startTime;
    const [hours] = timeStr.split(':').map(Number);
    return hours >= 17;
  });

  // Helper function to format time
  const formatTimeDisplay = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0);
    return format(date, 'h:mm a');
  };

  // Render a time block section (morning, afternoon, evening)
  const renderTimeBlock = (title: string, items: ScheduleItem[]) => {
    if (items.length === 0) return null;

    return (
      <div className="mb-6">
        <div className="flex items-center space-x-2 mb-3">
          <div className="h-px flex-1 bg-border"></div>
          <span className="text-sm font-medium text-muted-foreground px-2">{title}</span>
          <div className="h-px flex-1 bg-border"></div>
        </div>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start group hover:bg-accent/30 rounded-md p-2 transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5">
                {item.completedAt ? (
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
                    <div>
                      <h4 className="font-medium">
                        {item.title}
                        {item.taskId && tasks.length > 0 && (
                          <>
                            <span className="mx-1 text-muted-foreground">•</span>
                            <span className="text-primary/80">
                              For: {tasks.find(task => task.id === item.taskId)?.title || "Main Task"}
                            </span>
                          </>
                        )}
                      </h4>
                    </div>
                    {item.status === 'completed' && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        completed
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {formatTimeDisplay(item.startTime)}
                    {item.endTime && ` - ${formatTimeDisplay(item.endTime)}`}
                  </span>
                </div>

                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Get the schedule date in a readable format
  const scheduleDate = dailySchedule.date 
    ? format(parseISO(dailySchedule.date), 'EEEE, MMMM d, yyyy')
    : 'Today';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Daily Schedule</CardTitle>
        <CardDescription>
          {scheduleDate} - {scheduleItems.length} activities scheduled
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {scheduleItems.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8">
              <Clock className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium">No activities scheduled</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your day hasn't been scheduled yet. Use the Chat to create a schedule.
              </p>
            </div>
          ) : (
            <div>
              {renderTimeBlock('Morning', morningItems)}
              {renderTimeBlock('Afternoon', afternoonItems)}
              {renderTimeBlock('Evening', eveningItems)}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}