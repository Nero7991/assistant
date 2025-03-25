import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { insertSubtaskSchema, type InsertSubtask, RecurrenceType } from "@shared/schema";

interface AddSubtaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: number;
}

export function AddSubtaskDialog({ open, onOpenChange, taskId }: AddSubtaskDialogProps) {
  const { toast } = useToast();

  const form = useForm<InsertSubtask>({
    resolver: zodResolver(insertSubtaskSchema),
    defaultValues: {
      title: "",
      description: "",
      estimatedDuration: "",
      deadline: new Date(),
      scheduledTime: "",
      recurrencePattern: "none",
    },
  });

  const createSubtaskMutation = useMutation({
    mutationFn: async (data: InsertSubtask) => {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        console.error('Subtask creation error:', errorData);
        throw new Error("Failed to create subtask");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/subtasks"] });
      form.reset();
      onOpenChange(false);
      toast({
        title: "Success",
        description: "Subtask created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Subtask</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => createSubtaskMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter subtask title" {...field} />
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
                    <Textarea placeholder="Enter subtask description" {...field} />
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
                    <Input placeholder="e.g., 2h, 3d" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="deadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deadline</FormLabel>
                  <FormControl>
                    <Input 
                      type="date" 
                      value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : field.value as string}
                      onChange={(e) => {
                        field.onChange(new Date(e.target.value));
                      }}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSubtaskMutation.isPending}>
                Create Subtask
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
