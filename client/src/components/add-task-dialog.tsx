import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { TaskType, RecurrenceType, insertTaskSchema, type InsertTask } from "@shared/schema";
import { Plus, X, Pencil, Loader2 } from "lucide-react";

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType: keyof typeof TaskType;
}

interface SubTaskSuggestion {
  title: string;
  description: string;
  estimatedDuration: string;
  deadline: string;
  scheduledTime?: string;
  recurrencePattern?: string;
}

interface TaskSuggestions {
  subtasks: SubTaskSuggestion[];
  estimatedTotalDuration: string;
  suggestedDeadline: string;
  tips: string[];
}

export function AddTaskDialog({ open, onOpenChange, defaultType }: AddTaskDialogProps) {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<TaskSuggestions | null>(null);
  const [editingSubtask, setEditingSubtask] = useState<number | null>(null);
  const [mainTask, setMainTask] = useState<{ id: number } | null>(null);

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      taskType: TaskType[defaultType],
      title: "",
      description: "",
      status: "active",
      estimatedDuration: "",
      scheduledTime: "",
      recurrencePattern: "none",
    },
  });

  const currentTaskType = form.watch("taskType");

  const needsSuggestions = (type: string): boolean => {
    return type === TaskType.PERSONAL_PROJECT ||
           type === TaskType.LONG_TERM_PROJECT ||
           type === TaskType.LIFE_GOAL;
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertTask) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create task");
      return res.json();
    },
    onSuccess: (response) => {
      if (response.suggestions) {
        setSuggestions(response.suggestions);
        setMainTask(response.task);
      } else {
        form.reset();
        onOpenChange(false);
        // Invalidate all task-related queries including subtasks for complete refresh
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks/subtasks"] });
        toast({
          title: "Success",
          description: "Your task has been created successfully.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createSubtaskMutation = useMutation({
    mutationFn: async (subtask: SubTaskSuggestion & { taskId: number }) => {
      const formattedSubtask = {
        title: subtask.title,
        description: subtask.description || "",
        estimatedDuration: subtask.estimatedDuration,
        deadline: new Date(subtask.deadline).toISOString(),
        scheduledTime: subtask.scheduledTime,
        recurrencePattern: subtask.recurrencePattern,
      };

      const res = await fetch(`/api/tasks/${subtask.taskId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formattedSubtask),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error('Subtask creation error:', errorData);
        throw new Error("Failed to create subtask");
      }

      return res.json();
    },
  });

  const handleSaveSuggestions = async () => {
    if (!suggestions || !mainTask) return;

    try {
      for (const subtask of suggestions.subtasks) {
        await createSubtaskMutation.mutateAsync({ ...subtask, taskId: mainTask.id });
      }

      setSuggestions(null);
      setMainTask(null);
      form.reset();
      onOpenChange(false);
      // Invalidate all task-related queries including subtasks for complete refresh
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/subtasks"] });
      toast({
        title: "Success",
        description: "Your task and subtasks have been created successfully.",
      });
    } catch (error) {
      console.error('Error creating subtasks:', error);
      toast({
        title: "Error",
        description: "Failed to create subtasks. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEditSubtask = (index: number, updates: Partial<SubTaskSuggestion>) => {
    if (!suggestions) return;

    const updatedSubtasks = [...suggestions.subtasks];
    updatedSubtasks[index] = { ...updatedSubtasks[index], ...updates };

    setSuggestions({
      ...suggestions,
      subtasks: updatedSubtasks,
    });
    setEditingSubtask(null);
  };

  const handleRemoveSubtask = (index: number) => {
    if (!suggestions) return;

    const updatedSubtasks = suggestions.subtasks.filter((_, i) => i !== index);
    setSuggestions({
      ...suggestions,
      subtasks: updatedSubtasks,
    });
  };

  const handleAddNewSubtask = () => {
    if (!suggestions) return;

    const newSubtask: SubTaskSuggestion = {
      title: "",
      description: "",
      estimatedDuration: "1h",
      deadline: new Date().toISOString().split('T')[0],
      scheduledTime: "",
      recurrencePattern: "none",
    };

    setSuggestions({
      ...suggestions,
      subtasks: [...suggestions.subtasks, newSubtask],
    });
    setEditingSubtask(suggestions.subtasks.length);
  };

  const getDurationPlaceholder = () => {
    switch (currentTaskType) {
      case "regular":
        return "e.g., 30m or 2h";
      case "personal_project":
        return "e.g., 3d or 2w";
      case "long_term_project":
        return "e.g., 6M";
      case "life_goal":
        return "e.g., 5y";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Task</DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(data => createMutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="taskType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Type</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select task type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={TaskType.REGULAR}>Regular Task</SelectItem>
                        <SelectItem value={TaskType.PERSONAL_PROJECT}>Personal Project</SelectItem>
                        <SelectItem value={TaskType.LONG_TERM_PROJECT}>Long-term Project</SelectItem>
                        <SelectItem value={TaskType.LIFE_GOAL}>Life Goal</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter task title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Enter task description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="estimatedDuration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Duration</FormLabel>
                    <FormControl>
                      <Input placeholder={getDurationPlaceholder()} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {(currentTaskType === TaskType.REGULAR) && (
                <>
                  <FormField
                    control={form.control}
                    name="scheduledTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scheduled Time</FormLabel>
                        <FormControl>
                          <Input 
                            type="time" 
                            placeholder="09:00" 
                            {...field} 
                          />
                        </FormControl>
                        <div className="text-xs text-muted-foreground">
                          Set a specific time for this task
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="recurrencePattern"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recurrence Pattern</FormLabel>
                        <Select
                          value={field.value || 'none'}
                          onValueChange={(value) => field.onChange(value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a pattern" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No recurrence</SelectItem>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly:1,2,3,4,5">Weekdays (Mon-Fri)</SelectItem>
                            <SelectItem value="weekly:6,7">Weekends (Sat-Sun)</SelectItem>
                            <SelectItem value="weekly:1">Every Monday</SelectItem>
                            <SelectItem value="weekly:2">Every Tuesday</SelectItem>
                            <SelectItem value="weekly:3">Every Wednesday</SelectItem>
                            <SelectItem value="weekly:4">Every Thursday</SelectItem>
                            <SelectItem value="weekly:5">Every Friday</SelectItem>
                            <SelectItem value="weekly:6">Every Saturday</SelectItem>
                            <SelectItem value="weekly:7">Every Sunday</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                          Choose when this task should repeat
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </form>
          </Form>

          {suggestions && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Suggested Subtasks</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddNewSubtask}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Subtask
                </Button>
              </div>

              <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-2">
                {suggestions.subtasks.map((subtask, index) => (
                  <div key={index} className="space-y-2 p-3 border rounded-lg">
                    {editingSubtask === index ? (
                      <div className="space-y-2">
                        <Input
                          value={subtask.title}
                          onChange={(e) => handleEditSubtask(index, { title: e.target.value })}
                          placeholder="Subtask title"
                        />
                        <Textarea
                          value={subtask.description}
                          onChange={(e) => handleEditSubtask(index, { description: e.target.value })}
                          placeholder="Subtask description"
                        />
                        <div className="flex gap-2">
                          <Input
                            value={subtask.estimatedDuration}
                            onChange={(e) => handleEditSubtask(index, { estimatedDuration: e.target.value })}
                            placeholder="Duration (e.g., 2h)"
                          />
                          <Input
                            type="date"
                            value={subtask.deadline}
                            onChange={(e) => handleEditSubtask(index, { deadline: e.target.value })}
                          />
                        </div>
                        <div className="flex gap-2 mt-2">
                          <div className="w-1/2">
                            <Input
                              type="time"
                              value={subtask.scheduledTime}
                              onChange={(e) => handleEditSubtask(index, { scheduledTime: e.target.value })}
                              placeholder="HH:MM"
                            />
                          </div>
                          <div className="w-1/2">
                            <Select
                              value={subtask.recurrencePattern || 'none'}
                              onValueChange={(value) => handleEditSubtask(index, { recurrencePattern: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Recurrence" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No recurrence</SelectItem>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly:1,2,3,4,5">Weekdays</SelectItem>
                                <SelectItem value="weekly:6,7">Weekends</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button size="sm" onClick={() => setEditingSubtask(null)} className="mt-2">
                          Save Changes
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between">
                          <h4 className="font-medium">{subtask.title}</h4>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingSubtask(index)}
                              aria-label="Edit subtask"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveSubtask(index)}
                              aria-label="Remove subtask"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{subtask.description}</p>
                        <div className="flex items-center gap-2 text-sm">
                          <span>Duration: {subtask.estimatedDuration}</span>
                          <span>•</span>
                          <span>Deadline: {subtask.deadline}</span>
                        </div>
                        {(subtask.scheduledTime || subtask.recurrencePattern) && (
                          <div className="flex items-center gap-2 text-sm mt-1">
                            {subtask.scheduledTime && (
                              <>
                                <span>Time: {subtask.scheduledTime}</span>
                                {subtask.recurrencePattern && subtask.recurrencePattern !== "none" && <span>•</span>}
                              </>
                            )}
                            {subtask.recurrencePattern && subtask.recurrencePattern !== "none" && (
                              <span>Recurs: {subtask.recurrencePattern.startsWith("weekly") 
                                ? subtask.recurrencePattern.includes("1,2,3,4,5") 
                                  ? "Weekdays" 
                                  : subtask.recurrencePattern.includes("6,7") 
                                    ? "Weekends" 
                                    : `Weekly (${subtask.recurrencePattern.split(":")[1]})` 
                                : subtask.recurrencePattern}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-4">
                <p className="text-sm">Total Duration: {suggestions.estimatedTotalDuration}</p>
                <p className="text-sm">Suggested Deadline: {suggestions.suggestedDeadline}</p>
              </div>

              {suggestions.tips.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Tips</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {suggestions.tips.map((tip, index) => (
                      <li key={index} className="text-sm">{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t">
          {suggestions ? (
            <>
              <Button variant="outline" onClick={() => {
                setSuggestions(null);
                setMainTask(null);
              }}>
                Discard Suggestions
              </Button>
              <Button onClick={handleSaveSuggestions}>
                Save with Subtasks
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                onClick={form.handleSubmit(data => createMutation.mutate(data))}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {needsSuggestions(currentTaskType) ? "Suggest Subtasks" : "Create Task"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}