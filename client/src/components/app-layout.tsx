import { ReactNode } from "react";
import { MainNav } from "@/components/main-nav";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MainNav />
      <main className="container mx-auto p-4 pt-20 md:p-8 md:pt-24 flex-grow">
        {children}
      </main>
      <footer className="py-4 border-t mt-auto">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Oren's Lab. All rights reserved.
        </div>
      </footer>
    </div>
  );
}