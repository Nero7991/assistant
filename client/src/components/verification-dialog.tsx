import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { verificationCodeSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
  const { user } = useAuth();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const form = useForm({
    resolver: zodResolver(verificationCodeSchema),
    defaultValues: {
      code: "",
    },
  });

  async function onSubmit(data: { code: string }) {
    try {
      console.log("Attempting verification with:", { code: data.code, type, userId: user?.id });
      setIsVerifying(true);

      // First check if we're authenticated
      const checkSession = await apiRequest("GET", "/api/debug-session");
      console.log("Session check before verification:", await checkSession.json());

      const res = await apiRequest("POST", "/api/verify-contact", { code: data.code, type });
      const result = await res.json();

      console.log("Verification response:", result);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });

      toast({
        title: "Verification successful",
        description: `Your ${type} has been verified.`,
      });
      onSuccess();
    } catch (error) {
      console.error("Verification error:", error);
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Failed to verify code",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    try {
      setIsResending(true);
      const res = await apiRequest("POST", "/api/resend-verification", { type });
      const result = await res.json();

      console.log("Resend response:", result);

      toast({
        title: "Code resent",
        description: `A new verification code has been sent to your ${type}.`,
      });
    } catch (error) {
      console.error("Resend error:", error);
      toast({
        title: "Failed to resend code",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent>
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
                      placeholder="Enter 6-digit code"
                      type="text"
                      maxLength={6}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={isVerifying}>
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