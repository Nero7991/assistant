import { Link } from "wouter";
import { Brain, Home, Target, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  isCollapsed?: boolean;
}

export function SidebarNav({ className, isCollapsed }: SidebarNavProps) {
  const { user, logoutMutation } = useAuth();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const items = [
    { icon: Home, label: "Dashboard", href: "/" },
    { icon: Target, label: "Goals", href: "/goals" },
  ];

  const NavContent = () => (
    <>
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
    </>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden fixed top-4 left-4 z-50">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[240px] bg-sidebar">
          <NavContent />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className={cn(
        "hidden md:flex flex-col h-screen bg-sidebar border-r border-sidebar-border",
        className
      )}
    >
      <NavContent />
    </div>
  );
}