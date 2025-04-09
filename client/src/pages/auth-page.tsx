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
import { useState, useEffect } from "react";
import { VerificationDialog } from "@/components/verification-dialog";
import { apiRequest, useQueryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    console.log('AuthPage mounted with user:', user);
  }, [user]);

  useEffect(() => {
    if (user) {
      console.log("Checking redirection conditions:", {
        user,
        isEmailVerified: user.isEmailVerified,
        contactPreference: user.contactPreference,
        isPhoneVerified: user.isPhoneVerified,
        shouldRedirect: user.isEmailVerified && (user.contactPreference !== "whatsapp" || user.isPhoneVerified)
      });

      if (user.isEmailVerified && (user.contactPreference !== "whatsapp" || user.isPhoneVerified)) {
        console.log("Redirecting to chat page");
        setLocation("/chat");
      }
    }
  }, [user, setLocation]);

  // If user exists but verification is incomplete, show verification dialogs
  if (user && (!user.isEmailVerified || (user.contactPreference === "whatsapp" && !user.isPhoneVerified))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md p-6">
          <CardHeader>
            <CardTitle>Verification Required</CardTitle>
            <CardDescription>
              Please complete the verification process to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {!user.isEmailVerified && (
                <Button 
                  onClick={() => console.log("TODO: Implement email verification resend")}
                  className="w-full"
                >
                  Verify Email
                </Button>
              )}
              {user.contactPreference === "whatsapp" && !user.isPhoneVerified && (
                <Button 
                  onClick={() => console.log("TODO: Implement phone verification resend")}
                  className="w-full"
                >
                  Verify Phone
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If no user, show login/register form
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="grid lg:grid-cols-2 flex-grow">
          <div className="flex items-center justify-center p-8">
            <Card className="w-full max-w-md">
              <CardHeader className="space-y-1">
                <div className="flex items-center gap-2">
                  <Brain className="h-6 w-6" />
                  <CardTitle className="text-2xl">Assistant</CardTitle>
                </div>
                <CardDescription>
                  Your kind & encouraging AI personal assistant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  defaultValue="login"
                  className="space-y-4"
                  onValueChange={(value) => console.log('Tab changed to:', value)}
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Login</TabsTrigger>
                    <TabsTrigger value="register">Register</TabsTrigger>
                  </TabsList>
                  <TabsContent value="login">
                    <div data-testid="login-tab-content">
                      <LoginForm />
                    </div>
                  </TabsContent>
                  <TabsContent value="register">
                    <div data-testid="register-tab-content">
                      <RegisterForm />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
          <div className="hidden lg:flex flex-col justify-center p-8 bg-primary text-primary-foreground">
            <div className="max-w-md mx-auto space-y-6">
              <h1 className="text-4xl font-bold">Assistant</h1>
              <p className="text-lg">
                Your kind and encouraging personal assistant, helping you stay accountable towards tasks and life goals via text messages. Designed for executive function support, you can also talk to it about anything on your mind.
              </p>
              <ul className="space-y-2">
                <li>• Get kind, encouraging text messages</li>
                <li>• Stay accountable for tasks & goals</li>
                <li>• Designed for executive function support</li>
                <li>• Chat about anything</li>
              </ul>
            </div>
          </div>
        </div>
        <footer className="py-4 border-t mt-auto">
          <div className="container mx-auto text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Oren's Lab. All rights reserved.
          </div>
        </footer>
      </div>
    );
  }

  return null;
}

const LoginForm = () => {
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
      <form onSubmit={form.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4" role="form" data-testid="login-form">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="username">Username</FormLabel>
              <FormControl>
                <Input {...field} id="username"/>
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
              <FormLabel htmlFor="password">Password</FormLabel>
              <FormControl>
                <Input type="password" {...field} id="password"/>
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
};

const RegisterForm = () => {
    const { registerMutation } = useAuth();
    const { toast } = useToast();
    const [showEmailVerification, setShowEmailVerification] = useState(false);
    const [showPhoneVerification, setShowPhoneVerification] = useState(false);
    const [pendingRegistrationData, setPendingRegistrationData] = useState<any>(null);
    const [isCheckingUsername, setIsCheckingUsername] = useState(false);
    const queryClient = useQueryClient();
    const form = useForm({
        resolver: zodResolver(insertUserSchema),
        defaultValues: {
            username: "",
            password: "",
            phoneNumber: "",
            email: "",
            contactPreference: "whatsapp",
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            preferredMessageTime: "08:00"
        },
        mode: "onChange",
    });

    useEffect(() => {
        const username = form.watch("username");
        const checkUsername = async () => {
            if (username.length < 3) return;

            try {
                setIsCheckingUsername(true);
                const res = await apiRequest("GET", `/api/check-username/${username}`);
                if (!res.ok) {
                    form.setError("username", {
                        type: "manual",
                        message: "Username already exists"
                    });
                } else {
                    form.clearErrors("username");
                }
            } catch (error) {
                console.error("Username check error:", error);
            } finally {
                setIsCheckingUsername(false);
            }
        };

        const timeoutId = setTimeout(checkUsername, 500);
        return () => clearTimeout(timeoutId);
    }, [form.watch("username")]);

    const onSubmit = async (data: any) => {
        try {
            console.log("Form submitted, initiating verification process");

            if (form.formState.errors.username) {
                toast({
                    title: "Registration error",
                    description: "Please choose a different username",
                    variant: "destructive",
                });
                return;
            }

            setPendingRegistrationData(data);

            const res = await apiRequest("POST", "/api/initiate-verification", {
                email: data.email,
                type: "email"
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || "Failed to send verification code");
            }

            console.log("Opening email verification dialog");
            setShowEmailVerification(true);
        } catch (error) {
            console.error('Registration failed:', error);
            toast({
                title: "Registration failed",
                description: error instanceof Error ? error.message : "An error occurred",
                variant: "destructive",
            });
        }
    };

    const completeRegistration = async () => {
        if (!pendingRegistrationData) {
            console.log("Cannot complete registration - no pending data");
            return;
        }

        try {
            console.log("Starting registration with data:", {
                ...pendingRegistrationData,
                password: '[REDACTED]'
            });

            // Register the user
            const registeredUser = await registerMutation.mutateAsync(pendingRegistrationData);
            console.log("User registered:", registeredUser);

            // Force a fresh fetch of user data
            await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
            const updatedUser = await queryClient.fetchQuery({ queryKey: ["/api/user"] });

            console.log("Registration completed, user state:", {
                registeredUser,
                updatedUser,
                isAuthenticated: !!updatedUser,
                isEmailVerified: updatedUser?.isEmailVerified,
                isPhoneVerified: updatedUser?.isPhoneVerified
            });

        } catch (error) {
            console.error("Final registration failed:", error);
            toast({
                title: "Registration failed",
                description: error instanceof Error ? error.message : "An error occurred",
                variant: "destructive",
            });
        }
    };

    const handleEmailVerificationSuccess = async () => {
        console.log("Email verification successful");
        setShowEmailVerification(false);

        // Check if user object has email verified
        const userState = queryClient.getQueryData(["/api/user"]);
        console.log("User state after email verification:", {
            isEmailVerified: userState?.isEmailVerified,
            isPhoneVerified: userState?.isPhoneVerified
        });

        if (form.getValues("contactPreference") === "whatsapp" && form.getValues("phoneNumber")) {
            try {
                console.log("Initiating WhatsApp verification");
                const res = await apiRequest("POST", "/api/initiate-verification", {
                    phone: form.getValues("phoneNumber"),
                    type: "whatsapp"
                });

                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.message || "Failed to send phone verification code");
                }

                setShowPhoneVerification(true);
            } catch (error) {
                console.error("Phone verification initiation failed:", error);
                toast({
                    title: "Verification failed",
                    description: error instanceof Error ? error.message : "Failed to send phone verification code",
                    variant: "destructive",
                });
            }
        } else {
            // Complete registration if no phone verification needed
            await completeRegistration();
        }
    };

    const handlePhoneVerificationSuccess = async () => {
        console.log("Phone verification successful");
        setShowPhoneVerification(false);

        // Log verification state
        const userState = queryClient.getQueryData(["/api/user"]);
        console.log("User state after phone verification:", {
            isEmailVerified: userState?.isEmailVerified,
            isPhoneVerified: userState?.isPhoneVerified
        });

        await completeRegistration();
    };

    const handleSkipPhoneVerification = async () => {
        console.log("Phone verification skipped");
        setShowPhoneVerification(false);
        await completeRegistration();
    };

    const contactPreference = form.watch("contactPreference");

    return (
        <>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" role="form" data-testid="register-form">
                    <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel htmlFor="username">Username</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <Input
                                            id="username"
                                            {...field}
                                            autoComplete="username"
                                            aria-label="Username"
                                        />
                                        {isCheckingUsername && (
                                            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                                        )}
                                    </div>
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
                                <FormLabel htmlFor="password">Password</FormLabel>
                                <FormControl>
                                    <Input
                                        id="password"
                                        type="password"
                                        {...field}
                                        autoComplete="new-password"
                                        aria-label="Password"
                                    />
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
                                <FormLabel htmlFor="email">Email Address</FormLabel>
                                <FormControl>
                                    <Input
                                        id="email"
                                        type="email"
                                        {...field}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        aria-label="Email Address"
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
                                        <SelectTrigger data-testid="contact-preference-select">
                                            <SelectValue placeholder="Select contact method" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="whatsapp" data-testid="whatsapp-option">WhatsApp</SelectItem>
                                        <SelectItem value="email" data-testid="email-option">Email Only</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {contactPreference === "whatsapp" && (
                        <FormField
                            control={form.control}
                            name="phoneNumber"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel htmlFor="phoneNumber">Phone Number</FormLabel>
                                    <FormControl>
                                        <Input
                                            id="phoneNumber"
                                            {...field}
                                            placeholder="+1234567890"
                                            type="tel"
                                            autoComplete="tel"
                                            aria-label="Phone Number"
                                            data-testid="phone-number-input"
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

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={registerMutation.isPending || isCheckingUsername}
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
                description="Please check your WhatsApp for a verification code"
                type="phone"
                showSkip={true}
            />
        </>
    );
};