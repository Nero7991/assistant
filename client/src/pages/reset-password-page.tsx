import React, { useState, useEffect } from 'react';
import { useLocation, Redirect } from "wouter";
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage
} from "@/components/ui/form";

const resetPasswordFormSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"], // Error applies to confirmPassword field
});

export default function ResetPasswordPage() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [, navigate] = useLocation(); // For redirecting after success
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Extract token from URL query parameters
    const queryParams = new URLSearchParams(window.location.search);
    const urlToken = queryParams.get('token');
    if (!urlToken) {
      setError("Password reset token not found in URL.");
    } else {
      setToken(urlToken);
    }
  }, [location]);

  const form = useForm<z.infer<typeof resetPasswordFormSchema>>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof resetPasswordFormSchema>) => {
    if (!token) return; // Should not happen if UI logic is correct

    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/reset-password", {
        token: token,
        password: data.password,
      });
      
      const result = await res.json(); // Read response body for message

      if (!res.ok) {
        throw new Error(result.message || "Failed to reset password");
      }
      
      setSuccess(true);
      toast({
        title: "Success!",
        description: result.message || "Password has been reset successfully.",
      });
      // Redirect to login after a short delay
      setTimeout(() => navigate("/auth"), 3000);

    } catch (error) {
      console.error("Reset password error:", error);
      setError(error instanceof Error ? error.message : "An unexpected error occurred.");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset Your Password</CardTitle>
          <CardDescription>
            {success 
              ? "Your password has been updated." 
              : "Enter your new password below."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && !success && (
            <div className="mb-4 rounded border border-destructive bg-red-50 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success ? (
            <div className="text-center">
              <p className="mb-4">You can now log in with your new password.</p>
              <Button onClick={() => navigate("/auth")}>Go to Login</Button>
            </div>
          ) : token ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="new-password">New Password</FormLabel>
                      <FormControl>
                        <Input id="new-password" type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="confirm-password">Confirm New Password</FormLabel>
                      <FormControl>
                        <Input id="confirm-password" type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Reset Password"}
                </Button>
              </form>
            </Form>
          ) : null /* Show nothing if token is missing and error is shown */}
        </CardContent>
      </Card>
    </div>
  );
} 