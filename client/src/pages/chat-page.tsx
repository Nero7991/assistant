import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Send, Calendar } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface Message {
  id: number;
  userId: number;
  direction: 'incoming' | 'outgoing';
  content: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  
  // Fetch message history
  const { data: messages, isLoading, refetch } = useQuery<Message[]>({
    queryKey: ["/api/message-history"],
    enabled: !!user,
    refetchInterval: 10000, // Refresh every 10 seconds for new messages
  });
  
  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/chat/send", { message: content });
      return await res.json();
    },
    onSuccess: () => {
      setMessage("");
      // Refetch messages after a short delay to ensure the new message is included
      setTimeout(() => {
        refetch();
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Reschedule day mutation
  const rescheduleDayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/chat/reschedule-day", {});
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Day rescheduled",
        description: "Your day has been rescheduled. Check the chat for your new schedule.",
      });
      // Refetch messages after a short delay to ensure the new message is included
      setTimeout(() => {
        refetch();
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to reschedule day",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle sending a message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() === "") return;
    
    sendMessageMutation.mutate(message);
  };
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);
  
  // Render message bubbles
  const renderMessages = () => {
    if (!messages || messages.length === 0) {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <p className="text-muted-foreground text-center">
            No messages yet. Send a message to start a conversation with your ADHD coach!
          </p>
        </div>
      );
    }
    
    // Sort messages by date (oldest first)
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    return sortedMessages.map((msg) => {
      const isOutgoing = msg.direction === 'outgoing';
      const time = formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true });
      
      return (
        <div
          key={msg.id}
          className={`flex ${isOutgoing ? "justify-end" : "justify-start"} mb-4`}
        >
          <div
            className={`max-w-[80%] rounded-lg p-3 ${
              isOutgoing
                ? "bg-primary text-primary-foreground rounded-br-none"
                : "bg-muted rounded-bl-none"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
            <p className={`text-xs mt-1 ${isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
              {time}
            </p>
          </div>
        </div>
      );
    });
  };
  
  return (
    <div className="container mx-auto p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Chat with Your ADHD Coach</h1>
        <Button
          variant="outline"
          onClick={() => rescheduleDayMutation.mutate()}
          disabled={rescheduleDayMutation.isPending}
          className="flex gap-2 items-center"
        >
          {rescheduleDayMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Calendar className="h-4 w-4" />
          )}
          <span>Reschedule Day</span>
        </Button>
      </div>
      
      <Card className="flex-1 flex flex-col overflow-hidden p-0 mb-4">
        {/* Chat header with info about scheduling */}
        <div className="bg-muted/40 border-b px-4 py-2 text-sm text-muted-foreground">
          <p>Need to adjust your schedule? Use the "Reschedule Day" button to create a new plan or send a message.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-12 w-3/4 ml-auto" />
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-12 w-3/4 ml-auto" />
            </div>
          ) : (
            renderMessages()
          )}
          {rescheduleDayMutation.isPending && (
            <div className="flex justify-center py-2">
              <div className="flex items-center gap-2 text-muted-foreground bg-muted px-3 py-1 rounded-full text-sm">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Rescheduling your day...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <form 
          onSubmit={handleSendMessage}
          className="p-4 border-t flex gap-2"
        >
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            disabled={sendMessageMutation.isPending || rescheduleDayMutation.isPending}
            className="flex-1"
          />
          <Button 
            type="submit"
            disabled={sendMessageMutation.isPending || rescheduleDayMutation.isPending || !message.trim()}
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="ml-2">Send</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}