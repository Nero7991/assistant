import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCheckInSchema } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";

export function CheckInDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(insertCheckInSchema),
    defaultValues: {
      content: "",
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [response, setResponse] = useState<{
    message: string;
    nextCheckIn: string;
    actionItems: string[];
  } | null>(null);

  async function onSubmit(data: { content: string }) {
    try {
      setIsSubmitting(true);
      const res = await apiRequest("POST", "/api/checkins", data);
      const result = await res.json();
      setResponse(result.coachingResponse);
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
    } catch (error) {
      toast({
        title: "Check-in failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full sm:w-auto">
          Start Check-in
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Daily Check-in</DialogTitle>
        </DialogHeader>

        {!response ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="How are you doing today? What's on your mind?"
                        className="min-h-[150px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Getting Response...
                  </>
                ) : (
                  "Submit Check-in"
                )}
              </Button>
            </form>
          </Form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm">{response.message}</p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Action Items:</h4>
              <ul className="space-y-2">
                {response.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 mt-1 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-sm text-muted-foreground">
              Next check-in: {response.nextCheckIn}
            </div>

            <Button
              className="w-full"
              onClick={() => {
                setOpen(false);
                setResponse(null);
                form.reset();
              }}
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
