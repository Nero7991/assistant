import { Task, TaskType } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";

interface TaskListProps {
  tasks: Task[];
  type: string;
}

export function TaskList({ tasks, type }: TaskListProps) {
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
              <div>
                <CardTitle>{task.title}</CardTitle>
                {task.description && (
                  <CardDescription>{task.description}</CardDescription>
                )}
              </div>
              <Badge variant={task.status === 'completed' ? "secondary" : "default"}>
                {task.status}
              </Badge>
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
