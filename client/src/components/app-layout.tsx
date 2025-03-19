import { ReactNode } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarNav />
      <main className={cn(
        "flex-1 transition-all duration-300",
        isCollapsed ? "pl-16" : "pl-64",
        "md:pt-0 pt-16" // Account for mobile menu button
      )}>
        <div className="max-w-4xl mx-auto w-full p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
