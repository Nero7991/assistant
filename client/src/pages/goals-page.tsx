import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Goal } from "@shared/schema";
import { SidebarNav } from "@/components/sidebar-nav";
import { GoalForm } from "@/components/goal-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { PlusCircle, Calendar, Loader2 } from "lucide-react";

export default function GoalsPage() {
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: goals, isLoading } = useQuery<Goal[]>({
    queryKey: ["/api/goals"],
  });

  const createGoalMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; deadline?: Date }) => {
      const res = await apiRequest("POST", "/api/goals", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      setIsFormOpen(false);
      toast({
        title: "Goal created",
        description: "Your new goal has been created successfully.",
      });
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; completed: boolean }) => {
      const res = await apiRequest("PATCH", `/api/goals/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
    },
  });

  return (
    <div className="flex h-screen">
      <SidebarNav className="w-64" />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Goals</h1>
              <p className="text-muted-foreground">
                Track and manage your ADHD-friendly goals
              </p>
            </div>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Goal
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Goal</DialogTitle>
                </DialogHeader>
                <GoalForm
                  onSubmit={(data) => createGoalMutation.mutate(data)}
                  isPending={createGoalMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : goals?.length === 0 ? (
            <Card className="bg-muted/50">
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <h3 className="font-semibold text-lg mb-2">No goals yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start by creating your first goal
                </p>
                <DialogTrigger asChild>
                  <Button>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Goal
                  </Button>
                </DialogTrigger>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {goals?.map((goal) => (
                <Card key={goal.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={goal.completed}
                          onCheckedChange={(checked) =>
                            updateGoalMutation.mutate({
                              id: goal.id,
                              completed: checked as boolean,
                            })
                          }
                        />
                        <div>
                          <CardTitle
                            className={
                              goal.completed ? "line-through text-muted-foreground" : ""
                            }
                          >
                            {goal.title}
                          </CardTitle>
                          {goal.deadline && (
                            <CardDescription className="flex items-center mt-1">
                              <Calendar className="h-3 w-3 mr-1" />
                              {format(new Date(goal.deadline), "PPP")}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={
                        goal.completed ? "line-through text-muted-foreground" : ""
                      }
                    >
                      {goal.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
