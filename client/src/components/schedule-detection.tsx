import { useState, useEffect } from "react";
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
  userId: number;
}

export function ScheduleDetection({ messageContent, userId }: ScheduleDetectionProps) {
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

  useEffect(() => {
    // Check for schedule marker in the message content
    const SCHEDULE_MARKER = "The final schedule is as follows:";
    
    // Debug log for message detection (helps identify if we're receiving the message content)
    console.log("Checking message for schedule marker:", {
      hasMessage: !!messageContent,
      messageLength: messageContent ? messageContent.length : 0,
      contentPreview: messageContent ? messageContent.substring(0, 50) + "..." : "",
    });
    
    // Only process if there's a message and it contains the marker
    if (messageContent && messageContent.toLowerCase().includes(SCHEDULE_MARKER.toLowerCase())) {
      console.log("Schedule marker found in message!");
      
      // Create a deterministic key based on message content to avoid duplicates
      // Using first 100 chars + last 20 chars gives us a pretty unique fingerprint
      const messagePreview = messageContent.substring(0, 100);
      const messageEnd = messageContent.length > 20 
        ? messageContent.substring(messageContent.length - 20) 
        : "";
      const processedMessageKey = `processed_schedule_${messagePreview}_${messageEnd}`;
      
      // Check if we've already processed this message
      if (!sessionStorage.getItem(processedMessageKey)) {
        console.log("Processing new schedule from message...");
        
        // If marker is found and not yet processed, send the content to be parsed
        scheduleFromLLMMutation.mutate(messageContent);
        
        // Mark as processed
        sessionStorage.setItem(processedMessageKey, "true");
        
        // Log success for debugging
        console.log("Schedule processing initiated with key:", processedMessageKey);
      } else {
        console.log("Schedule already processed, skipping duplicate processing");
      }
    }
  }, [messageContent, scheduleFromLLMMutation]);

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