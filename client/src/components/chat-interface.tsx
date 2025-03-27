import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Bot, UserCircle2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  
  // Fetch chat history
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    queryFn: async () => {
      const res = await fetch("/api/messages");
      if (!res.ok) throw new Error("Failed to fetch chat history");
      return res.json();
    }
  });
  
  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: (data) => {
      // Add both messages to the local cache immediately for a smoother UX
      // This way we don't have to wait for the next refetch
      const currentMessages = queryClient.getQueryData<Message[]>(["/api/messages"]) || [];
      queryClient.setQueryData(["/api/messages"], [
        ...currentMessages,
        data.userMessage,
        data.assistantMessage
      ]);
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
  
  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] border rounded-lg overflow-hidden bg-background">
      {/* Chat header */}
      <div className="px-4 py-3 border-b flex items-center gap-2 bg-muted/30">
        <Bot className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">ADHD Coach</h3>
      </div>
      
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground pt-10">
            <p>No messages yet. Say hello to your ADHD coach!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={cn(
                "flex max-w-[80%] items-start gap-2",
                msg.sender === 'user' ? "ml-auto" : "mr-auto"
              )}
            >
              {msg.sender === 'assistant' && (
                <div className="flex-shrink-0 mt-1">
                  <Bot className="h-8 w-8 p-1 rounded-full bg-primary/10 text-primary" />
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
                <div className="whitespace-pre-wrap">{msg.content}</div>
                <div className={cn(
                  "text-xs mt-1",
                  msg.sender === 'user' ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
              
              {msg.sender === 'user' && (
                <div className="flex-shrink-0 mt-1">
                  <UserCircle2 className="h-8 w-8 p-1 text-primary" />
                </div>
              )}
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