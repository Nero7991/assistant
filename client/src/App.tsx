import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./hooks/use-auth";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { ProtectedRoute } from "./lib/protected-route";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/app-layout";

import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import TasksPage from "@/pages/tasks-page";
import FactsPage from "@/pages/facts-page";
import AccountPage from "@/pages/account-page";
import ChatPage from "@/pages/chat-page";
import SchedulePage from "@/pages/schedule-page";
import TestMessagesPage from "@/pages/test-messages-page";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/chat" />
      </Route>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute 
        path="/chat" 
        component={() => (
          <AppLayout>
            <ChatPage />
          </AppLayout>
        )} 
      />
      <ProtectedRoute 
        path="/schedule" 
        component={() => (
          <AppLayout>
            <SchedulePage />
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
      <ProtectedRoute 
        path="/facts" 
        component={() => (
          <AppLayout>
            <FactsPage />
          </AppLayout>
        )} 
      />
      <ProtectedRoute 
        path="/account" 
        component={() => (
          <AppLayout>
            <AccountPage />
          </AppLayout>
        )} 
      />
      <ProtectedRoute 
        path="/test-messages" 
        component={() => (
          <AppLayout>
            <TestMessagesPage />
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