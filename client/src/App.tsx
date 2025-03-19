import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./hooks/use-auth";
import { Switch, Route } from "wouter";
import { ProtectedRoute } from "./lib/protected-route";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/app-layout";

import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import GoalsPage from "@/pages/goals-page";
import TasksPage from "@/pages/tasks-page";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute 
        path="/" 
        component={() => (
          <AppLayout>
            <HomePage />
          </AppLayout>
        )} 
      />
      <ProtectedRoute 
        path="/goals" 
        component={() => (
          <AppLayout>
            <GoalsPage />
          </AppLayout>
        )} 
      />
      <ProtectedRoute 
        path="/tasks" 
        component={() => (
          <AppLayout>
            <TasksPage />
          </AppLayout>
        )} 
      />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;