import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { AlertCircle, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";

interface ScheduleItem {
  title: string;
  startTime: string;
  endTime?: string;
  taskId?: number;
}

interface ScheduleConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: number | null;
  items: ScheduleItem[];
  rawScheduleText: string;
}

export function ScheduleConfirmationDialog({ 
  open, 
  onOpenChange,
  scheduleId,
  items,
  rawScheduleText 
}: ScheduleConfirmationDialogProps) {
  const { toast } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);

  const confirmScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!scheduleId) {
        throw new Error("No schedule to confirm");
      }

      const res = await fetch(`/api/daily-schedules/${scheduleId}/confirm`, {
        method: "POST",
      });
      
      if (!res.ok) {
        throw new Error("Failed to confirm schedule");
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Schedule confirmed",
        description: "Your schedule has been confirmed and notifications will be sent at the scheduled times.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-schedules"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsConfirming(false);
    }
  });

  const handleConfirm = () => {
    setIsConfirming(true);
    confirmScheduleMutation.mutate();
  };

  if (!scheduleId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm Your Schedule</DialogTitle>
          <DialogDescription>
            Review and confirm your schedule to receive timely notifications
          </DialogDescription>
        </DialogHeader>

        <div className="my-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-medium text-sm text-muted-foreground">
                Schedule for {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </h3>
              
              <div className="max-h-[40vh] overflow-y-auto border rounded-md p-3">
                {items.length > 0 ? (
                  <ul className="space-y-3">
                    {items.map((item, index) => (
                      <li key={index} className="flex items-start gap-3 p-2 border-b last:border-0">
                        <div className="flex flex-col items-center justify-center bg-muted rounded-md p-2 text-xs text-center min-w-[60px]">
                          <Clock className="h-4 w-4 mb-1" />
                          <span>{item.startTime}</span>
                          {item.endTime && (
                            <span>- {item.endTime}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{item.title}</div>
                          {item.taskId && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Task ID: {item.taskId}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mb-2" />
                    <p>No schedule items found.</p>
                    <p className="text-xs mt-1">Please try generating a new schedule.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:justify-between">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={isConfirming || items.length === 0}
          >
            {isConfirming ? 'Confirming...' : 'Confirm Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}