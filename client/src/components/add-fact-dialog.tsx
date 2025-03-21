import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { insertKnownUserFactSchema, factExamples, type InsertKnownUserFact } from "@shared/schema";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function AddFactDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertKnownUserFact>({
    resolver: zodResolver(insertKnownUserFactSchema),
    defaultValues: {
      category: 'life_event',
      factType: '',
      content: '',
    },
  });

  const [selectedCategory, setSelectedCategory] = useState<keyof typeof factExamples>('life_event');

  const onSubmit = async (data: InsertKnownUserFact) => {
    console.log('Form submitted with data:', data);
    try {
      console.log('Making API request to /api/known-facts');
      const response = await apiRequest('POST', '/api/known-facts', data);
      console.log('API response:', response);

      await queryClient.invalidateQueries({ queryKey: ['/api/known-facts'] });
      setOpen(false);
      form.reset();
      toast({
        title: "Fact added",
        description: "Your fact has been saved successfully.",
      });
    } catch (error) {
      console.error('Error submitting fact:', error);
      toast({
        title: "Error",
        description: "Failed to add fact. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add New Fact</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add a New Fact About Yourself</DialogTitle>
          <DialogDescription>
            Share important facts about yourself that will help personalize your coaching experience.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <form onSubmit={(e) => {
            console.log("Form submit event triggered");
            e.preventDefault();
            form.handleSubmit(onSubmit)(e);
          }} className="space-y-4">
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
              type="submit" 
              onClick={() => console.log("Add Fact button clicked")}
            >
              Add Fact
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}