import { Task, TaskType, Subtask } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Calendar, Trash2, Pencil, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
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
import { AddSubtaskDialog } from "@/components/add-subtask-dialog";

interface TaskListProps {
  tasks: Task[];
  type: string;
}

export function TaskList({ tasks, type }: TaskListProps) {
  const [expandedTasks, setExpandedTasks] = useState<Record<number, boolean>>({});
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [subtaskToDelete, setSubtaskToDelete] = useState<{ taskId: number, subtaskId: number } | null>(null);
  const [addSubtaskTask, setAddSubtaskTask] = useState<number | null>(null);

  const toggleTask = (taskId: number) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  const { data: subtasksByTask = {} } = useQuery<Record<number, Subtask[]>>({
    queryKey: ["/api/tasks/subtasks"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/subtasks"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/subtasks"] });
      setSubtaskToDelete(null);
    },
  });

  const getTypeLabel = (type: string) => {
    switch (type) {
      case TaskType.DAILY:
        return "Daily Task";
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

  const supportsSubtasks = (taskType: string) => {
    return [
      TaskType.PERSONAL_PROJECT,
      TaskType.LONG_TERM_PROJECT,
      TaskType.LIFE_GOAL
    ].includes(taskType as typeof TaskType[keyof typeof TaskType]);
  };

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
                  onClick={() => setTaskToDelete(task)}
                  aria-label="Delete task"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
              {task.estimatedDuration && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {task.estimatedDuration}
                </div>
              )}
              {task.deadline && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(task.deadline), 'MMM d, yyyy')}
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
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
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
    </div>
  );
}