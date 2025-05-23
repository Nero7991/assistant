import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, useQueryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { Switch } from '@/components/ui/switch';

const settingsSchema = z.object({
  registration_slots_available: z.number().min(0).optional(),
  registration_globally_enabled: z.boolean().optional(),
  log_llm_prompts: z.boolean().optional(),
});

// Fetch function for admin settings
const fetchAdminSettings = async () => {
  const res = await apiRequest('GET', '/api/admin/settings');
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error('Forbidden: Administrator access required.');
    }
    throw new Error('Failed to fetch admin settings');
  }
  return settingsSchema.parse(await res.json());
};

// Update function for admin settings
const updateAdminSettings = async (settings: z.infer<typeof settingsSchema>) => {
  const res = await apiRequest('PATCH', '/api/admin/settings', settings);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || 'Failed to update settings');
  }
  return await res.json();
};

export default function AdminPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newSlotCount, setNewSlotCount] = useState<string>('');
  const [logPrompts, setLogPrompts] = useState<boolean>(false);

  // Fetch admin settings
  const { data: settings, isLoading: isLoadingSettings, error: fetchError, refetch } = useQuery({
    queryKey: ['adminSettings'],
    queryFn: fetchAdminSettings,
    enabled: !isAuthLoading && !!user, // Only run if user is loaded
    retry: false, // Don't retry on 403 or other fetch errors
  });
  
  // Update state when settings data is available
  useEffect(() => {
    if (settings) {
      setLogPrompts(settings.log_llm_prompts ?? false);
    }
  }, [settings]);

  // Mutation for updating settings
  const updateMutation = useMutation({
    mutationFn: updateAdminSettings,
    onSuccess: (data) => {
      toast({ title: 'Success', description: data.message });
      queryClient.invalidateQueries({ queryKey: ['adminSettings'] });
      setNewSlotCount(''); // Clear input
    },
    onError: (error) => {
      toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleUpdateSlots = () => {
    const parsedCount = parseInt(newSlotCount, 10);
    if (isNaN(parsedCount) || parsedCount < 0) {
      toast({ title: 'Invalid Input', description: 'Please enter a non-negative number.', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({ registration_slots_available: parsedCount });
  };

  const handleSavePromptLogSetting = () => {
    updateMutation.mutate({ log_llm_prompts: logPrompts });
  };

  // Loading state
  if (isAuthLoading || (isLoadingSettings && !fetchError)) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Handle unauthorized access or fetch errors
  if (fetchError) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{fetchError.message}</p>
            {fetchError.message.includes('Forbidden') && (
                 <p className="mt-2 text-sm text-muted-foreground">Ensure you are logged in with the admin account specified in the server's .env file.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Should not happen if enabled check works, but safeguard
  if (!user) {
     return <div className="p-4">Please log in.</div>;
  }

  // Render Admin Panel
  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Admin Settings</CardTitle>
          <CardDescription>Manage application settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Global Registration Status (Read-Only)</Label>
            <div className={`text-sm font-medium px-3 py-1 rounded-full inline-block ${settings && settings.registration_globally_enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {settings && settings.registration_globally_enabled ? 'ENABLED' : 'DISABLED'}
            </div>
            <p className="text-xs text-muted-foreground">
              Controlled by the REGISTRATION_ENABLED environment variable on the server.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Current Available Registration Slots</Label>
            <p className="text-2xl font-semibold">
              {settings && 'registration_slots_available' in settings ? settings.registration_slots_available : 'N/A'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slot-count">Set Available Registration Slots</Label>
            <div className="flex space-x-2">
              <Input 
                id="slot-count"
                type="number"
                min="0"
                placeholder="Enter new count" 
                value={newSlotCount}
                onChange={(e) => setNewSlotCount(e.target.value)}
                disabled={updateMutation.isPending}
              />
              <Button 
                onClick={handleUpdateSlots}
                disabled={updateMutation.isPending || !newSlotCount}
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Update'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
Enter the total number of new users allowed to register. Setting to 0 disables registration.
            </p>
          </div>

          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="log-prompts">Log Full LLM Prompts</Label>
                <p className="text-sm text-muted-foreground">
                  Save complete prompt text to files in `prompt_logs/` on the server.
                </p>
              </div>
              <Switch 
                id="log-prompts"
                checked={logPrompts}
                onCheckedChange={(checked) => {
                  setLogPrompts(checked);
                  updateMutation.mutate({ log_llm_prompts: checked });
                }}
                disabled={updateMutation.isPending}
                aria-label="Toggle LLM prompt logging"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 