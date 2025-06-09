import { Link, useLocation } from "wouter";
import { Brain, Menu, LogOut, Settings, MessageCircle, Home, CheckSquare, BookOpen, Calendar, Terminal, Users, Webhook } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navItems = [
  // { label: "Dashboard", href: "/", icon: <Home className="h-4 w-4 mr-2" /> },
  { label: "Chat", href: "/chat", icon: <MessageCircle className="h-4 w-4 mr-2" /> },
  { label: "Schedule", href: "/schedule", icon: <Calendar className="h-4 w-4 mr-2" /> },
  { label: "Tasks & Goals", href: "/tasks", icon: <CheckSquare className="h-4 w-4 mr-2" /> },
  { label: "People", href: "/people", icon: <Users className="h-4 w-4 mr-2" /> },
  { label: "Facts", href: "/facts", icon: <BookOpen className="h-4 w-4 mr-2" /> },
  { label: "Integrations", href: "/integrations", icon: <Webhook className="h-4 w-4 mr-2" /> },
  { label: "DevLM Runner", href: "/view", icon: <Terminal className="h-4 w-4 mr-2" /> },
];

export function MainNav() {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="flex h-14 items-center px-4 md:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-8">
          <Brain className="h-6 w-6" />
          <span className="font-bold">Kona</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                location === item.href
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Mobile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="ml-2">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <DropdownMenuItem className="cursor-pointer">
                  {item.icon}
                  {item.label}
                </DropdownMenuItem>
              </Link>
            ))}
            {user && (
              <>
                <DropdownMenuSeparator />
                <Link href="/account">
                  <DropdownMenuItem className="cursor-pointer">
                    <Settings className="h-4 w-4 mr-2" />
                    Account Settings
                  </DropdownMenuItem>
                </Link>
                <Link href="/test-messages">
                  <DropdownMenuItem className="cursor-pointer">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Test Messages
                  </DropdownMenuItem>
                </Link>
                {user?.isAdmin && (
                  <Link href="/master">
                    <DropdownMenuItem className="cursor-pointer font-semibold text-indigo-600 hover:text-indigo-500">
                      Admin Settings
                    </DropdownMenuItem>
                  </Link>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Section */}
        <div className="flex items-center gap-4 ml-auto">
          {user && (
            <>
              {/* User Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="flex items-center gap-2">
                    <span className="text-sm hidden md:block">{user.username}</span>
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                  <Link href="/account">
                    <DropdownMenuItem className="cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      Account Settings
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/test-messages">
                    <DropdownMenuItem className="cursor-pointer">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Test Messages
                    </DropdownMenuItem>
                  </Link>
                  {user?.isAdmin && (
                    <Link href="/master">
                      <DropdownMenuItem className="cursor-pointer font-semibold text-indigo-600 hover:text-indigo-500">
                        Admin Settings
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="cursor-pointer text-destructive"
                    onClick={() => logoutMutation.mutate()}
                    disabled={logoutMutation.isPending}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}