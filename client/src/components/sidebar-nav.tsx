import { Link } from "wouter";
import { Brain, Home, Target, LogOut, Menu, ChevronLeft, ChevronRight, ListTodo, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useSidebar } from "@/hooks/use-sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {}

export function SidebarNav({ className }: SidebarNavProps) {
  const { user, logoutMutation } = useAuth();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { isCollapsed, toggle } = useSidebar();

  const items = [
    { icon: Home, label: "Dashboard", href: "/" },
    { icon: Target, label: "Goals", href: "/goals" },
    { icon: ListTodo, label: "Tasks", href: "/tasks" },
    { icon: UserCircle2, label: "User Facts", href: "/facts" },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center gap-2">
        <Brain className="h-6 w-6" />
        {!isCollapsed && (
          <span className="font-bold">ADHD Coach</span>
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
                  isActive && "bg-accent"
                )}
              >
                <item.icon className="h-4 w-4" />
                {!isCollapsed && <span className="ml-2">{item.label}</span>}
              </Button>
            )}
          </Link>
        ))}
      </nav>

      <div className="p-2 border-t mt-auto">
        {user && (
          <>
            {!isCollapsed && (
              <div className="px-2 py-1.5 text-sm">
                Signed in as {user.username}
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="h-4 w-4" />
              {!isCollapsed && <span className="ml-2">Sign Out</span>}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <Button variant="ghost" size="icon" className="fixed top-4 left-4 z-50 md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <NavContent />
            </SheetContent>
          </Sheet>
        </Button>
      </>
    );
  }

  return (
    <aside
      className={cn(
        "hidden md:block fixed inset-y-0 left-0 z-40 bg-background border-r transition-all duration-300",
        isCollapsed ? "w-16" : "w-64",
        className
      )}
    >
      <NavContent />
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-4 top-8 hidden md:flex h-8 w-8 rounded-full border bg-background"
        onClick={toggle}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>
    </aside>
  );
}