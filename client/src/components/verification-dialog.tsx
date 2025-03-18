import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { verificationCodeSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface VerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onSkip?: () => void;
  title: string;
  description?: string;
  type: "email" | "phone";
  showSkip?: boolean;
}

export function VerificationDialog({
  open,
  onOpenChange,
  onSuccess,
  onSkip,
  title,
  description,
  type,
  showSkip = false,
}: VerificationDialogProps) {
  const { toast } = useToast();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const form = useForm({
    resolver: zodResolver(verificationCodeSchema),
    defaultValues: {
      code: "",
    },
  });

  // Add debug logging for state changes
  console.log(`VerificationDialog render - type: ${type}, open: ${open}, isVerifying: ${isVerifying}`);

  const onSubmit = async (data: { code: string }) => {
    try {
      console.log(`Submitting verification code for ${type}:`, data.code);
      setIsVerifying(true);

      const res = await apiRequest("POST", "/api/verify-contact", {
        code: data.code,
        type
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(responseData.message || "Failed to verify code");
      }

      console.log(`${type} verification response:`, responseData);

      // Ensure user data is refreshed
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      const updatedUser = await queryClient.fetchQuery({ queryKey: ["/api/user"] });

      // Log authentication and verification state after verification
      console.log("=== Authentication Debug Info ===");
      console.log("1. Updated User State:", updatedUser);
      console.log("2. Query Cache State:", {
        userQueryData: queryClient.getQueryData(["/api/user"]),
        queryState: queryClient.getQueryState(["/api/user"])
      });
      console.log("3. Verification Status:", {
        type,
        isEmailVerified: updatedUser?.isEmailVerified,
        isPhoneVerified: updatedUser?.isPhoneVerified,
      });
      console.log("4. Session Info:", {
        hasUser: !!updatedUser,
        isAuthenticated: !!updatedUser,
      });
      console.log("=============================");

      toast({
        title: "Verification successful",
        description: `Your ${type} has been verified.`
      });

      onSuccess();
    } catch (error) {
      console.error(`${type} verification failed:`, error);
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Failed to verify code",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    try {
      console.log(`Resending verification code for ${type}`);
      setIsResending(true);

      const res = await apiRequest("POST", "/api/resend-verification", {
        type
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to resend code");
      }

      console.log(`Verification code resent for ${type}`);
      toast({
        title: "Code resent",
        description: `A new verification code has been sent to your ${type}.`
      });
    } catch (error) {
      console.error(`Failed to resend ${type} verification code:`, error);
      toast({
        title: "Failed to resend code",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  if (!open) {
    console.log(`${type} verification dialog is closed`);
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={`${type}-verification-dialog`}
        className="sm:max-w-[425px]"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter verification code"
                      type="text"
                      maxLength={6}
                      data-testid={`${type}-verification-code-input`}
                      aria-label={`${type} verification code`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                disabled={isVerifying}
                data-testid={`${type}-verify-button`}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleResend}
                disabled={isResending}
                data-testid={`${type}-resend-button`}
              >
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resending...
                  </>
                ) : (
                  "Resend Code"
                )}
              </Button>

              {showSkip && onSkip && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onSkip}
                  data-testid={`${type}-skip-button`}
                >
                  Skip for now
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}