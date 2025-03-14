import { Link } from "wouter";
import { Brain, Home, Target, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  isCollapsed?: boolean;
}

export function SidebarNav({ className, isCollapsed }: SidebarNavProps) {
  const { user, logoutMutation } = useAuth();

  const items = [
    { icon: Home, label: "Dashboard", href: "/" },
    { icon: Target, label: "Goals", href: "/goals" },
  ];

  return (
    <div
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border",
        className
      )}
    >
      <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
        <Brain className="h-6 w-6 text-sidebar-primary" />
        {!isCollapsed && (
          <span className="font-bold text-sidebar-foreground">ADHD Coach</span>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            {({ isActive }) => (
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start",
                  isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4 mr-2" />
                {!isCollapsed && item.label}
              </Button>
            )}
          </Link>
        ))}
      </nav>

      <div className="p-2 border-t border-sidebar-border">
        {user && (
          <>
            <div className="px-2 py-1.5 text-sm text-sidebar-foreground">
              {!isCollapsed && `Signed in as ${user.username}`}
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="h-4 w-4 mr-2" />
              {!isCollapsed && "Sign Out"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
