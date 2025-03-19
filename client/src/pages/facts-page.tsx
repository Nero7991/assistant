import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Brain, Book, Star } from "lucide-react";

export default function FactsPage() {
  return (
    <div className="container mx-auto max-w-4xl w-full p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Facts About You</h1>
          <p className="text-muted-foreground">
            Track your preferences, experiences, and ADHD insights
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Your ADHD Profile
            </CardTitle>
            <CardDescription>
              Understanding your unique ADHD traits and patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Coming soon: Track your ADHD traits, triggers, and coping strategies
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Preferences & Interests
            </CardTitle>
            <CardDescription>
              Things that motivate and interest you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Coming soon: Record your interests, hobbies, and what helps you focus
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Book className="h-5 w-5" />
              Life Events & Milestones
            </CardTitle>
            <CardDescription>
              Important moments and achievements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Coming soon: Document significant life events and personal milestones
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
