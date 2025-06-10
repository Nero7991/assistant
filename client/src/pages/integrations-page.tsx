import React, { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, useQueryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Copy, RefreshCw, Trash2, Settings, ExternalLink, Webhook } from 'lucide-react';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// External service schema
const externalServiceSchema = z.object({
  id: z.number(),
  serviceName: z.string(),
  serviceSlug: z.string(),
  webhookUrl: z.string(),
  accessToken: z.string().optional(), // Only returned on creation
  rateLimit: z.number(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type ExternalService = z.infer<typeof externalServiceSchema>;

// Fetch external services
const fetchExternalServices = async (): Promise<ExternalService[]> => {
  const res = await apiRequest('GET', '/api/external-services');
  if (!res.ok) {
    throw new Error('Failed to fetch external services');
  }
  return await res.json();
};

// Create external service
const createExternalService = async (data: { serviceName: string; rateLimit?: number; metadata?: any }) => {
  const res = await apiRequest('POST', '/api/external-services', data);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to create service');
  }
  return await res.json();
};

// Update external service
const updateExternalService = async (id: number, data: { serviceName?: string; rateLimit?: number; isActive?: boolean; metadata?: any }) => {
  const res = await apiRequest('PUT', `/api/external-services/${id}`, data);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to update service');
  }
  return await res.json();
};

// Delete external service
const deleteExternalService = async (id: number) => {
  const res = await apiRequest('DELETE', `/api/external-services/${id}`);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to delete service');
  }
};

// Regenerate token
const regenerateToken = async (id: number) => {
  const res = await apiRequest('POST', `/api/external-services/${id}/regenerate-token`);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to regenerate token');
  }
  return await res.json();
};

// Access Token Dialog Component
function AccessTokenDialog({ 
  isOpen, 
  onClose, 
  token, 
  serviceName, 
  isNewService = false 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  token: string; 
  serviceName: string;
  isNewService?: boolean;
}) {
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(token);
    toast({ title: 'Copied!', description: 'Access token copied to clipboard.' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isNewService ? 'Service Created Successfully!' : 'New Access Token Generated'}
          </DialogTitle>
          <DialogDescription>
            {isNewService 
              ? `Your new service "${serviceName}" has been created. Here's your access token:`
              : `A new access token has been generated for "${serviceName}".`
            }
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Access Token</Label>
            <div className="flex gap-2 mt-2">
              <code className="flex-1 p-3 bg-muted rounded text-sm break-all font-mono">
                {token}
              </code>
              <Button size="sm" onClick={copyToClipboard}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              <strong>Important:</strong> This access token will only be shown once. Make sure to copy and store it securely.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            I've copied the token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create Service Dialog Component
function CreateServiceDialog({ onSuccess }: { onSuccess: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [rateLimit, setRateLimit] = useState('100');
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [newServiceData, setNewServiceData] = useState<{ serviceName: string; accessToken: string } | null>(null);
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: createExternalService,
    onSuccess: (data) => {
      setIsOpen(false);
      setServiceName('');
      setRateLimit('100');
      setNewServiceData({ serviceName: data.serviceName, accessToken: data.accessToken });
      setShowTokenDialog(true);
      onSuccess();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim()) {
      toast({ title: 'Error', description: 'Service name is required', variant: 'destructive' });
      return;
    }
    const rateLimitNum = parseInt(rateLimit, 10);
    if (isNaN(rateLimitNum) || rateLimitNum < 1) {
      toast({ title: 'Error', description: 'Rate limit must be a positive number', variant: 'destructive' });
      return;
    }
    createMutation.mutate({ serviceName: serviceName.trim(), rateLimit: rateLimitNum });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Integration
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create External Service Integration</DialogTitle>
            <DialogDescription>
              Create a new external service integration to send messages to your Kona account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="service-name">Service Name</Label>
                <Input
                  id="service-name"
                  placeholder="e.g., My App, GitHub Actions, etc."
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  disabled={createMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate-limit">Rate Limit (requests per hour)</Label>
                <Input
                  id="rate-limit"
                  type="number"
                  min="1"
                  placeholder="100"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  disabled={createMutation.isPending}
                />
                <p className="text-sm text-muted-foreground">
                  Maximum number of messages this service can send per hour.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Service
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {newServiceData && (
        <AccessTokenDialog
          isOpen={showTokenDialog}
          onClose={() => setShowTokenDialog(false)}
          token={newServiceData.accessToken}
          serviceName={newServiceData.serviceName}
          isNewService={true}
        />
      )}
    </>
  );
}

// Service Card Component
function ServiceCard({ service, onUpdate, onDelete, onRegenerateToken }: {
  service: ExternalService;
  onUpdate: () => void;
  onDelete: () => void;
  onRegenerateToken: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [serviceName, setServiceName] = useState(service.serviceName);
  const [rateLimit, setRateLimit] = useState(service.rateLimit.toString());
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [regeneratedToken, setRegeneratedToken] = useState<string>('');
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateExternalService(service.id, data),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Service updated successfully!' });
      setIsEditing(false);
      onUpdate();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteExternalService(service.id),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Service deleted successfully!' });
      onDelete();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateToken(service.id),
    onSuccess: (data) => {
      setRegeneratedToken(data.accessToken);
      setShowTokenDialog(true);
      onRegenerateToken();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: `${label} copied to clipboard.` });
  };

  const handleSave = () => {
    const rateLimitNum = parseInt(rateLimit, 10);
    if (isNaN(rateLimitNum) || rateLimitNum < 1) {
      toast({ title: 'Error', description: 'Rate limit must be a positive number', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({ serviceName: serviceName.trim(), rateLimit: rateLimitNum });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            {isEditing ? (
              <Input
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                className="text-lg font-semibold"
              />
            ) : (
              <CardTitle>{service.serviceName}</CardTitle>
            )}
            <CardDescription className="mt-1">
              Created: {new Date(service.createdAt).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  <Settings className="h-4 w-4" />
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                >
                  {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={deleteMutation.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Service</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{service.serviceName}"? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Webhook URL</Label>
          <div className="flex gap-2 mt-1">
            <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
              {service.webhookUrl}
            </code>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => copyToClipboard(service.webhookUrl, 'Webhook URL')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium">Rate Limit</Label>
            {isEditing ? (
              <Input
                type="number"
                min="1"
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value)}
                className="mt-1"
              />
            ) : (
              <p className="text-sm text-muted-foreground mt-1">{service.rateLimit} requests/hour</p>
            )}
          </div>
          <div>
            <Label className="text-sm font-medium">Status</Label>
            <p className={`text-sm mt-1 ${service.isActive ? 'text-green-600' : 'text-red-600'}`}>
              {service.isActive ? 'Active' : 'Inactive'}
            </p>
          </div>
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-medium mb-2">Usage Example</h4>
          <div className="bg-muted p-3 rounded text-sm">
            <code>
{`curl -X POST "${service.webhookUrl}" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hello from ${service.serviceName}!",
    "deliveryMethod": "all"
  }'`}
            </code>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            deliveryMethod can be: "text", "whatsapp", "email", or "all"
          </p>
        </div>
      </CardContent>
      
      {regeneratedToken && (
        <AccessTokenDialog
          isOpen={showTokenDialog}
          onClose={() => setShowTokenDialog(false)}
          token={regeneratedToken}
          serviceName={service.serviceName}
          isNewService={false}
        />
      )}
    </Card>
  );
}

export default function IntegrationsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();

  // Fetch external services
  const { data: services, isLoading, error, refetch } = useQuery({
    queryKey: ['externalServices'],
    queryFn: fetchExternalServices,
    enabled: !isAuthLoading && !!user,
  });

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['externalServices'] });
  };

  // Loading state
  if (isAuthLoading || isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{error.message}</p>
            <Button onClick={() => refetch()} className="mt-4">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">External Integrations</h1>
            <p className="text-muted-foreground mt-2">
              Manage external services that can send messages to your Kona account.
            </p>
          </div>
          <CreateServiceDialog onSuccess={handleUpdate} />
        </div>

        {services && services.length > 0 ? (
          <div className="grid gap-6">
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onUpdate={handleUpdate}
                onDelete={handleUpdate}
                onRegenerateToken={handleUpdate}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No integrations yet</h3>
              <p className="text-muted-foreground text-center mb-6">
                Create your first external service integration to start receiving messages from other applications.
              </p>
              <CreateServiceDialog onSuccess={handleUpdate} />
            </CardContent>
          </Card>
        )}

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Integration Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">How it works</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Create an external service integration to get a unique webhook URL and access token</li>
                <li>Use the webhook URL and access token in your external applications</li>
                <li>Send POST requests with a message and delivery method (text/whatsapp/email/all)</li>
                <li>Messages will be delivered to you with attribution: "Message from [Service Name]: [Your Message]"</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Security</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>All requests require Bearer token authentication</li>
                <li>Access tokens are only shown once upon creation - store them securely</li>
                <li>Rate limiting prevents abuse (configurable per service)</li>
                <li>You can regenerate access tokens at any time</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}