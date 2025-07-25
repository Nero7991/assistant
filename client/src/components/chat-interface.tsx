import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Bot, UserCircle2, RefreshCw, Calendar, ThumbsUp, ThumbsDown, AlertCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  metadata?: any;
}

export function ChatInterface() {
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Fetch chat history
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    queryFn: async () => {
      const res = await fetch("/api/messages");
      if (!res.ok) throw new Error("Failed to fetch chat history");
      return res.json();
    }
  });
  
  // We're now using natural language detection for confirmation
  // No need to manage confirmation state anymore
  
  // Reschedule day mutation
  const rescheduleDayMutation = useMutation({
    mutationFn: async (confirmationOption?: { confirmation: 'confirm' | 'reject' }) => {
      const res = await fetch("/api/messages/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: confirmationOption ? JSON.stringify(confirmationOption) : undefined
      });
      if (!res.ok) throw new Error("Failed to reschedule day");
      return res.json();
    },
    onSuccess: (data) => {
      // Add the assistant message to the local cache immediately
      const currentMessages = queryClient.getQueryData<Message[]>(["/api/messages"]) || [];
      
      // Clean up the confirmation marker from the display if it exists
      const updatedMessage = {
        ...data.systemMessage,
        content: data.systemMessage.content.replace("PROPOSED_SCHEDULE_AWAITING_CONFIRMATION", "")
      };
      
      queryClient.setQueryData(["/api/messages"], [
        ...currentMessages,
        updatedMessage
      ]);
      
      toast({
        title: "Day Rescheduled",
        description: "Your schedule has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error rescheduling day",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Send message mutation (using synchronous endpoint)
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      // Use the new synchronous endpoint
      const res = await fetch("/api/chat/sync-response", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content })
      });
      
      if (!res.ok) {
        let errorMsg = "Failed to send message";
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg; 
        } catch (e) { /* Ignore parsing error */ }
        console.error(`Error sending message: Status ${res.status}, Message: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // Expect { assistantMessage: "..." } on success
      const responseData = await res.json(); 
      if (!responseData || typeof responseData.assistantMessage !== 'string') {
           console.error("Invalid response structure from /api/chat/sync-response:", responseData);
           throw new Error("Received an invalid response from the server.");
      }
      
      // Return the user message and the received assistant message for onSuccess
      return { 
        userMessageContent: content, 
        assistantMessageContent: responseData.assistantMessage 
      };
    },
    onSuccess: (data) => {
      // Restore manual cache update for immediate UI feedback
      const currentMessages = queryClient.getQueryData<Message[]>(["/api/messages"]) || [];
      const now = new Date().toISOString();
      const userMsgForCache: Message = {
          id: `temp-user-${Date.now()}`,
          content: data.userMessageContent,
          sender: 'user',
          timestamp: now
      };
      const assistantMsgForCache: Message = {
          id: `temp-assistant-${Date.now()}`,
          content: data.assistantMessageContent,
          sender: 'assistant',
          timestamp: now
      };
      queryClient.setQueryData(["/api/messages"], [
        ...currentMessages,
        userMsgForCache,
        assistantMsgForCache
      ]);
      console.log("Sync message success. Manually updated cache.");
     
       // Remove immediate invalidation to prevent race condition
       // queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
       // console.log("Sync message success. Invalidating messages query to refetch.", data);
    },
    onError: (error: Error) => {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Scroll to bottom whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  const handleSendMessage = () => {
    if (!message.trim()) return;
    
    sendMessageMutation.mutate(message);
    setMessage("");
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Function to clean up confirmation markers and format JSON responses for display purposes
  const cleanMessageContent = (content: string): string => {
    // First clean up confirmation markers
    let cleanContent = content.replace("PROPOSED_SCHEDULE_AWAITING_CONFIRMATION", "");
    
    // Check if the content might be JSON (heuristic check)
    const looksLikeJson = cleanContent.trim().startsWith("{") && cleanContent.trim().endsWith("}");

    if (looksLikeJson && (cleanContent.includes('"function_call"') || cleanContent.includes('"scheduleUpdates"') || cleanContent.includes('"scheduledMessages"'))) {
      try {
        // Try to parse the content as JSON
        const parsed = JSON.parse(cleanContent);
        
        // If parsing succeeds, check the message field
        if (parsed && typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
          // Return the actual message if it's a non-empty string
          return parsed.message;
        } else if (parsed && parsed.function_call) {
            // If message is null/empty but there was a function call, show a system action message
            return `[System action: Called function '${parsed.function_call.name}']`; // Or simply hide these?
        } else {
            // If message is null/empty and no function call, show a generic placeholder
            console.warn("Parsed JSON message content was null or empty:", cleanContent); 
            return "[System message processed]"; // Or potentially hide completely?
        }
      } catch (error) {
        console.log("Failed to parse potential JSON content, showing raw:", error);
        // If parsing fails, fall through to return the original (cleaned) content
      }
    }
    
    // Return original content if it doesn't look like actionable JSON or if parsing failed
    return cleanContent;
  };
  
  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden bg-background">
      {/* Chat header */}
      <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Kona</h3>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => rescheduleDayMutation.mutate(undefined)}
          disabled={rescheduleDayMutation.isPending}
          className="flex items-center gap-1"
        >
          {rescheduleDayMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span>Reschedule Day</span>
        </Button>
      </div>
      
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground pt-10">
            <p>No messages yet. Say hello to Kona!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={cn(
                "flex max-w-[80%] items-start gap-2",
                msg.sender === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              {msg.sender === 'assistant' && (
                <div className="flex-shrink-0 mt-1">
                  <Bot className="h-8 w-8 p-1 rounded-full bg-primary/10 text-primary" />
                </div>
              )}
              
              {msg.sender === 'user' && (
                <div className="flex-shrink-0 mt-1">
                  <UserCircle2 className="h-8 w-8 p-1 text-primary" />
                </div>
              )}

              <div 
                className={cn(
                  "rounded-lg p-3",
                  msg.sender === 'user' 
                    ? "bg-primary text-primary-foreground rounded-tr-none" 
                    : "bg-muted rounded-tl-none"
                )}
              >
                <div className="whitespace-pre-wrap">{cleanMessageContent(msg.content)}</div>
                
                {/* No Schedule detection rendering block */}
                
                {/* No confirmation buttons needed - using natural language detection */}
                
                <div className={cn(
                  "text-xs mt-1",
                  msg.sender === 'user' ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input area */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1"
            disabled={sendMessageMutation.isPending}
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={!message.trim() || sendMessageMutation.isPending}
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </div>
    </div>
  );
}