import { useQuery, useMutation } from "@tanstack/react-query";
import { KnownUserFact, InsertKnownUserFact } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useKnownFacts() {
  const { toast } = useToast();

  const {
    data: facts = [],
    isLoading,
    error,
  } = useQuery<KnownUserFact[]>({
    queryKey: ["/api/known-facts"],
  });

  const createFactMutation = useMutation({
    mutationFn: async (fact: InsertKnownUserFact) => {
      const res = await apiRequest("POST", "/api/known-facts", fact);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/known-facts"] });
      toast({
        title: "Success",
        description: "Fact created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateFactMutation = useMutation({
    mutationFn: async ({ id, fact }: { id: number; fact: Partial<KnownUserFact> }) => {
      const res = await apiRequest("PATCH", `/api/known-facts/${id}`, fact);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/known-facts"] });
      toast({
        title: "Success",
        description: "Fact updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteFactMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/known-facts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/known-facts"] });
      toast({
        title: "Success",
        description: "Fact deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    facts,
    isLoading,
    error,
    createFact: createFactMutation.mutate,
    updateFact: updateFactMutation.mutate,
    deleteFact: deleteFactMutation.mutate,
    isCreating: createFactMutation.isPending,
    isUpdating: updateFactMutation.isPending,
    isDeleting: deleteFactMutation.isPending,
  };
}
