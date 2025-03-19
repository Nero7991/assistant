import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Task, TaskType } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskList } from "@/components/task-list";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";

export default function TasksPage() {
  const { user } = useAuth();
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [selectedTaskType, setSelectedTaskType] = useState<keyof typeof TaskType>("DAILY");

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const tasksByType = {
    [TaskType.DAILY]: tasks.filter(task => task.taskType === TaskType.DAILY),
    [TaskType.PERSONAL_PROJECT]: tasks.filter(task => task.taskType === TaskType.PERSONAL_PROJECT),
    [TaskType.LONG_TERM_PROJECT]: tasks.filter(task => task.taskType === TaskType.LONG_TERM_PROJECT),
    [TaskType.LIFE_GOAL]: tasks.filter(task => task.taskType === TaskType.LIFE_GOAL),
  };

  return (
    <div className="container py-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Tasks & Goals</h1>
        <Button onClick={() => setAddTaskOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Task
        </Button>
      </div>

      <Tabs defaultValue={TaskType.DAILY} onValueChange={(v) => setSelectedTaskType(v as keyof typeof TaskType)}>
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value={TaskType.DAILY}>Daily Tasks</TabsTrigger>
          <TabsTrigger value={TaskType.PERSONAL_PROJECT}>Personal Projects</TabsTrigger>
          <TabsTrigger value={TaskType.LONG_TERM_PROJECT}>Long-term Projects</TabsTrigger>
          <TabsTrigger value={TaskType.LIFE_GOAL}>Life Goals</TabsTrigger>
        </TabsList>

        {Object.entries(tasksByType).map(([type, tasks]) => (
          <TabsContent key={type} value={type}>
            <TaskList tasks={tasks} type={type} />
          </TabsContent>
        ))}
      </Tabs>

      <AddTaskDialog 
        open={addTaskOpen} 
        onOpenChange={setAddTaskOpen}
        defaultType={selectedTaskType}
      />
    </div>
  );
}