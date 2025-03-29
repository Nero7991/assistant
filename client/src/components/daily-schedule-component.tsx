import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Check,
  Clock, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  CalendarClock,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

interface ScheduleItem {
  id: number;
  scheduleId: number;
  taskId: number | null;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  status: string;
  completedAt: Date | null;
}

interface DailySchedule {
  id: number;
  userId: number;
  date: string;
  status: string;
  originalContent: string;
  formattedSchedule: any;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

interface DailyScheduleProps {
  onCreateNew: () => void;
}

export function DailyScheduleComponent({ onCreateNew }: DailyScheduleProps) {
  const { toast } = useToast();
  const [selectedSchedule, setSelectedSchedule] = useState<DailySchedule | null>(null);
  const [llmResponseDialog, setLlmResponseDialog] = useState(false);
  const [llmResponse, setLlmResponse] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [generatingSchedule, setGeneratingSchedule] = useState(false);

  // Fetch daily schedules
  const { 
    data: schedules = [], 
    isLoading: isLoadingSchedules,
    isError: isSchedulesError,
    error: schedulesError,
    refetch: refetchSchedules
  } = useQuery<DailySchedule[]>({
    queryKey: ["/api/daily-schedules"],
    queryFn: async () => {
      const res = await fetch("/api/daily-schedules");
      if (!res.ok) throw new Error("Failed to fetch schedules");
      return res.json();
    }
  });

  // Fetch items for the selected schedule
  const {
    data: scheduleItems = [],
    isLoading: isLoadingItems,
    isError: isItemsError,
    error: itemsError
  } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/daily-schedules", selectedSchedule?.id, "items"],
    queryFn: async () => {
      if (!selectedSchedule) return [];
      const res = await fetch(`/api/daily-schedules/${selectedSchedule.id}/items`);
      if (!res.ok) throw new Error("Failed to fetch schedule items");
      return res.json();
    },
    enabled: !!selectedSchedule
  });

  // Mutation to confirm a schedule
  const confirmScheduleMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      const res = await fetch(`/api/daily-schedules/${scheduleId}/confirm`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Failed to confirm schedule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-schedules"] });
      refetchSchedules();
      toast({
        title: "Schedule confirmed",
        description: "Your daily schedule has been confirmed and notifications have been scheduled.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error confirming schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation to update a schedule item's status
  const updateItemStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: number, status: string }) => {
      const res = await fetch(`/api/schedule-items/${itemId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Failed to update item status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/daily-schedules", selectedSchedule?.id, "items"] 
      });
      toast({
        title: "Item updated",
        description: "Schedule item has been updated successfully."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating item",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation to create a schedule from an LLM response
  const createFromLlmMutation = useMutation({
    mutationFn: async (llmResponse: string) => {
      const res = await fetch("/api/daily-schedules/from-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmResponse })
      });
      if (!res.ok) throw new Error("Failed to create schedule from LLM response");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-schedules"] });
      refetchSchedules();
      setLlmResponseDialog(false);
      setLlmResponse("");
      toast({
        title: "Schedule created",
        description: `Created schedule with ${data.parsedItems} items.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Mutation to generate a schedule with AI
  const generateScheduleMutation = useMutation({
    mutationFn: async (customInstructions: string) => {
      const res = await fetch("/api/daily-schedules/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customInstructions })
      });
      if (!res.ok) throw new Error("Failed to generate schedule");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-schedules"] });
      refetchSchedules();
      setLlmResponseDialog(false);
      setCustomInstructions("");
      setLlmResponse("");
      toast({
        title: "Schedule generated",
        description: `Generated schedule with ${data.parsedItems} items.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error generating schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleItemStatusChange = (itemId: number, status: string) => {
    updateItemStatusMutation.mutate({ itemId, status });
  };

  const handleConfirmSchedule = (scheduleId: number) => {
    confirmScheduleMutation.mutate(scheduleId);
  };

  const handleLlmSubmit = () => {
    if (!llmResponse.trim()) {
      toast({
        title: "Empty response",
        description: "Please paste the LLM response containing the schedule.",
        variant: "destructive",
      });
      return;
    }
    
    createFromLlmMutation.mutate(llmResponse);
  };
  
  const handleGenerateSchedule = () => {
    setGeneratingSchedule(true);
    generateScheduleMutation.mutate(customInstructions);
  };

  // Helper to format time for display
  const formatTime = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return timeStr;
    }
  };

  if (isLoadingSchedules) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isSchedulesError) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <p className="text-destructive">Error loading schedules</p>
        <p className="text-sm text-muted-foreground">{(schedulesError as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Daily Schedules</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setLlmResponseDialog(true)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Create With AI
          </Button>
          <Button onClick={onCreateNew}>
            <Calendar className="mr-2 h-4 w-4" />
            Create Manually
          </Button>
        </div>
      </div>

      {schedules.length === 0 ? (
        <div className="text-center py-12">
          <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No schedules created yet.</p>
          <Button 
            variant="outline" 
            className="mt-4" 
            onClick={() => setLlmResponseDialog(true)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Create With AI
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {schedules.map((schedule) => (
            <Card key={schedule.id} className={schedule.status === 'confirmed' ? 'border-green-200' : ''}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>
                      Schedule for {format(new Date(schedule.date), 'MMM d, yyyy')}
                    </CardTitle>
                    <CardDescription>
                      Created {format(new Date(schedule.createdAt), 'MMM d, h:mm a')}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className={schedule.status === 'confirmed' ? 'bg-green-100 hover:bg-green-100/80 text-green-800 border-green-300' : ''}>
                    {schedule.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSchedule(schedule)}
                    >
                      View Details
                    </Button>
                    {schedule.status !== 'confirmed' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleConfirmSchedule(schedule.id)}
                        disabled={confirmScheduleMutation.isPending}
                      >
                        {confirmScheduleMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Confirming
                          </>
                        ) : (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Confirm Schedule
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Schedule Details Dialog */}
      {selectedSchedule && (
        <Dialog open={!!selectedSchedule} onOpenChange={(open) => !open && setSelectedSchedule(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Schedule for {format(new Date(selectedSchedule.date), 'MMMM d, yyyy')}
              </DialogTitle>
              <DialogDescription>
                Status: {selectedSchedule.status}
                {selectedSchedule.confirmedAt && (
                  <> · Confirmed at {format(new Date(selectedSchedule.confirmedAt), 'h:mm a')}</>
                )}
              </DialogDescription>
            </DialogHeader>

            {isLoadingItems ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : isItemsError ? (
              <div className="text-center py-4">
                <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
                <p className="text-destructive">Error loading schedule items</p>
                <p className="text-sm text-muted-foreground">{(itemsError as Error).message}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {scheduleItems.length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground">No items in this schedule.</p>
                ) : (
                  <div className="space-y-3">
                    {scheduleItems
                      .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      .map((item) => (
                        <div 
                          key={item.id} 
                          className={`p-3 rounded-lg border ${
                            item.status === 'completed' 
                              ? 'bg-muted/40' 
                              : item.status === 'in_progress' 
                                ? 'border-primary/50 bg-primary/5' 
                                : ''
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {item.title}
                                {item.taskId && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="outline" className="text-xs px-1.5">
                                          Task
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Linked to task</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                              )}
                              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-2">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatTime(item.startTime)}
                                  {item.endTime && (
                                    <> - {formatTime(item.endTime)}</>
                                  )}
                                </div>
                                {item.status === 'completed' && item.completedAt && (
                                  <div className="flex items-center gap-1">
                                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                    {format(new Date(item.completedAt), 'h:mm a')}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {item.status !== 'completed' ? (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleItemStatusChange(item.id, 'completed')}
                                  disabled={updateItemStatusMutation.isPending}
                                >
                                  {updateItemStatusMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                  <span className="sr-only">Mark as completed</span>
                                </Button>
                              ) : (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                  Completed
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {selectedSchedule.status !== 'confirmed' && (
                  <div className="flex justify-end pt-4">
                    <Button
                      onClick={() => handleConfirmSchedule(selectedSchedule.id)}
                      disabled={confirmScheduleMutation.isPending}
                    >
                      {confirmScheduleMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Confirming Schedule
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Confirm Schedule
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Schedule Creation Dialog */}
      <Dialog open={llmResponseDialog} onOpenChange={setLlmResponseDialog}>
        <DialogContent className="max-w-3xl">
          <Tabs defaultValue="generate">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Create Daily Schedule</DialogTitle>
                <TabsList>
                  <TabsTrigger value="generate">Generate with AI</TabsTrigger>
                  <TabsTrigger value="paste">Paste AI Response</TabsTrigger>
                </TabsList>
              </div>
            </DialogHeader>

            <TabsContent value="generate" className="space-y-4 py-4">
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Generate a Schedule with AI</h3>
                <p className="text-sm text-muted-foreground">
                  The AI coach will create a schedule based on your tasks and personal preferences. 
                  You can add custom instructions to personalize the schedule.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="custom-instructions">Custom Instructions (Optional)</Label>
                <Textarea
                  id="custom-instructions"
                  placeholder="E.g., I need more breaks in the afternoon, I want to focus on project X today, etc."
                  className="min-h-[120px]"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                />
              </div>
              
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setLlmResponseDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateSchedule}
                  disabled={generateScheduleMutation.isPending || generatingSchedule}
                >
                  {generateScheduleMutation.isPending || generatingSchedule ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Schedule
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Schedule
                    </>
                  )}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="paste" className="space-y-4 py-4">
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Paste an AI Response</h3>
                <p className="text-sm text-muted-foreground">
                  Paste the AI response containing a schedule. The response should include the marker "{`FINAL_SCHEDULE_FOR_DAY:`}" followed by the schedule details.
                </p>
              </div>
              
              <Textarea
                placeholder="Paste the AI response containing the schedule here..."
                className="min-h-[200px]"
                value={llmResponse}
                onChange={(e) => setLlmResponse(e.target.value)}
              />

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setLlmResponseDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleLlmSubmit}
                  disabled={createFromLlmMutation.isPending}
                >
                  {createFromLlmMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Schedule
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Create Schedule
                    </>
                  )}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}