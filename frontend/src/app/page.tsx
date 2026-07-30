"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isSignedIn } from "@/components/AuthGate";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isSignedIn() ? "/executive" : "/login");
  }, [router]);

  return <div className="min-h-screen bg-[#05040d]" />;
}
