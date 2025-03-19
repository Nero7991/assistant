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

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType: keyof typeof TaskType;
}

export function AddTaskDialog({ open, onOpenChange, defaultType }: AddTaskDialogProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<keyof typeof TaskType>(defaultType);

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      taskType: TaskType[defaultType],
      title: "",
      description: "",
      status: "active",
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      form.reset();
      onOpenChange(false);
      toast({
        title: "Task created",
        description: "Your new task has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
      <DialogContent className="sm:max-w-[425px]">
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
      </DialogContent>
    </Dialog>
  );
}
