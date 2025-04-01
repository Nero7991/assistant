import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ScheduleConfirmationDialog } from "./schedule-confirmation-dialog";

interface ScheduleItem {
  title: string;
  startTime: string;
  endTime?: string;
  taskId?: number;
}

interface ParsedSchedule {
  scheduleItems: ScheduleItem[];
  rawScheduleText: string;
}

interface ScheduleDetectionProps {
  messageContent: string;
  messageId: string;
  userId: number;
}

export function ScheduleDetection({ messageContent, messageId, userId }: ScheduleDetectionProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [scheduleData, setScheduleData] = useState<{
    scheduleId: number | null;
    items: ScheduleItem[];
    rawText: string;
  }>({
    scheduleId: null,
    items: [],
    rawText: "",
  });
  const { toast } = useToast();

  const scheduleFromLLMMutation = useMutation({
    mutationFn: async (llmResponse: string) => {
      console.log("Sending LLM response to be parsed for schedule:", {
        responseLength: llmResponse.length,
        preview: llmResponse.substring(0, 100) + "..."
      });
      
      const res = await fetch("/api/daily-schedules/from-llm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ llmResponse }),
      });

      console.log("Schedule parsing response status:", res.status);
      
      if (!res.ok) {
        const errorData = await res.json();
        console.error("Schedule parsing API error:", errorData);
        throw new Error(errorData.error || "Failed to parse schedule");
      }

      const responseData = await res.json();
      console.log("Schedule parsing successful:", responseData);
      return responseData;
    },
    onSuccess: (data) => {
      console.log("Schedule mutation successful, invalidating queries");
      queryClient.invalidateQueries({ queryKey: ["/api/daily-schedules"] });
      
      toast({
        title: "Schedule detected",
        description: `${data.parsedItems} schedule items were found. Please confirm your schedule.`,
      });

      console.log("Fetching schedule items for ID:", data.scheduleId);
      // Fetch the schedule items
      fetchScheduleItems(data.scheduleId);
    },
    onError: (error: Error) => {
      console.error("Error parsing schedule:", error);
      toast({
        title: "Could not create schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchScheduleItems = async (scheduleId: number) => {
    try {
      console.log(`Fetching schedule items for schedule ID: ${scheduleId}`);
      
      // Fetch both the schedule and its items
      console.log("Making API requests for schedule data...");
      const schedulePromise = fetch(`/api/daily-schedules/${scheduleId}`);
      const itemsPromise = fetch(`/api/daily-schedules/${scheduleId}/items`);
      
      // Use individual promises with better error handling
      const scheduleRes = await schedulePromise;
      console.log(`Schedule API response status: ${scheduleRes.status}`);
      
      const itemsRes = await itemsPromise;
      console.log(`Schedule items API response status: ${itemsRes.status}`);

      if (!scheduleRes.ok) {
        console.error(`Schedule API error: ${scheduleRes.status} ${scheduleRes.statusText}`);
        const errorData = await scheduleRes.text();
        console.error("Schedule API error response:", errorData);
        throw new Error(`Failed to fetch schedule: ${scheduleRes.status} ${scheduleRes.statusText}`);
      }
      
      if (!itemsRes.ok) {
        console.error(`Items API error: ${itemsRes.status} ${itemsRes.statusText}`);
        const errorData = await itemsRes.text();
        console.error("Items API error response:", errorData);
        throw new Error(`Failed to fetch schedule items: ${itemsRes.status} ${itemsRes.statusText}`);
      }

      console.log("Successfully received API responses, parsing JSON...");
      const schedule = await scheduleRes.json();
      const items = await itemsRes.json();
      
      console.log("Schedule data:", schedule);
      console.log(`Received ${items.length} schedule items`);

      setScheduleData({
        scheduleId,
        items,
        rawText: schedule.originalContent || "",
      });
      
      console.log("Showing schedule confirmation dialog");
      setShowDialog(true);
    } catch (error) {
      console.error("Error fetching schedule items:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load schedule details",
        variant: "destructive",
      });
    }
  };

  // We want to use a ref to track the first render to avoid processing messages during initial load
  const isInitialRenderRef = useRef(true);
  const processedMessagesRef = useRef<Record<string, boolean>>({});
  
  useEffect(() => {
    // Check for various schedule markers in the message content
    const SCHEDULE_MARKERS = [
      "The final schedule is as follows:",
      "Here's your updated plan:",
      "Here's a proposed schedule",
      "I've adjusted your schedule"
    ];
    
    // Create a storage key using the messageId which is much more reliable than content hashing
    const storageKey = `processed_schedule_${messageId}`;
    
    // Skip processing on the initial render to avoid parsing old messages when loading chat history
    if (isInitialRenderRef.current) {
      console.log(`Initial render for message ${messageId}, skipping schedule processing`);
      isInitialRenderRef.current = false;
      
      // Mark this message as processed on first render
      processedMessagesRef.current[messageId] = true;
      sessionStorage.setItem(storageKey, "true");
      return;
    }
    
    // Debug log for message detection
    console.log(`Checking message ${messageId} for schedule markers:`, {
      hasMessage: !!messageContent,
      messageLength: messageContent ? messageContent.length : 0,
      contentPreview: messageContent ? messageContent.substring(0, 50) + "..." : "",
    });
    
    // Check if the message contains any of our schedule markers or contains bullet points with times
    const containsScheduleMarker = SCHEDULE_MARKERS.some(marker => 
      messageContent?.toLowerCase().includes(marker.toLowerCase())
    );
    
    // Check for bullet list pattern with times (e.g., "- 09:30: Task name")
    const bulletListPattern = /[-•*]\s*\d{1,2}:\d{2}\s*:?\s*\w+/;
    const containsBulletList = bulletListPattern.test(messageContent || '');
    
    // Only process if there's a message and it contains a marker or bullet list
    if (messageContent && (containsScheduleMarker || containsBulletList)) {
      console.log(`Schedule marker or bullet list found in message ${messageId}!`);
      
      // Check if we've already processed this message (either in memory or in session storage)
      const alreadyProcessed = processedMessagesRef.current[messageId] || sessionStorage.getItem(storageKey);
      
      if (!alreadyProcessed) {
        console.log(`Processing new schedule from message ${messageId}...`);
        
        // If marker is found and not yet processed, send the content to be parsed
        scheduleFromLLMMutation.mutate(messageContent);
        
        // Mark as processed both in memory and session storage
        processedMessagesRef.current[messageId] = true;
        sessionStorage.setItem(storageKey, "true");
        
        console.log(`Schedule processing initiated for message ${messageId}`);
      } else {
        console.log(`Message ${messageId} already processed, skipping duplicate processing`);
      }
    }
  }, [messageId, messageContent, scheduleFromLLMMutation]);

  return (
    <>
      {/* Only render the dialog when it's needed */}
      {showDialog && (
        <ScheduleConfirmationDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          scheduleId={scheduleData.scheduleId}
          items={scheduleData.items}
          rawScheduleText={scheduleData.rawText}
        />
      )}
    </>
  );
}