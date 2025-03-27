import { ChatInterface } from "@/components/chat-interface";

export default function ChatPage() {
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">Chat with your ADHD Coach</h1>
      <p className="text-muted-foreground mb-8">
        Chat with your ADHD coach just like you would on WhatsApp. Get help with scheduling,
        task management, and staying on track with your goals.
      </p>
      
      <ChatInterface />
    </div>
  );
}