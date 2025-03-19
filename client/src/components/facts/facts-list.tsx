import { useState } from "react";
import { KnownUserFact } from "@shared/schema";
import { useKnownFacts } from "@/hooks/use-known-facts";
import { FactForm } from "./fact-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";

export function FactsList() {
  const { facts, isLoading, createFact, updateFact, deleteFact, isCreating, isUpdating, isDeleting } =
    useKnownFacts();
  const [editingFact, setEditingFact] = useState<KnownUserFact | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Known Facts</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Fact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Fact</DialogTitle>
              <DialogDescription>
                Add a new known fact about the user's preferences or habits.
              </DialogDescription>
            </DialogHeader>
            <FactForm
              onSubmit={async (data) => {
                await createFact(data);
                setIsDialogOpen(false);
              }}
              isSubmitting={isCreating}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => (
          <Card key={fact.id}>
            <CardHeader>
              <CardTitle className="flex justify-between items-start">
                <span className="capitalize">{fact.category}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {fact.factType === "user-provided" ? "User Provided" : "System Learned"}
                </span>
              </CardTitle>
              {fact.confidence && (
                <CardDescription>Confidence: {fact.confidence}%</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <p>{fact.content}</p>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingFact(fact);
                  setIsDialogOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteFact(fact.id)}
                disabled={isDeleting}
              >
                Delete
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {editingFact && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Fact</DialogTitle>
              <DialogDescription>
                Update the details of this known fact.
              </DialogDescription>
            </DialogHeader>
            <FactForm
              defaultValues={editingFact}
              onSubmit={async (data) => {
                await updateFact({ id: editingFact.id, fact: data });
                setEditingFact(null);
                setIsDialogOpen(false);
              }}
              isSubmitting={isUpdating}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
