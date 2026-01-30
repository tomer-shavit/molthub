"use client";

import { Sidebar } from "./sidebar";
import { useUserStage } from "@/lib/user-stage-context";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { stage, isLoading } = useUserStage();

  // Empty stage: full-width layout without sidebar
  if (stage === "empty" && !isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <main>
          <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="md:pl-64">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
