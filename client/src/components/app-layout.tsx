import { ReactNode } from "react";
import { MainNav } from "@/components/main-nav";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <MainNav />
      <main className="container mx-auto p-4 pt-20 md:p-8 md:pt-24">
        {children}
      </main>
    </div>
  );
}