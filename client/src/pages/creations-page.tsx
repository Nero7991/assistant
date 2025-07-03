import React, { useState, useEffect } from 'react';
import { Plus, Rocket, Code, Clock, CheckCircle, AlertCircle, ExternalLink, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

// Types
interface Creation {
  id: number;
  title: string;
  description: string;
  status: 'brainstorming' | 'planning' | 'approved' | 'building' | 'completed' | 'failed' | 'archived';
  pageName?: string;
  deploymentUrl?: string;
  totalTasks: number;
  completedTasks: number;
  totalSubtasks: number;
  completedSubtasks: number;
  architecturePlan?: string;
  estimatedDuration?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface CreationTask {
  id: number;
  creationId: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  category: string;
  orderIndex: number;
  estimatedDuration?: string;
  totalSubtasks: number;
  completedSubtasks: number;
  startedAt?: string;
  completedAt?: string;
}

interface CreationSubtask {
  id: number;
  creationId: number;
  taskId: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  orderIndex: number;
  estimatedDuration?: string;
  filesPaths?: string[];
  startedAt?: string;
  completedAt?: string;
}

const statusColors = {
  brainstorming: 'bg-gray-500',
  planning: 'bg-blue-500',
  approved: 'bg-green-500',
  building: 'bg-yellow-500',
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  archived: 'bg-gray-400',
  pending: 'bg-gray-500',
  in_progress: 'bg-blue-500',
  skipped: 'bg-gray-400',
};

const statusIcons = {
  brainstorming: Clock,
  planning: Code,
  approved: CheckCircle,
  building: Rocket,
  completed: CheckCircle,
  failed: AlertCircle,
  archived: Trash2,
  pending: Clock,
  in_progress: Play,
  skipped: Trash2,
};

export default function CreationsPage() {
  const [creations, setCreations] = useState<Creation[]>([]);
  const [selectedCreation, setSelectedCreation] = useState<Creation | null>(null);
  const [creationDetails, setCreationDetails] = useState<{
    creation: Creation;
    tasks: CreationTask[];
    subtasks: CreationSubtask[];
  } | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [newCreation, setNewCreation] = useState({
    title: '',
    description: '',
    pageName: '',
  });

  // Fetch all creations
  const fetchCreations = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/creations');
      if (!response.ok) throw new Error('Failed to fetch creations');
      const data = await response.json();
      setCreations(data);
    } catch (error) {
      console.error('Error fetching creations:', error);
      setError('Failed to load creations');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch creation details
  const fetchCreationDetails = async (id: number) => {
    try {
      const response = await fetch(`/api/creations/${id}`);
      if (!response.ok) throw new Error('Failed to fetch creation details');
      const data = await response.json();
      setCreationDetails(data);
    } catch (error) {
      console.error('Error fetching creation details:', error);
      setError('Failed to load creation details');
    }
  };

  // Create new creation
  const handleCreateCreation = async () => {
    if (!newCreation.title.trim() || !newCreation.description.trim()) {
      setError('Title and description are required');
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch('/api/creations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCreation),
      });

      if (!response.ok) throw new Error('Failed to create creation');
      
      const creation = await response.json();
      setCreations(prev => [creation, ...prev]);
      setIsCreateDialogOpen(false);
      setNewCreation({ title: '', description: '', pageName: '' });
      setError(null);
    } catch (error) {
      console.error('Error creating creation:', error);
      setError('Failed to create creation');
    } finally {
      setIsCreating(false);
    }
  };

  // Generate architecture plan
  const handleGeneratePlan = async (creation: Creation) => {
    try {
      const response = await fetch(`/api/creations/${creation.id}/plan`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to generate plan');
      
      await fetchCreations(); // Refresh the list
      if (selectedCreation?.id === creation.id) {
        await fetchCreationDetails(creation.id); // Refresh details if viewing
      }
    } catch (error) {
      console.error('Error generating plan:', error);
      setError('Failed to generate architecture plan');
    }
  };

  // Start building
  const handleStartBuilding = async (creation: Creation) => {
    try {
      const response = await fetch(`/api/creations/${creation.id}/build`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to start building');
      
      await fetchCreations(); // Refresh the list
      if (selectedCreation?.id === creation.id) {
        await fetchCreationDetails(creation.id); // Refresh details if viewing
      }
    } catch (error) {
      console.error('Error starting build:', error);
      setError('Failed to start building');
    }
  };

  // Delete creation
  const handleDeleteCreation = async (creation: Creation) => {
    if (!confirm('Are you sure you want to delete this creation?')) return;

    try {
      const response = await fetch(`/api/creations/${creation.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete creation');
      
      setCreations(prev => prev.filter(c => c.id !== creation.id));
      if (selectedCreation?.id === creation.id) {
        setSelectedCreation(null);
        setCreationDetails(null);
      }
    } catch (error) {
      console.error('Error deleting creation:', error);
      setError('Failed to delete creation');
    }
  };

  useEffect(() => {
    fetchCreations();
  }, []);

  useEffect(() => {
    if (selectedCreation) {
      fetchCreationDetails(selectedCreation.id);
    }
  }, [selectedCreation]);

  const getProgressPercentage = (creation: Creation) => {
    if (creation.totalSubtasks === 0) return 0;
    return Math.round((creation.completedSubtasks / creation.totalSubtasks) * 100);
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-muted-foreground">Loading creations...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Creations</h1>
          <p className="text-muted-foreground mt-1">
            Brainstorm, plan, and autonomously build web applications
          </p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Creation
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Web App</DialogTitle>
              <DialogDescription>
                Describe your web application idea. AI will help plan and build it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="My Awesome App"
                  value={newCreation.title}
                  onChange={(e) => setNewCreation(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what your web app should do, who it's for, and any specific features you want..."
                  value={newCreation.description}
                  onChange={(e) => setNewCreation(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="pageName">Page Name (Optional)</Label>
                <Input
                  id="pageName"
                  placeholder="my-awesome-app"
                  value={newCreation.pageName}
                  onChange={(e) => setNewCreation(prev => ({ ...prev, pageName: e.target.value }))}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Will be used in URL: https://pages.orenslab.com/{newCreation.pageName || 'your-app-name'}
                </p>
              </div>
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                {error}
              </div>
            )}
            <DialogFooter>
              <Button
                onClick={handleCreateCreation}
                disabled={isCreating}
                className="w-full"
              >
                {isCreating ? 'Creating...' : 'Create & Start Planning'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error Display */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creations List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xl font-semibold">Your Creations</h2>
          
          {creations.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Code className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No creations yet. Start by creating your first web app!
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-3">
                {creations.map((creation) => {
                  const StatusIcon = statusIcons[creation.status as keyof typeof statusIcons];
                  const progress = getProgressPercentage(creation);
                  
                  return (
                    <Card
                      key={creation.id}
                      className={`cursor-pointer transition-colors ${
                        selectedCreation?.id === creation.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedCreation(creation)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{creation.title}</CardTitle>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge className={statusColors[creation.status]}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {formatStatus(creation.status)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {creation.description}
                        </p>
                        
                        {creation.totalSubtasks > 0 && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Progress</span>
                              <span>{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                            <div className="text-xs text-muted-foreground">
                              {creation.completedSubtasks} of {creation.totalSubtasks} subtasks completed
                            </div>
                          </div>
                        )}
                        
                        {creation.deploymentUrl && creation.status === 'completed' && (
                          <div className="mt-3 pt-3 border-t">
                            <a
                              href={creation.deploymentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              View Live App
                            </a>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Creation Details */}
        <div className="lg:col-span-2">
          {selectedCreation ? (
            <CreationDetails
              creation={selectedCreation}
              details={creationDetails}
              onGeneratePlan={handleGeneratePlan}
              onStartBuilding={handleStartBuilding}
              onDelete={handleDeleteCreation}
            />
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Rocket className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Creation</h3>
                <p className="text-muted-foreground">
                  Choose a creation from the list to view its details, progress, and manage its development.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Creation Details Component
interface CreationDetailsProps {
  creation: Creation;
  details: {
    creation: Creation;
    tasks: CreationTask[];
    subtasks: CreationSubtask[];
  } | null;
  onGeneratePlan: (creation: Creation) => void;
  onStartBuilding: (creation: Creation) => void;
  onDelete: (creation: Creation) => void;
}

function CreationDetails({ creation, details, onGeneratePlan, onStartBuilding, onDelete }: CreationDetailsProps) {
  const StatusIcon = statusIcons[creation.status as keyof typeof statusIcons];
  const progress = creation.totalSubtasks > 0 ? Math.round((creation.completedSubtasks / creation.totalSubtasks) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-2xl">{creation.title}</CardTitle>
            <CardDescription className="mt-2">{creation.description}</CardDescription>
            <div className="flex items-center gap-3 mt-4">
              <Badge className={statusColors[creation.status]}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {creation.status.split('_').map(word => 
                  word.charAt(0).toUpperCase() + word.slice(1)
                ).join(' ')}
              </Badge>
              {creation.estimatedDuration && (
                <Badge variant="outline">{creation.estimatedDuration}</Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {creation.status === 'brainstorming' && (
              <Button onClick={() => onGeneratePlan(creation)}>
                <Code className="w-4 h-4 mr-2" />
                Generate Plan
              </Button>
            )}
            {creation.status === 'approved' && (
              <Button onClick={() => onStartBuilding(creation)}>
                <Play className="w-4 h-4 mr-2" />
                Start Building
              </Button>
            )}
            {creation.deploymentUrl && creation.status === 'completed' && (
              <Button asChild variant="outline">
                <a href={creation.deploymentUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View App
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDelete(creation)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {creation.totalSubtasks > 0 && (
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span>Overall Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
            <div className="text-sm text-muted-foreground mt-1">
              {creation.completedSubtasks} of {creation.totalSubtasks} subtasks completed
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {details?.creation.architecturePlan && (
              <TabsTrigger value="architecture">Architecture</TabsTrigger>
            )}
            {details?.tasks && details.tasks.length > 0 && (
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Created</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(creation.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Last Updated</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(creation.updatedAt).toLocaleDateString()}
                </p>
              </div>
              {creation.pageName && (
                <div>
                  <Label className="text-sm font-medium">Page Name</Label>
                  <p className="text-sm text-muted-foreground">{creation.pageName}</p>
                </div>
              )}
              {creation.deploymentUrl && (
                <div>
                  <Label className="text-sm font-medium">Deployment URL</Label>
                  <a
                    href={creation.deploymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {creation.deploymentUrl}
                  </a>
                </div>
              )}
            </div>
          </TabsContent>
          
          {details?.creation.architecturePlan && (
            <TabsContent value="architecture">
              <ScrollArea className="h-[400px]">
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm">
                    {details.creation.architecturePlan}
                  </pre>
                </div>
              </ScrollArea>
            </TabsContent>
          )}
          
          {details?.tasks && details.tasks.length > 0 && (
            <TabsContent value="tasks">
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {details.tasks.map((task) => {
                    const TaskIcon = statusIcons[task.status as keyof typeof statusIcons];
                    const taskSubtasks = details.subtasks.filter(st => st.taskId === task.id);
                    
                    return (
                      <Card key={task.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-base">{task.title}</CardTitle>
                              <CardDescription className="text-sm mt-1">
                                {task.description}
                              </CardDescription>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge className={statusColors[task.status]} variant="secondary">
                                  <TaskIcon className="w-3 h-3 mr-1" />
                                  {task.status.split('_').map(word => 
                                    word.charAt(0).toUpperCase() + word.slice(1)
                                  ).join(' ')}
                                </Badge>
                                <Badge variant="outline">{task.category}</Badge>
                                {task.estimatedDuration && (
                                  <Badge variant="outline">{task.estimatedDuration}</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        {taskSubtasks.length > 0 && (
                          <CardContent>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Subtasks</Label>
                              {taskSubtasks.map((subtask) => {
                                const SubtaskIcon = statusIcons[subtask.status as keyof typeof statusIcons];
                                return (
                                  <div key={subtask.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded">
                                    <SubtaskIcon className={`w-4 h-4 ${
                                      subtask.status === 'completed' ? 'text-green-600' :
                                      subtask.status === 'in_progress' ? 'text-blue-600' :
                                      subtask.status === 'failed' ? 'text-red-600' :
                                      'text-gray-400'
                                    }`} />
                                    <div className="flex-1">
                                      <p className="text-sm font-medium">{subtask.title}</p>
                                      <p className="text-xs text-muted-foreground">{subtask.description}</p>
                                    </div>
                                    {subtask.estimatedDuration && (
                                      <Badge variant="outline" className="text-xs">
                                        {subtask.estimatedDuration}
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}