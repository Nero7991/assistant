import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { TaskType, insertTaskSchema, type InsertTask } from "@shared/schema";
import { Plus, X, Pencil } from "lucide-react";

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
}

interface TaskSuggestions {
  subtasks: SubTaskSuggestion[];
  estimatedTotalDuration: string;
  suggestedDeadline: string;
  tips: string[];
}

export function AddTaskDialog({ open, onOpenChange, defaultType }: AddTaskDialogProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<keyof typeof TaskType>(defaultType);
  const [suggestions, setSuggestions] = useState<TaskSuggestions | null>(null);
  const [editingSubtask, setEditingSubtask] = useState<number | null>(null);

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      taskType: TaskType[defaultType],
      title: "",
      description: "",
      status: "active",
      estimatedDuration: "",
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });

      if (response.suggestions) {
        setSuggestions(response.suggestions);
      } else {
        form.reset();
        onOpenChange(false);
        toast({
          title: "Task created",
          description: "Your new task has been created successfully.",
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
        deadline: subtask.deadline ? new Date(subtask.deadline) : undefined
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

  const handleSaveSuggestions = async (taskId: number) => {
    if (!suggestions) return;

    try {
      console.log('Creating subtasks for task:', taskId);

      for (const subtask of suggestions.subtasks) {
        console.log('Creating subtask:', subtask);
        await createSubtaskMutation.mutateAsync({ ...subtask, taskId });
      }

      setSuggestions(null);
      form.reset();
      onOpenChange(false);
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
    };

    setSuggestions({
      ...suggestions,
      subtasks: [...suggestions.subtasks, newSubtask],
    });
    setEditingSubtask(suggestions.subtasks.length);
  };

  const getDurationPlaceholder = () => {
    switch (selectedType) {
      case "DAILY":
        return "e.g., 30m or 2h";
      case "PERSONAL_PROJECT":
        return "e.g., 3d or 2w";
      case "LONG_TERM_PROJECT":
        return "e.g., 6M";
      case "LIFE_GOAL":
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
                      setSelectedType(value as keyof typeof TaskType);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select task type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={TaskType.DAILY}>Daily Task</SelectItem>
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

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Create Task
              </Button>
            </div>
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

            <div className="space-y-3 max-h-[40vh] overflow-y-auto">
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
                      <Button size="sm" onClick={() => setEditingSubtask(null)}>
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
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveSubtask(index)}
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
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
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

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSuggestions(null)}>
                Discard Suggestions
              </Button>
              <Button onClick={() => createMutation.data?.task && handleSaveSuggestions(createMutation.data.task.id)}>
                Save with Subtasks
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}