import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./hooks/use-auth";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { ProtectedRoute } from "./lib/protected-route";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/app-layout";

import AuthPage from "@/pages/auth-page";
import TasksPage from "@/pages/tasks-page";
import FactsPage from "@/pages/facts-page";
import AccountPage from "@/pages/account-page";
import ChatPage from "@/pages/chat-page";
import SchedulePage from "@/pages/schedule-page";
import PeoplePage from "@/pages/people-page";
import TestMessagesPage from "@/pages/test-messages-page";
import IntegrationsPage from "@/pages/integrations-page";
import CreationsPage from "@/pages/creations-page";
import View from "@/pages/View";
import NotFound from "@/pages/not-found";
import AdminPage from "@/pages/admin-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import AgentPage from "@/pages/agent-page";
import { DevlmRunnerProvider } from "@/context/devlm-runner-context";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/chat" />
      </Route>
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
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
        path="/people" 
        component={() => (
          <AppLayout>
            <PeoplePage />
          </AppLayout>
        )} 
      />
      <ProtectedRoute 
        path="/creations" 
        component={() => (
          <AppLayout>
            <CreationsPage />
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
      <ProtectedRoute 
        path="/integrations" 
        component={() => (
          <AppLayout>
            <IntegrationsPage />
          </AppLayout>
        )} 
      />
      <ProtectedRoute
        path="/view"
        component={() => (
          <AppLayout>
            <View />
          </AppLayout>
        )}
      />
      <ProtectedRoute
        path="/agent"
        component={() => (
          <AppLayout>
            <DevlmRunnerProvider>
              <AgentPage />
            </DevlmRunnerProvider>
          </AppLayout>
        )}
      />
      <ProtectedRoute
        path="/master"
        component={() => (
          <AppLayout>
            <AdminPage />
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