import { ReactNode } from 'react';
import { SidebarProvider as UISidebarProvider } from "@/components/ui/sidebar";

export function SidebarProvider({ children }: { children: ReactNode }) {
  return (
    <UISidebarProvider collapsible="icon">
      {children}
    </UISidebarProvider>
  );
}