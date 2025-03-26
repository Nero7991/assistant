import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface MessageResponse {
  message: string;
}

export default function TestMessagesPage() {
  const { toast } = useToast();

  const {
    data: morningMessage,
    isLoading: isMorningLoading,
    refetch: refetchMorning
  } = useQuery<MessageResponse>({
    queryKey: ["/api/examples/morning-message"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: false, // Don't fetch automatically
  });

  const {
    data: followUpMessage,
    isLoading: isFollowUpLoading,
    refetch: refetchFollowUp
  } = useQuery<MessageResponse>({
    queryKey: ["/api/examples/follow-up-message"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: false, // Don't fetch automatically
  });

  const generateMorningMessage = async () => {
    try {
      await refetchMorning();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate morning message example",
        variant: "destructive",
      });
    }
  };

  const generateFollowUpMessage = async () => {
    try {
      await refetchFollowUp();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate follow-up message example",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <h1 className="text-3xl font-bold">Message Format Examples</h1>
      <p className="text-muted-foreground">
        Test the different message formats used by the ADHD Coach application.
        These examples use your actual user data to generate personalized messages.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Morning Message */}
        <Card>
          <CardHeader>
            <CardTitle>Morning Message</CardTitle>
            <CardDescription>
              The daily schedule message sent to users each morning
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={generateMorningMessage} 
              disabled={isMorningLoading}
              className="w-full"
            >
              {isMorningLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Morning Message Example"
              )}
            </Button>
            
            {morningMessage && (
              <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap">
                {morningMessage.message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Follow-up Message */}
        <Card>
          <CardHeader>
            <CardTitle>Follow-up Message</CardTitle>
            <CardDescription>
              Check-in messages sent throughout the day
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={generateFollowUpMessage} 
              disabled={isFollowUpLoading}
              className="w-full"
            >
              {isFollowUpLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Follow-up Message Example"
              )}
            </Button>
            
            {followUpMessage && (
              <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap">
                {followUpMessage.message}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}