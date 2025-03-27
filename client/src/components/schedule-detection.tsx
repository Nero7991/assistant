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
      const res = await fetch("/api/daily-schedules/from-llm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ llmResponse }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to parse schedule");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-schedules"] });
      toast({
        title: "Schedule detected",
        description: `${data.parsedItems} schedule items were found. Please confirm your schedule.`,
      });

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
      // Fetch both the schedule and its items
      const [scheduleRes, itemsRes] = await Promise.all([
        fetch(`/api/daily-schedules/${scheduleId}`),
        fetch(`/api/daily-schedules/${scheduleId}/items`),
      ]);

      if (!scheduleRes.ok || !itemsRes.ok) {
        throw new Error("Failed to fetch schedule data");
      }

      const schedule = await scheduleRes.json();
      const items = await itemsRes.json();

      setScheduleData({
        scheduleId,
        items,
        rawText: schedule.originalContent || "",
      });
      setShowDialog(true);
    } catch (error) {
      console.error("Error fetching schedule items:", error);
      toast({
        title: "Error",
        description: "Failed to load schedule details",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    // Check for schedule marker in the message content
    const SCHEDULE_MARKER = "The final schedule is as follows:";
    
    // Only process if there's a message and it contains the marker
    if (messageContent && messageContent.toLowerCase().includes(SCHEDULE_MARKER.toLowerCase())) {
      // Store processed messages in session storage to avoid duplicate processing
      const processedMessageKey = `processed_schedule_${messageContent.substring(0, 50)}`;
      
      // Check if we've already processed this message
      if (!sessionStorage.getItem(processedMessageKey)) {
        // If marker is found and not yet processed, send the content to be parsed
        scheduleFromLLMMutation.mutate(messageContent);
        
        // Mark as processed
        sessionStorage.setItem(processedMessageKey, "true");
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