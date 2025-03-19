import { ReactNode } from "react";
import { SidebarNav } from "@/components/sidebar-nav";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen relative bg-background">
      <SidebarNav />
      <div className="flex min-h-screen">
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}