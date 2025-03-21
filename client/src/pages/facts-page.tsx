import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Brain, Book, Star, Heart, Sparkles, Plus } from "lucide-react";
import { AddFactDialog } from "@/components/add-fact-dialog";
import { type KnownUserFact } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

const categoryIcons = {
  life_event: Book,
  core_memory: Sparkles,
  traumatic_experience: Heart,
  personality: Brain,
  attachment_style: Star,
  custom: Plus,
} as const;

export default function FactsPage() {
  const { data: facts, isLoading } = useQuery<KnownUserFact[]>({
    queryKey: ['/api/known-facts'],
  });

  // Group facts by category
  const factsByCategory = facts?.reduce((acc, fact) => {
    if (!acc[fact.category]) {
      acc[fact.category] = [];
    }
    acc[fact.category].push(fact);
    return acc;
  }, {} as Record<string, KnownUserFact[]>) ?? {};

  return (
    <div className="container mx-auto max-w-4xl w-full p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Facts About You</h1>
          <p className="text-muted-foreground">
            Track your preferences, experiences, and ADHD insights
          </p>
        </div>
        <AddFactDialog />
      </div>

      <div className="grid gap-6">
        {isLoading ? (
          // Loading skeletons
          [...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : facts?.length === 0 ? (
          // Empty state
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Your First Fact
              </CardTitle>
              <CardDescription>
                Start by adding some important facts about yourself
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Click the "Add New Fact" button above to begin tracking your experiences,
                preferences, and insights.
              </p>
            </CardContent>
          </Card>
        ) : (
          // Display facts grouped by category
          Object.entries(factsByCategory).map(([category, categoryFacts]) => {
            const Icon = categoryIcons[category as keyof typeof categoryIcons] || Plus;
            return (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {category.split('_').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </CardTitle>
                  <CardDescription>
                    {categoryFacts.length} {categoryFacts.length === 1 ? 'fact' : 'facts'} recorded
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {categoryFacts.map(fact => (
                      <li key={fact.id} className="text-sm">
                        <span className="font-medium">{fact.factType}:</span>{' '}
                        {fact.content}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  );
}