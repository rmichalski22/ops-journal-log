"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    api.auth
      .me()
      .then((r) => setUser(r.user))
      .catch(() => router.push("/login"));
  }, [router]);

  async function logout() {
    await api.auth.logout();
    router.push("/login");
    router.refresh();
  }

  if (!user) return <div className="p-4">Loading...</div>;

  return (
    <div className="min-h-screen">
      <nav className="border-b bg-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <Link href="/dashboard" className={pathname === "/dashboard" ? "font-medium" : ""}>
              Feed
            </Link>
            <Link href="/nodes" className={pathname?.startsWith("/nodes") ? "font-medium" : ""}>
              Nodes
            </Link>
            {user.role === "admin" && (
              <Link href="/admin/audit" className={pathname?.startsWith("/admin") ? "font-medium" : ""}>
                Audit
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user.email}</span>
            <button onClick={logout} className="text-sm text-blue-600 hover:underline">
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="p-4">{children}</main>
    </div>
  );
}
