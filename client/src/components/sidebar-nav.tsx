import { Link } from "wouter";
import { Brain, Home, Target, LogOut, Menu, ListTodo, UserCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {}

export function SidebarNav({ className }: SidebarNavProps) {
  const { user, logoutMutation } = useAuth();

  const items = [
    { icon: Home, label: "Dashboard", href: "/" },
    { icon: Target, label: "Goals", href: "/goals" },
    { icon: ListTodo, label: "Tasks", href: "/tasks" },
    { icon: UserCircle2, label: "User Facts", href: "/facts" },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2">
          <Brain className="h-6 w-6" />
          <span className="font-bold">ADHD Coach</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                {({ isActive }) => (
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                )}
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        {user && (
          <>
            <div className="px-4 py-2 text-sm text-muted-foreground">
              Signed in as {user.username}
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}