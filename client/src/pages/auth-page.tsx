import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { insertUserSchema, insertWaitlistEntrySchema } from "@shared/schema";
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
import { useState, useEffect, useCallback } from "react";
import { VerificationDialog } from "@/components/verification-dialog";
import { apiRequest, useQueryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

export default function AuthPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register" | "forgot-password">("login");
  const [isRegistrationEnabled, setIsRegistrationEnabled] = useState<boolean | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

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

  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoadingStatus(true);
      try {
        const res = await apiRequest("GET", "/api/registration-status");
        if (!res.ok) {
          throw new Error("Failed to fetch registration status");
        }
        const data = await res.json();
        console.log('Fetched registration status:', data);
        setIsRegistrationEnabled(data.enabled);
      } catch (error) {
        console.error("Error fetching registration status:", error);
        setIsRegistrationEnabled(null);
      }
      finally {
        setIsLoadingStatus(false);
      }
    };
    fetchStatus();
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prevMode) => (prevMode === "login" ? "register" : "login"));
  }, []);

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

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="grid lg:grid-cols-2 flex-grow">
          <div className="flex items-center justify-center p-8">
            <Card className="w-full max-w-md">
              <CardHeader className="space-y-1">
                <div className="flex items-center gap-2">
                  <Brain className="h-6 w-6" />
                  <CardTitle className="text-2xl">Kona</CardTitle>
                </div>
                <CardDescription>
                  {mode === 'login' 
                    ? "Login to your account"
                    : mode === 'forgot-password'
                      ? "Reset your password"
                    : isLoadingStatus 
                      ? "Checking registration status..."
                      : isRegistrationEnabled === false
                        ? "Join the waitlist"
                        : "Create a new account"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingStatus ? (
                  <div className="flex justify-center items-center p-10">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                    </div>
                ) : mode === "login" ? (
                  <LoginForm onSwitchMode={toggleMode} setMode={setMode} />
                ) : mode === "register" ? (
                  isRegistrationEnabled === true ? (
                    <RegisterForm onSwitchMode={toggleMode} /> 
                  ) : isRegistrationEnabled === false ? (
                    <WaitlistForm /> 
                  ) : (
                    <div className="text-center text-red-500 p-4">Error checking registration status. Please try again later.</div>
                  )
                ) : mode === "forgot-password" ? (
                    <ForgotPasswordForm onSwitchMode={toggleMode} />
                ) : null /* Should not happen */}
                
                {!isLoadingStatus && (
                 <p className="mt-4 text-center text-sm text-gray-600">
                   {mode === 'login' && (
                     <>{"Don't have an account?"}{' '}
                       <button onClick={toggleMode} className="font-medium text-indigo-600 hover:text-indigo-500">
                         {isRegistrationEnabled === false ? "Join Waitlist" : "Register here"}
                       </button>
                     </>
                   )}
                   {(mode === 'register' || mode === 'forgot-password') && (
                     <>{"Already have an account?"}{' '}
                       <button onClick={() => setMode('login')} className="font-medium text-indigo-600 hover:text-indigo-500">
                         Login here
                       </button>
                     </>
                   )}
                  </p>
               )}
              </CardContent>
            </Card>
          </div>
          <div className="hidden lg:flex flex-col justify-center p-8 bg-primary text-primary-foreground">
            <div className="max-w-md mx-auto space-y-6">
              <h1 className="text-4xl font-bold">Kona</h1>
              <p className="text-lg">
                Kona is your kind and encouraging personal assistant, helping you stay accountable towards tasks and life goals via text messages. Designed for executive function support, you can also talk to it about anything on your mind.
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

const LoginForm = ({ onSwitchMode, setMode }: { onSwitchMode: () => void, setMode: (mode: "login" | "register" | "forgot-password") => void }) => {
  const { loginMutation } = useAuth();
  const form = useForm({
    resolver: zodResolver(z.object({
      email: z.string().email("Please enter a valid email"),
      password: z.string().min(1, "Password is required"),
    })),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4" role="form" data-testid="login-form">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="email">Email</FormLabel>
              <FormControl>
                <Input {...field} id="email" type="email" autoComplete="email"/>
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
        <div className="text-sm text-right">
          <button 
            type="button" 
            onClick={() => setMode('forgot-password')}
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Forgot password?
          </button>
        </div>
      </form>
    </Form>
  );
};

const RegisterForm = ({ onSwitchMode }: { onSwitchMode: () => void }) => {
    const { registerMutation } = useAuth();
    const { toast } = useToast();
    const [showEmailVerification, setShowEmailVerification] = useState(false);
    const [showPhoneVerification, setShowPhoneVerification] = useState(false);
    const [pendingRegistrationData, setPendingRegistrationData] = useState<any>(null);
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

    const onSubmit = async (data: any) => {
        try {
            console.log("Form submitted, initiating verification process");

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
                                        <Input
                                            id="username"
                                            {...field}
                                            autoComplete="username"
                                            aria-label="Username"
                                        />
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
                        disabled={registerMutation.isPending}
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

const WaitlistForm = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof insertWaitlistEntrySchema>>({
    resolver: zodResolver(insertWaitlistEntrySchema),
    defaultValues: {
      firstName: "",
      email: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof insertWaitlistEntrySchema>) => {
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/waitlist", data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to join waitlist");
      }
      const result = await res.json();
      toast({
        title: "Success!",
        description: result.message || "You've been added to the waitlist.",
      });
      form.reset();
    } catch (error) {
      console.error("Waitlist submission error:", error);
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <CardHeader className="text-center">
          <CardTitle>Join the Waitlist</CardTitle>
          <CardDescription>Registration is currently closed. Enter your details below to be notified when it opens.</CardDescription>
        </CardHeader>
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="waitlist-firstName">First Name</FormLabel>
              <FormControl>
                <Input id="waitlist-firstName" {...field} placeholder="Your first name" />
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
              <FormLabel htmlFor="waitlist-email">Email</FormLabel>
              <FormControl>
                <Input id="waitlist-email" {...field} type="email" placeholder="your.email@example.com" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            "Join Waitlist"
          )}
        </Button>
      </form>
    </Form>
    );
};

// ---> NEW: Forgot Password Form Component
const ForgotPasswordForm = ({ onSwitchMode }: { onSwitchMode: () => void }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const form = useForm<{ email: string }>({
    resolver: zodResolver(z.object({ email: z.string().email("Please enter a valid email address") })),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: { email: string }) => {
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/forgot-password", data);
      const result = await res.json(); // Read response body regardless of status for message

      if (!res.ok) {
        throw new Error(result.message || "Failed to send reset link");
      }
      
      toast({
        title: "Check your email",
        description: result.message || "Password reset link sent.", // Use message from backend
      });
      // Optionally switch back to login mode automatically
      // onSwitchMode(); 
    } catch (error) {
      console.error("Forgot password error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <CardHeader className="text-center">
          <CardTitle>Forgot Password</CardTitle>
          <CardDescription>Enter your email address and we'll send you a link to reset your password.</CardDescription>
        </CardHeader>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="forgot-email">Email Address</FormLabel>
              <FormControl>
                <Input id="forgot-email" {...field} type="email" placeholder="your.email@example.com" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send Reset Link"
          )}
        </Button>
      </form>
    </Form>
  );
};
// <--- END NEW