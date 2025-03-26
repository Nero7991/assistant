import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export default function AccountPage() {
  const { user, logoutMutation } = useAuth();
  const [isDeactivating, setIsDeactivating] = useState(false);
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

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

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Settings</CardTitle>
            <CardDescription>Manage how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-notifications">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive coaching tips and reminders via email
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={user.allowEmailNotifications}
                disabled={!user.isEmailVerified}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="phone-notifications">WhatsApp/SMS Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive coaching messages and reminders via WhatsApp or SMS
                </p>
              </div>
              <Switch
                id="phone-notifications"
                checked={user.allowPhoneNotifications}
                disabled={!user.isPhoneVerified}
              />
            </div>
          </CardContent>
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