import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Task, TaskType } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskList } from "@/components/task-list";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState, useEffect } from "react";

export default function TasksPage() {
  const { user } = useAuth();
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  // Get the selected tab from localStorage or default to "REGULAR"
  const [selectedTaskType, setSelectedTaskType] = useState<keyof typeof TaskType>(() => {
    const savedTab = localStorage.getItem('selectedTaskTab');
    // Check if savedTab is a valid key before using, default to REGULAR
    const isValidSavedTab = savedTab && Object.values(TaskType).includes(savedTab as any);
    return isValidSavedTab ? (savedTab as keyof typeof TaskType) : "REGULAR"; // Default to REGULAR
  });

  // Save the selected tab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedTaskTab', selectedTaskType);
  }, [selectedTaskType]);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  // Filter tasks by type using the renamed TaskType.REGULAR
  const tasksByType = {
    [TaskType.REGULAR]: tasks.filter(task => task.taskType === TaskType.REGULAR),
    [TaskType.PERSONAL_PROJECT]: tasks.filter(task => task.taskType === TaskType.PERSONAL_PROJECT),
    [TaskType.LONG_TERM_PROJECT]: tasks.filter(task => task.taskType === TaskType.LONG_TERM_PROJECT),
    [TaskType.LIFE_GOAL]: tasks.filter(task => task.taskType === TaskType.LIFE_GOAL),
  };

  return (
    <div className="container">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold">Tasks & Goals</h1>
        <Button onClick={() => setAddTaskOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Task
        </Button>
      </div>

      <Tabs value={selectedTaskType} onValueChange={(v) => setSelectedTaskType(v as keyof typeof TaskType)}>
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value={TaskType.REGULAR}>Tasks</TabsTrigger>
          <TabsTrigger value={TaskType.PERSONAL_PROJECT}>Personal Projects</TabsTrigger>
          <TabsTrigger value={TaskType.LONG_TERM_PROJECT}>Long-term Projects</TabsTrigger>
          <TabsTrigger value={TaskType.LIFE_GOAL}>Life Goals</TabsTrigger>
        </TabsList>

        {Object.entries(tasksByType).map(([type, tasksOfType]) => (
          <TabsContent key={type} value={type}>
            <TaskList tasks={tasksOfType} type={type} />
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