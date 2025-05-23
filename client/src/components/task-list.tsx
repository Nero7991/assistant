import { Task, TaskType, Subtask } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Calendar, Trash2, ChevronDown, ChevronRight, Plus, AlarmClock, Repeat, Pencil } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AddSubtaskDialog } from "@/components/add-subtask-dialog";

interface DayHighlightProps {
  pattern: string; // Expects patterns like "weekly:1,3,5" or "daily"
}

const DayHighlight: React.FC<DayHighlightProps> = ({ pattern }) => {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun=0, Mon=1, ..., Sat=6
  let activeIndices = new Set<number>();

  if (pattern === 'daily') {
    activeIndices = new Set([0, 1, 2, 3, 4, 5, 6]);
  } else if (pattern.startsWith('weekly:')) {
    try {
      const dayStr = pattern.split(':')[1];
      dayStr.split(',').forEach(d => {
        const index = parseInt(d.trim(), 10);
        if (!isNaN(index) && index >= 0 && index <= 6) {
          activeIndices.add(index);
        }
      });
    } catch (e) {
      console.error("Error parsing weekly pattern:", e);
      // Don't highlight anything if pattern is invalid
    }
  } else {
    // Not daily or weekly, don't render anything specific
    return null;
  }

  // Don't render if no days are active (e.g., invalid pattern)
  if (activeIndices.size === 0 && pattern !== 'daily') return null;

  return (
    <div className="flex gap-1 mt-1">
      {days.map((day, index) => (
        <span
          key={index}
          className={`text-xs w-4 h-4 flex items-center justify-center rounded-sm ${
            activeIndices.has(index)
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {day}
        </span>
      ))}
    </div>
  );
};

interface TaskListProps {
  tasks: Task[];
  type: string;
}

// Helper function to check if a task type supports subtasks
const supportsSubtasks = (taskType: string): boolean => {
  return taskType === TaskType.PERSONAL_PROJECT ||
         taskType === TaskType.LONG_TERM_PROJECT ||
         taskType === TaskType.LIFE_GOAL;
};

// Function to get a human-readable label for task types
const getTypeLabel = (type: string): string => {
  switch (type) {
    case TaskType.REGULAR:
      return "Task";
    case TaskType.PERSONAL_PROJECT:
      return "Personal Project";
    case TaskType.LONG_TERM_PROJECT:
      return "Long-term Project";
    case TaskType.LIFE_GOAL:
      return "Life Goal";
    default:
      return type;
  }
};

export function TaskList({ tasks, type }: TaskListProps) {
  const [expandedTasks, setExpandedTasks] = useState<Record<number, boolean>>({});
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [subtaskToDelete, setSubtaskToDelete] = useState<{ taskId: number, subtaskId: number } | null>(null);
  const [addSubtaskTask, setAddSubtaskTask] = useState<number | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [subtaskToEdit, setSubtaskToEdit] = useState<{ taskId: number, subtask: Subtask } | null>(null);
  const { toast } = useToast();
  
  // When tasks change or tab changes, automatically expand tasks with subtasks
  useEffect(() => {
    const newExpandedState: Record<number, boolean> = {};
    
    // We'll pre-expand tasks that have subtasks
    if (tasks.length > 0) {
      tasks.forEach(task => {
        // Only expand tasks of types that can have subtasks
        if (supportsSubtasks(task.taskType)) {
          newExpandedState[task.id] = true;
        }
      });
    }
    
    setExpandedTasks(newExpandedState);
  }, [type, tasks]); // Trigger when the tab or tasks change

  const toggleTask = (taskId: number) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  // Include the task type in the query key so it refetches when the task type changes
  const { data: subtasksByTask = {} } = useQuery<Record<number, Subtask[]>>({
    queryKey: ["/api/tasks/subtasks", type],
    queryFn: async () => {
      const subtasksByTask: Record<number, Subtask[]> = {};
      await Promise.all(
        tasks.map(async (task) => {
          const res = await fetch(`/api/tasks/${task.id}/subtasks`);
          if (res.ok) {
            subtasksByTask[task.id] = await res.json();
          }
        })
      );
      return subtasksByTask;
    },
    enabled: tasks.length > 0,
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to complete task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const completeSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: number) => {
      const res = await fetch(`/api/subtasks/${subtaskId}/complete`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to complete subtask");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/subtasks", type] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete task");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setTaskToDelete(null);
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async ({ taskId, subtaskId }: { taskId: number, subtaskId: number }) => {
      const res = await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete subtask");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/subtasks", type] });
      setSubtaskToDelete(null);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number, updates: Partial<Task> }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setTaskToEdit(null);
      toast({
        title: "Task updated",
        description: "Task schedule has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSubtaskMutation = useMutation({
    mutationFn: async ({ taskId, subtaskId, updates }: { 
      taskId: number, 
      subtaskId: number, 
      updates: Partial<Subtask> 
    }) => {
      const res = await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update subtask");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/subtasks", type] });
      setSubtaskToEdit(null);
      toast({
        title: "Subtask updated",
        description: "Subtask schedule has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update subtask",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ---> Helper function for formatting recurrence pattern
  const formatRecurrence = (pattern: string | null | undefined): string => {
    if (!pattern || pattern === 'none') {
      return 'One-time';
    }
    if (pattern === 'daily') {
      return 'Daily';
    }
    if (pattern.startsWith('weekly:')) {
      const days = pattern.split(':')[1];
      if (days === '1,2,3,4,5') return 'Weekdays';
      if (days === '6,0') return 'Weekends'; // Assuming Sunday=0, Saturday=6 based on typical DB/JS
      if (days === '1,3,5') return 'Mon, Wed, Fri';
      // Add more specific labels or fall back
      const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      try {
        const dayIndices = days.split(',').map(d => parseInt(d.trim()));
        const dayNames = dayIndices.map(i => dayMap[i] || '?').join(', ');
        return `Weekly (${dayNames})`;
      } catch (e) { return `Weekly (${days})`; }
    }
    if (pattern.startsWith('monthly:')) {
      const day = pattern.split(':')[1];
      return `Monthly (Day ${day})`;
    }
    return pattern; // Fallback to raw pattern
  };
  // <--- End helper function

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No {getTypeLabel(type).toLowerCase()}s yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {tasks.map((task) => (
        <Card key={task.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                {(subtasksByTask[task.id]?.length > 0 || supportsSubtasks(task.taskType)) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-1"
                    onClick={() => toggleTask(task.id)}
                    aria-label={expandedTasks[task.id] ? "Collapse subtasks" : "Expand subtasks"}
                  >
                    {expandedTasks[task.id] ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <div>
                  <CardTitle>{task.title}</CardTitle>
                  {task.description && (
                    <CardDescription>{task.description}</CardDescription>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={task.status === 'completed' ? "secondary" : "default"}>
                  {task.status}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTaskToEdit(task)}
                  aria-label="Edit task schedule"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTaskToDelete(task)}
                  aria-label="Delete task"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-4">
              {task.estimatedDuration && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {task.estimatedDuration}
                </div>
              )}
              {task.deadline && (
                <div className="flex items-center gap-1 mr-2">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(task.deadline), 'MMM d, yyyy')}
                </div>
              )}
              {task.scheduledTime && (
                <div className="flex items-center gap-1 mr-2">
                  <AlarmClock className="w-4 h-4" />
                  {task.scheduledTime}
                </div>
              )}
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1">
                  <Repeat className="w-4 h-4" />
                  {formatRecurrence(task.recurrencePattern)}
                </div>
                {(task.recurrencePattern === 'daily' || task.recurrencePattern?.startsWith('weekly:')) && (
                  <DayHighlight pattern={task.recurrencePattern!} />
                )}
              </div>
              
              {/* Subtask progress indicator */}
              {subtasksByTask[task.id]?.length > 0 && (
                <div className="flex items-center gap-1">
                  <div className="text-xs font-medium">
                    {subtasksByTask[task.id].filter(subtask => subtask.status === 'completed').length} / {subtasksByTask[task.id].length} subtasks
                  </div>
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${(subtasksByTask[task.id].filter(subtask => subtask.status === 'completed').length / subtasksByTask[task.id].length) * 100}%`
                      }}
                    />
                  </div>
                </div>
              )}
              
              {/* Visual indicator for tasks with upcoming follow-ups - can check this in the future using the messageSchedules table */}
              {task.status === 'in_progress' && (
                <div className="flex items-center gap-1 text-primary">
                  <AlarmClock className="w-4 h-4" />
                  <span className="text-xs">Active task</span>
                </div>
              )}
            </div>

            {task.status !== 'completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => completeMutation.mutate(task.id)}
                disabled={completeMutation.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Mark as Complete
              </Button>
            )}

            {/* Always try to load subtasks if this task type supports them */}
            {expandedTasks[task.id] && (
              <div className="mt-6 space-y-3 pl-6 border-l">
                {supportsSubtasks(task.taskType) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mb-4"
                    onClick={() => setAddSubtaskTask(task.id)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Subtask
                  </Button>
                )}

                {subtasksByTask[task.id]?.length > 0 ? (
                  subtasksByTask[task.id].map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-start justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div>
                        <div className="font-medium">{subtask.title}</div>
                        {subtask.description && (
                          <p className="text-sm text-muted-foreground">{subtask.description}</p>
                        )}
                        <div className="flex items-center flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                          {subtask.estimatedDuration && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {subtask.estimatedDuration}
                            </div>
                          )}
                          {subtask.deadline && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(subtask.deadline), 'MMM d, yyyy')}
                            </div>
                          )}
                          {subtask.scheduledTime && (
                            <div className="flex items-center gap-1">
                              <AlarmClock className="w-3 h-3" />
                              {subtask.scheduledTime}
                            </div>
                          )}
                          <div className="flex flex-col items-start">
                            <div className="flex items-center gap-1">
                              <Repeat className="w-3 h-3" />
                              {formatRecurrence(subtask.recurrencePattern)}
                            </div>
                            {(subtask.recurrencePattern === 'daily' || subtask.recurrencePattern?.startsWith('weekly:')) && (
                              <DayHighlight pattern={subtask.recurrencePattern!} />
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Badge
                          variant={subtask.status === 'completed' ? "secondary" : "default"}
                        >
                          {subtask.status}
                        </Badge>
                        {subtask.status !== 'completed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => completeSubtaskMutation.mutate(subtask.id)}
                            aria-label="Complete subtask"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSubtaskToEdit({ taskId: task.id, subtask })}
                          aria-label="Edit subtask schedule"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSubtaskToDelete({ taskId: task.id, subtaskId: subtask.id })}
                          aria-label="Delete subtask"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : supportsSubtasks(task.taskType) ? (
                  <p className="text-sm text-muted-foreground">No subtasks yet. Add some to break down this task.</p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <AlertDialog open={!!taskToDelete} onOpenChange={() => setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
              {subtasksByTask[taskToDelete?.id ?? 0]?.length > 0 && (
                " All associated subtasks will also be deleted."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => taskToDelete && deleteTaskMutation.mutate(taskToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!subtaskToDelete} onOpenChange={() => setSubtaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subtask</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this subtask? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => subtaskToDelete && deleteSubtaskMutation.mutate(subtaskToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddSubtaskDialog
        open={addSubtaskTask !== null}
        onOpenChange={(open) => !open && setAddSubtaskTask(null)}
        taskId={addSubtaskTask ?? 0}
      />
      
      {/* Task Schedule Edit Dialog */}
      <Dialog open={!!taskToEdit} onOpenChange={(open) => !open && setTaskToEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Task Schedule</DialogTitle>
            <DialogDescription>
              Adjust the scheduled time and recurrence pattern for this task.
            </DialogDescription>
          </DialogHeader>
          
          {taskToEdit && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="scheduledTime">Scheduled Time</Label>
                <Input
                  id="scheduledTime"
                  type="time"
                  defaultValue={taskToEdit.scheduledTime || ""}
                  onChange={(e) => setTaskToEdit({...taskToEdit, scheduledTime: e.target.value})}
                />
                <p className="text-sm text-muted-foreground">
                  Set a specific time for this task.
                </p>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="recurrencePattern">Recurrence Pattern</Label>
                <Select
                   value={taskToEdit.recurrencePattern || 'none'}
                   onValueChange={(value) => setTaskToEdit({...taskToEdit, recurrencePattern: value === 'none' ? null : value})}
                >
                  <SelectTrigger id="recurrencePattern">
                    <SelectValue placeholder="Select a pattern" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One-time (No Recurrence)</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly:1,2,3,4,5">Weekdays (Mon-Fri)</SelectItem>
                    <SelectItem value="weekly:6,0">Weekends (Sat-Sun)</SelectItem>
                    <SelectItem value="weekly:1">Weekly on Monday</SelectItem>
                    <SelectItem value="weekly:2">Weekly on Tuesday</SelectItem>
                    <SelectItem value="weekly:3">Weekly on Wednesday</SelectItem>
                    <SelectItem value="weekly:4">Weekly on Thursday</SelectItem>
                    <SelectItem value="weekly:5">Weekly on Friday</SelectItem>
                    <SelectItem value="weekly:6">Weekly on Saturday</SelectItem>
                    <SelectItem value="weekly:0">Weekly on Sunday</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Set how often this task should repeat.
                </p>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskToEdit(null)}>
              Cancel
            </Button>
            <Button onClick={() => {
              if (taskToEdit) {
                updateTaskMutation.mutate({
                  id: taskToEdit.id,
                  updates: {
                    scheduledTime: taskToEdit.scheduledTime,
                    recurrencePattern: taskToEdit.recurrencePattern,
                  }
                });
              }
            }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Subtask Schedule Edit Dialog */}
      <Dialog open={!!subtaskToEdit} onOpenChange={(open) => !open && setSubtaskToEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Subtask Schedule</DialogTitle>
            <DialogDescription>
              Adjust the scheduled time and recurrence pattern for this subtask.
            </DialogDescription>
          </DialogHeader>
          
          {subtaskToEdit && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="scheduledTime">Scheduled Time</Label>
                <Input
                  id="scheduledTime"
                  type="time"
                  defaultValue={subtaskToEdit.subtask.scheduledTime || ""}
                  onChange={(e) => setSubtaskToEdit({
                    ...subtaskToEdit, 
                    subtask: {...subtaskToEdit.subtask, scheduledTime: e.target.value}
                  })}
                />
                <p className="text-sm text-muted-foreground">
                  Set a specific time for this subtask.
                </p>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="recurrencePattern">Recurrence Pattern</Label>
                <Select
                   value={subtaskToEdit.subtask.recurrencePattern || 'none'}
                   onValueChange={(value) => setSubtaskToEdit({
                    ...subtaskToEdit,
                    subtask: {...subtaskToEdit.subtask, recurrencePattern: value === 'none' ? null : value}
                   })}
                 >
                  <SelectTrigger id="recurrencePattern">
                    <SelectValue placeholder="Select a pattern" />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="none">One-time (No Recurrence)</SelectItem>
                     <SelectItem value="daily">Daily</SelectItem>
                     <SelectItem value="weekly:1,2,3,4,5">Weekdays (Mon-Fri)</SelectItem>
                     <SelectItem value="weekly:6,0">Weekends (Sat-Sun)</SelectItem>
                     <SelectItem value="weekly:1">Weekly on Monday</SelectItem>
                     <SelectItem value="weekly:2">Weekly on Tuesday</SelectItem>
                     <SelectItem value="weekly:3">Weekly on Wednesday</SelectItem>
                     <SelectItem value="weekly:4">Weekly on Thursday</SelectItem>
                     <SelectItem value="weekly:5">Weekly on Friday</SelectItem>
                     <SelectItem value="weekly:6">Weekly on Saturday</SelectItem>
                     <SelectItem value="weekly:0">Weekly on Sunday</SelectItem>
                   </SelectContent>
                 </Select>
                 <p className="text-sm text-muted-foreground">
                   Set how often this subtask should repeat.
                 </p>
               </div>
             </div>
           )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubtaskToEdit(null)}>
              Cancel
            </Button>
            <Button onClick={() => {
              if (subtaskToEdit) {
                updateSubtaskMutation.mutate({
                  taskId: subtaskToEdit.taskId,
                  subtaskId: subtaskToEdit.subtask.id,
                  updates: {
                    scheduledTime: subtaskToEdit.subtask.scheduledTime,
                    recurrencePattern: subtaskToEdit.subtask.recurrencePattern,
                  }
                });
              }
            }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}