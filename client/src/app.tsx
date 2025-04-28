import { Switch, Route, Redirect } from "wouter";
import ChatPage from "./pages/chat-page";
import AuthPage from "./pages/auth-page";
import AdminPage from "./pages/admin-page";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/toaster";

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>; // Or a spinner
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <AuthProvider>
          <Switch>
            <Route path="/auth" component={AuthPage} />
            <Route path="/admin">
              <PrivateRoute> 
                <AdminPage />
              </PrivateRoute>
            </Route>
            <Route path="/">
              <PrivateRoute>
                <ChatPage />
              </PrivateRoute>
            </Route>
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </AuthProvider>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App; 