import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  direction: 'incoming' | 'outgoing';
  content: string;
  createdAt: string;
  type?: string;
  hasScheduleUpdates?: boolean;
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export default function TestMessagesPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Trigger a chat message from the coach
  const triggerMutation = useMutation({
    mutationFn: async (timeOfDay: TimeOfDay) => {
      const res = await apiRequest('POST', '/api/test/chat/trigger', { timeOfDay });
      return res.json();
    },
    onSuccess: (data: Message) => {
      setMessages(prev => [...prev, data]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to trigger test message: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Send a response message
  const responseMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest('POST', '/api/test/chat/respond', { message });
      return res.json();
    },
    onSuccess: (data: { userMessage: Message, coachResponse: Message }) => {
      setMessages(prev => [...prev, data.userMessage, data.coachResponse]);
      setNewMessage(''); // Clear input
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to send message: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const handleTrigger = () => {
    triggerMutation.mutate(timeOfDay);
  };

  const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newMessage.trim()) {
      responseMutation.mutate(newMessage);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter without Shift
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (newMessage.trim()) {
        responseMutation.mutate(newMessage);
      }
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Message Testing Chat</h1>
          <p className="text-muted-foreground">
            Test the ADHD Coach messaging system with a simulated conversation.
          </p>
        </div>
        <Button variant="outline" onClick={clearChat}>
          Clear Chat
        </Button>
      </div>

      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Test Chat</CardTitle>
              <CardDescription>
                Start a conversation to test messaging formats
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeOfDay} onValueChange={(value: TimeOfDay) => setTimeOfDay(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Time of day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                size="sm" 
                onClick={handleTrigger} 
                disabled={triggerMutation.isPending}
              >
                {triggerMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Clock className="mr-2 h-4 w-4" />
                    Trigger Test
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Chat Messages */}
          <div 
            ref={chatContainerRef}
            className="flex flex-col p-4 gap-3 h-[400px] overflow-y-auto border-y"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p>No messages yet.</p>
                <p>Trigger a test message or start typing below to begin.</p>
              </div>
            ) : (
              messages.map((message) => (
                <div 
                  key={message.id} 
                  className={cn(
                    "max-w-[80%] rounded-lg p-3 whitespace-pre-wrap",
                    message.direction === 'incoming' 
                      ? "bg-muted self-start rounded-bl-none" 
                      : "bg-primary text-primary-foreground self-end rounded-br-none"
                  )}
                >
                  {message.content}
                  {message.hasScheduleUpdates && (
                    <div className="text-xs mt-1 text-yellow-500 font-medium">
                      *Contains schedule updates
                    </div>
                  )}
                </div>
              ))
            )}
            {(triggerMutation.isPending || responseMutation.isPending) && (
              <div className="self-start flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Generating response...</span>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="p-4">
            <div className="flex gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message here..."
                className="flex-1 min-h-[60px] resize-none"
                disabled={responseMutation.isPending}
              />
              <Button 
                type="submit" 
                size="icon" 
                className="h-auto"
                disabled={!newMessage.trim() || responseMutation.isPending}
              >
                {responseMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}