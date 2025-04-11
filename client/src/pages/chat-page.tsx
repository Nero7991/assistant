import { ChatInterface } from "@/components/chat-interface";

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col overflow-hidden">
      <ChatInterface />
    </div>
  );
}