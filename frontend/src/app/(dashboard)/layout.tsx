import { Sidebar } from "@/components/Sidebar";
import { AuthGate } from "@/components/AuthGate";
import { PageTransition } from "@/components/PageTransition";
import { GlobalFilters } from "@/components/GlobalFilters";
import { Suspense } from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="ambient-glow" />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Suspense>
            <GlobalFilters />
          </Suspense>
          <main className="flex-1 overflow-y-auto">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
