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
  DialogPortal,
  DialogOverlay,
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

  async function onSubmit(data: { code: string }) {
    try {
      setIsVerifying(true);
      const res = await apiRequest("POST", "/api/verify-contact", { code: data.code, type });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.message || "Failed to verify code");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Verification successful",
        description: `Your ${type} has been verified.`,
      });
      onSuccess();
    } catch (error) {
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

      if (!res.ok) {
        throw new Error(result.message || "Failed to resend code");
      }

      toast({
        title: "Code resent",
        description: `A new verification code has been sent to your ${type}.`,
      });
    } catch (error) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80" />
        <DialogContent
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-testid={`${type}-verification-dialog`}
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg bg-background p-6 shadow-lg"
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
                        placeholder="Enter 6-digit code"
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
                  aria-label={`Verify ${type}`}
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
                  aria-label={`Resend ${type} verification code`}
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
                    aria-label={`Skip ${type} verification`}
                  >
                    Skip for now
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}