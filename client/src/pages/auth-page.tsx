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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Loader2 } from "lucide-react";
import { useState } from "react";
import { VerificationDialog } from "@/components/verification-dialog";

export default function AuthPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Only redirect if user is logged in AND email is verified
  if (user?.isEmailVerified) {
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
                <LoginForm />
              </TabsContent>
              <TabsContent value="register">
                <RegisterForm />
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

function LoginForm() {
  const { loginMutation } = useAuth();
  const form = useForm({
    resolver: zodResolver(insertUserSchema.pick({ username: true, password: true })),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => {
        console.log('Attempting login...', { ...data, password: '[REDACTED]' });
        loginMutation.mutate(data)
      })} className="space-y-4">
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
        <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Logging in...
            </>
          ) : (
            "Login"
          )}
        </Button>
      </form>
    </Form>
  );
}

function RegisterForm() {
  const { registerMutation } = useAuth();
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);

  const form = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      phoneNumber: "",
      email: "",
      contactPreference: "email",
    },
  });

  const onSubmit = async (data: any) => {
    try {
      console.log('Starting registration process...', { ...data, password: '[REDACTED]' });
      await registerMutation.mutateAsync(data);
      setShowEmailVerification(true);
    } catch (error) {
      console.error('Registration failed:', error);
      // Error will be handled by the mutation's onError callback
    }
  };

  const handleEmailVerificationSuccess = () => {
    setShowEmailVerification(false);
    // If phone number was provided, show phone verification
    if (form.getValues("phoneNumber")) {
      setShowPhoneVerification(true);
    } else {
      setVerificationComplete(true);
    }
  };

  const handlePhoneVerificationSuccess = () => {
    setShowPhoneVerification(false);
    setVerificationComplete(true);
  };

  const handleSkipPhoneVerification = () => {
    setVerificationComplete(true);
  };

  const contactPreference = form.watch("contactPreference");

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="username" />
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
                  <Input type="password" {...field} autoComplete="new-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contactPreference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preferred Contact Method</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select contact method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="imessage">iMessage</SelectItem>
                    <SelectItem value="email">Email Only</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {(contactPreference === "whatsapp" || contactPreference === "imessage") && (
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="+1234567890"
                      type="tel"
                      autoComplete="tel"
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Include country code, e.g. +1 for US/Canada
                  </p>
                </FormItem>
              )}
            />
          )}

          <div className="space-y-4">
            <Button 
              type="submit" 
              className="w-full"
              disabled={registerMutation.isPending}
              variant={registerMutation.isPending ? "outline" : "default"}
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>

            {registerMutation.isError && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {registerMutation.error instanceof Error 
                  ? registerMutation.error.message 
                  : "Failed to create account. Please try again."}
              </div>
            )}
          </div>
        </form>
      </Form>

      <VerificationDialog
        open={showEmailVerification}
        onOpenChange={setShowEmailVerification}
        onSuccess={handleEmailVerificationSuccess}
        title="Verify Your Email"
        description="Please check your email for a verification code"
        type="email"
      />

      <VerificationDialog
        open={showPhoneVerification}
        onOpenChange={setShowPhoneVerification}
        onSuccess={handlePhoneVerificationSuccess}
        onSkip={handleSkipPhoneVerification}
        title="Verify Your Phone Number"
        description="Please check your phone for a verification code"
        type="phone"
        showSkip={true}
      />
    </>
  );
}