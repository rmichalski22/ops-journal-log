"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    api.auth
      .me()
      .then(() => router.push("/dashboard"))
      .catch(() => router.push("/login"));
  }, [router]);

  return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
}
