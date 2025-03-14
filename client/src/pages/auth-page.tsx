import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { insertUserSchema } from "@shared/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain } from "lucide-react";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();

  if (user) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <Brain className="h-6 w-6" />
              <CardTitle className="text-2xl">ADHD Coach</CardTitle>
            </div>
            <CardDescription>
              Get personalized coaching and stay accountable
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <AuthForm
                  mode="login"
                  onSubmit={(data) => loginMutation.mutate(data)}
                  isPending={loginMutation.isPending}
                />
              </TabsContent>
              <TabsContent value="register">
                <AuthForm
                  mode="register"
                  onSubmit={(data) => registerMutation.mutate(data)}
                  isPending={registerMutation.isPending}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <div className="hidden lg:flex flex-col justify-center p-8 bg-primary text-primary-foreground">
        <div className="max-w-md mx-auto space-y-6">
          <h1 className="text-4xl font-bold">Your Personal ADHD Coach</h1>
          <p className="text-lg">
            Get personalized support, accountability, and strategies to help you
            achieve your goals while working with your ADHD, not against it.
          </p>
          <ul className="space-y-2">
            <li>• Smart check-ins that adapt to your schedule</li>
            <li>• Break down overwhelming tasks into manageable steps</li>
            <li>• Track your progress and celebrate wins</li>
            <li>• Get personalized strategies for your unique challenges</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function AuthForm({
  mode,
  onSubmit,
  isPending,
}: {
  mode: "login" | "register";
  onSubmit: (data: { username: string; password: string }) => void;
  isPending: boolean;
}) {
  const form = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Loading..." : mode === "login" ? "Login" : "Register"}
        </Button>
      </form>
    </Form>
  );
}
