import { useQuery } from "@tanstack/react-query";
import { CheckIn } from "@shared/schema";
import { SidebarNav } from "@/components/sidebar-nav";
import { CheckInDialog } from "@/components/check-in-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { Brain, MessageSquare, Loader2 } from "lucide-react";

export default function HomePage() {
  const { data: checkIns, isLoading } = useQuery<CheckIn[]>({
    queryKey: ["/api/checkins"],
  });

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarNav />
      <main className="flex-1">
        <div className="h-full p-4 md:p-8 pt-16 md:pt-8">
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground">
                  Your personal ADHD coaching assistant
                </p>
              </div>
              <CheckInDialog />
            </div>

            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Welcome to Your ADHD Coach
                  </CardTitle>
                  <CardDescription>
                    Get personalized support and accountability through regular
                    check-ins
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Your coach helps you stay on track by providing:
                  </p>
                  <ul className="ml-6 space-y-2">
                    <li>• Personalized strategies for ADHD challenges</li>
                    <li>• Task breakdown and prioritization</li>
                    <li>• Regular check-ins and accountability</li>
                    <li>• Progress tracking and celebration of wins</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Coaching History
                  </CardTitle>
                  <CardDescription>
                    Your recent check-ins and coaching interactions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : !checkIns?.length ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No check-ins yet. Start your first coaching session!</p>
                      <div className="mt-4">
                        <CheckInDialog />
                      </div>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-4">
                        {checkIns.map((checkIn) => {
                          const response = JSON.parse(checkIn.response || "{}");
                          return (
                            <div
                              key={checkIn.id}
                              className="border rounded-lg p-4 space-y-2"
                            >
                              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2">
                                <div className="font-medium">Your Check-in</div>
                                <div className="text-sm text-muted-foreground">
                                  {format(
                                    new Date(checkIn.createdAt),
                                    "MMM d, yyyy h:mm a"
                                  )}
                                </div>
                              </div>
                              <p className="text-sm">{checkIn.content}</p>
                              {response.message && (
                                <div className="mt-4 pl-4 border-l-2 border-primary">
                                  <div className="font-medium text-sm text-primary">
                                    Coach Response
                                  </div>
                                  <p className="text-sm mt-1">{response.message}</p>
                                  {response.actionItems && (
                                    <ul className="mt-2 space-y-1">
                                      {response.actionItems.map((item: string, i: number) => (
                                        <li
                                          key={i}
                                          className="text-sm text-muted-foreground"
                                        >
                                          • {item}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}