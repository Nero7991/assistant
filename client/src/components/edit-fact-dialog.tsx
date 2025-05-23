import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertKnownUserFactSchema, factExamples, type InsertKnownUserFact, type KnownUserFact } from "@shared/schema";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface EditFactDialogProps {
  fact: KnownUserFact;
  onClose: () => void;
}

export function EditFactDialog({ fact, onClose }: EditFactDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof factExamples>(
    fact.category as 'life_event' | 'core_memory' | 'traumatic_experience' | 'personality' | 'attachment_style' | 'custom'
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertKnownUserFact>({// @ts-ignore - We know the type is compatible
    resolver: zodResolver(insertKnownUserFactSchema),
    defaultValues: {
      category: fact.category as 'life_event' | 'core_memory' | 'traumatic_experience' | 'personality' | 'attachment_style' | 'custom',
      factType: fact.factType,
      content: fact.content,
    },
  });

  const handleFormSubmit = async () => {
    console.log('Submit button clicked');

    // Get current form values
    const formData = form.getValues();
    console.log('Current form values:', formData);
    console.log('Form state:', {
      isDirty: form.formState.isDirty,
      errors: form.formState.errors,
    });

    try {
      console.log('Attempting form validation...');
      const success = await form.trigger();
      if (!success) {
        console.log('Form validation failed:', form.formState.errors);
        return;
      }

      console.log('Making API request to update fact');
      await apiRequest('PATCH', `/api/known-facts/${fact.id}`, formData);

      await queryClient.invalidateQueries({ queryKey: ['/api/known-facts'] });
      onClose();
      form.reset();
      toast({
        title: "Success",
        description: "Your fact has been updated successfully.",
      });
    } catch (error) {
      console.error('Error updating fact:', error);
      toast({
        title: "Error",
        description: "Failed to update fact. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Fact</DialogTitle>
          <DialogDescription>
            Update this fact about yourself.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    onValueChange={(value: keyof typeof factExamples) => {
                      field.onChange(value);
                      setSelectedCategory(value);
                    }}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="life_event">Life Event</SelectItem>
                      <SelectItem value="core_memory">Core Memory</SelectItem>
                      <SelectItem value="traumatic_experience">Traumatic Experience</SelectItem>
                      <SelectItem value="personality">Personality</SelectItem>
                      <SelectItem value="attachment_style">Attachment Style</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Examples: {factExamples[selectedCategory].join(', ')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="factType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fact Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="E.g., First College Graduation, Boulder Move 2024, Career Switch to Tech" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Give your fact a short, memorable name
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Share your fact here..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button 
              onClick={() => {
                console.log('Update Fact button clicked - calling handleFormSubmit');
                handleFormSubmit();
              }}
            >
              Update Fact
            </Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
