"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type FeedRecord = {
  id: string;
  title: string;
  occurredAt: string;
  status: string;
  impact: string;
  node: { id: string; name: string; path: string };
  createdBy: { email: string };
};

export default function DashboardPage() {
  const [records, setRecords] = useState<FeedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    api.feeds
      .list(params)
      .then((r) => setRecords(r.records))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <div>Loading feed...</div>;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Feed</h1>
      <div className="mb-4 flex gap-4">
        <div>
          <label className="mr-2 text-sm">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border px-2 py-1"
          />
        </div>
        <div>
          <label className="mr-2 text-sm">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border px-2 py-1"
          />
        </div>
      </div>
      <ul className="space-y-2">
        {records.map((r) => (
          <li key={r.id} className="rounded border bg-white p-3">
            <Link href={`/records/${r.id}`} className="font-medium text-blue-600 hover:underline">
              {r.title}
            </Link>
            <div className="mt-1 text-sm text-gray-600">
              {r.node.path} • {new Date(r.occurredAt).toLocaleDateString()} • {r.status} • {r.impact}
            </div>
            <div className="text-xs text-gray-500">by {r.createdBy.email}</div>
          </li>
        ))}
      </ul>
      {records.length === 0 && <p className="text-gray-500">No records.</p>}
    </div>
  );
}
