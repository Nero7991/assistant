import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InsertKnownUserFact, insertKnownUserFactSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FactFormProps {
  onSubmit: (data: InsertKnownUserFact) => void;
  defaultValues?: Partial<InsertKnownUserFact>;
  isSubmitting?: boolean;
}

export function FactForm({ onSubmit, defaultValues, isSubmitting }: FactFormProps) {
  const form = useForm<InsertKnownUserFact>({
    resolver: zodResolver(insertKnownUserFactSchema),
    defaultValues: {
      factType: "user-provided",
      category: "preference",
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="factType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fact Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select fact type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="user-provided">User Provided</SelectItem>
                  <SelectItem value="system-learned">System Learned</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="preference">Preference</SelectItem>
                  <SelectItem value="habit">Habit</SelectItem>
                  <SelectItem value="achievement">Achievement</SelectItem>
                  <SelectItem value="goal">Goal</SelectItem>
                  <SelectItem value="challenge">Challenge</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
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
                <Input placeholder="Enter fact content" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confidence"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confidence (0-100)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Enter confidence level"
                  {...field}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Fact"}
        </Button>
      </form>
    </Form>
  );
}
