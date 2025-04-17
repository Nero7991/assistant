import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Available AI models
const AVAILABLE_MODELS = [
  { value: "o1-mini", label: "O1-mini (Default reasoning model)" },
  { value: "gpt-4o", label: "GPT-4o (OpenAI Latest)" },
  { value: "gpt-4o-mini", label: "GPT-4o-mini (OpenAI Reasoning)" },
  { value: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro (Google Latest)" },
  { value: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash (Google Faster)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo (OpenAI Previous)" },
  { value: "gpt-4", label: "GPT-4 (OpenAI Previous)" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (OpenAI Faster)" }
];

// List of common timezones
const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Kolkata", label: "Mumbai" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export default function AccountPage() {
  const { user, logoutMutation } = useAuth();
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [timeZone, setTimeZone] = useState<string>("");
  const [preferredMessageTime, setPreferredMessageTime] = useState<string>("");
  const [wakeTime, setWakeTime] = useState<string>("08:00");
  const [routineStartTime, setRoutineStartTime] = useState<string>("09:30");
  const [sleepTime, setSleepTime] = useState<string>("23:00");
  const [preferredModel, setPreferredModel] = useState<string>("o1-mini");
  const [allowEmail, setAllowEmail] = useState(false);
  const [allowPhone, setAllowPhone] = useState(false);
  
  // Get browser timezone on component mount
  useEffect(() => {
    if (user) {
      // Set form values based on user data
      try {
        // Use user's timezone if available, otherwise try to auto-detect
        const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        // Verify the timezone is valid before setting it
        new Date().toLocaleString('en-US', { timeZone: browserTimeZone });
        setTimeZone(user.timeZone || browserTimeZone);
      } catch (error) {
        // If there's an error with the timezone, set a default safe value
        console.error("Error setting timezone:", error);
        setTimeZone("UTC");
      }
      
      setPreferredMessageTime(user.preferredMessageTime || "08:00");
      setWakeTime(user.wakeTime || "08:00");
      setRoutineStartTime(user.routineStartTime || "09:30"); 
      setSleepTime(user.sleepTime || "23:00");
      setPreferredModel(user.preferredModel || "o1-mini");
      setAllowEmail(user.allowEmailNotifications || false);
      setAllowPhone(user.allowPhoneNotifications || false);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      
      // Validate time inputs
      const timeInputs = {
        wakeTime, 
        routineStartTime, 
        sleepTime, 
        preferredMessageTime
      };
      
      // Check if times are valid HH:MM format
      const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      for (const [key, value] of Object.entries(timeInputs)) {
        if (!timeRegex.test(value)) {
          throw new Error(`Invalid time format for ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}. Please use HH:MM format.`);
        }
      }
      
      // Call the API to update the user settings
      const response = await apiRequest("PATCH", "/api/user", {
        timeZone,
        preferredMessageTime,
        wakeTime,
        routineStartTime,
        sleepTime,
        preferredModel,
        allowEmailNotifications: allowEmail,
        allowPhoneNotifications: allowPhone
      });
      
      if (response.ok) {
        toast({
          title: "Settings saved",
          description: "Your account settings have been updated"
        });
        
        // Refresh user data
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to update settings");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivateAccount = async () => {
    if (confirmText !== "DEACTIVATE") {
      toast({
        title: "Confirmation required",
        description: "Please type DEACTIVATE to confirm account deactivation",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDeactivating(true);
      
      // Call the API to deactivate the account
      const response = await apiRequest("POST", "/api/user/deactivate");
      
      if (response.ok) {
        toast({
          title: "Account deactivated",
          description: "Your account has been successfully deactivated",
        });
        
        // Force logout after deactivation
        logoutMutation.mutate();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to deactivate account");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-6">Account Settings</h1>
      
      <div className="grid gap-6">
        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>View and manage your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[100px_1fr] items-center">
              <Label htmlFor="username">Username</Label>
              <div id="username" className="font-medium">{user.username}</div>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center">
              <Label htmlFor="email">Email</Label>
              <div id="email" className="font-medium">
                {user.email}
                {user.isEmailVerified ? (
                  <span className="ml-2 text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">Verified</span>
                ) : (
                  <span className="ml-2 text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full">Not Verified</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center">
              <Label htmlFor="phone">Phone</Label>
              <div id="phone" className="font-medium">
                {user.phoneNumber || "Not provided"}
                {user.phoneNumber && user.isPhoneVerified ? (
                  <span className="ml-2 text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">Verified</span>
                ) : user.phoneNumber ? (
                  <span className="ml-2 text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full">Not Verified</span>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Time and Location Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Time and Location Settings</CardTitle>
            <CardDescription>Manage your timezone and scheduling preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="time-zone" className="flex items-center gap-2">
                  Time Zone
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={16} className="text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="w-60">Your timezone is used to ensure all schedules and notifications are displayed in your local time.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
              <Select
                value={timeZone}
                onValueChange={setTimeZone}
              >
                <SelectTrigger id="time-zone" className="w-full">
                  <SelectValue placeholder="Select your timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {timeZone && (
                <p className="text-xs text-muted-foreground mt-1">
                  Current time in selected zone: {new Date().toLocaleString("en-US", { timeZone })}
                </p>
              )}
            </div>
            
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="preferred-time" className="flex items-center gap-2">
                  Preferred Message Time
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={16} className="text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="w-60">The time of day when you prefer to receive your daily schedule and notifications.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
              <Input 
                id="preferred-time"
                type="time"
                value={preferredMessageTime}
                onChange={(e) => setPreferredMessageTime(e.target.value)}
              />
            </div>

            <h3 className="text-lg font-semibold pt-2">Daily Schedule Preferences</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wake-time" className="flex items-center gap-2">
                    Wake Up Time
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info size={16} className="text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="w-60">The time you typically wake up each day.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                </div>
                <Input 
                  id="wake-time"
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="routine-start-time" className="flex items-center gap-2">
                    Routine Start Time
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info size={16} className="text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="w-60">The time you start your daily routine (after morning essentials).</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                </div>
                <Input 
                  id="routine-start-time"
                  type="time"
                  value={routineStartTime}
                  onChange={(e) => setRoutineStartTime(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sleep-time" className="flex items-center gap-2">
                    Sleep Time
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info size={16} className="text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="w-60">The time you typically go to bed each night.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                </div>
                <Input 
                  id="sleep-time"
                  type="time"
                  value={sleepTime}
                  onChange={(e) => setSleepTime(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleSaveSettings}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* AI Model Settings */}
        <Card>
          <CardHeader>
            <CardTitle>AI Model Settings</CardTitle>
            <CardDescription>Configure the AI model used for coaching and scheduling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="ai-model" className="flex items-center gap-2">
                  Preferred AI Model
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={16} className="text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="w-96">Choose which AI model to use for all interactions:
                        <br />• O1-mini: Default reasoning model (recommended)
                        <br />• GPT-4o / GPT-4o-mini: OpenAI's latest models.
                        <br />• Gemini 1.5 Pro / Flash: Google's latest models.
                        <br />• GPT-4/Turbo/3.5: Older OpenAI models.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
              <Select
                value={preferredModel}
                onValueChange={setPreferredModel}
              >
                <SelectTrigger id="ai-model" className="w-full">
                  <SelectValue placeholder="Select AI model" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map((model) => (
                    <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleSaveSettings}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Model Setting"
              )}
            </Button>
          </CardFooter>
        </Card>
        
        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Settings</CardTitle>
            <CardDescription>Choose how you receive reminders and updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-notifications">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive reminders and summaries via email.
                </p>
              </div>
              <Switch 
                id="email-notifications" 
                checked={allowEmail}
                onCheckedChange={setAllowEmail}
                aria-label="Toggle email notifications" 
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="phone-notifications">WhatsApp/SMS Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive reminders and interact via WhatsApp/SMS (if phone provided & verified).
                </p>
              </div>
              <Switch 
                id="phone-notifications" 
                checked={allowPhone}
                onCheckedChange={setAllowPhone}
                aria-label="Toggle phone notifications" 
                disabled={!user.phoneNumber || !user.isPhoneVerified}
              />
            </div>
          </CardContent>
          <CardFooter className="border-t pt-6">
            <Button onClick={handleSaveSettings} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Notification & Time Preferences
            </Button>
          </CardFooter>
        </Card>
        
        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader className="border-b border-red-200">
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
            <CardDescription>
              Actions in this section can permanently affect your account
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <h3 className="font-semibold">Deactivate Account</h3>
              <p className="text-sm text-muted-foreground">
                This will deactivate your account and stop all notifications. Your data will be preserved but you won't be able to log in until you contact support.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Deactivate Account</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action will deactivate your account and stop all notifications. Your data will be preserved, but you'll need to contact support to reactivate your account.
                    <div className="mt-4">
                      <Label htmlFor="confirm-deactivate" className="text-sm font-medium">
                        Type DEACTIVATE to confirm:
                      </Label>
                      <Input
                        id="confirm-deactivate"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeactivateAccount}
                    disabled={isDeactivating || confirmText !== "DEACTIVATE"}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isDeactivating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deactivating...
                      </>
                    ) : (
                      "Deactivate"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}