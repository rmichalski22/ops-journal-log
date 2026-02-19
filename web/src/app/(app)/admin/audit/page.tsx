"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Event = {
  id: string;
  type: string;
  actorId: string | null;
  actor: { email: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export default function AuditPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (type) params.type = type;
    if (actorId) params.actorId = actorId;
    if (from) params.from = from;
    if (to) params.to = to;
    api.admin
      .audit(params)
      .then((r) => {
        setEvents(r.events);
        setTotal(r.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [type, actorId, from, to]);

  if (loading) return <div>Loading audit log...</div>;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Audit Log</h1>
      <div className="mb-4 flex flex-wrap gap-4">
        <div>
          <label className="mr-2 text-sm">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border px-2 py-1"
          >
            <option value="">All</option>
            <option value="node_create">node_create</option>
            <option value="node_rename">node_rename</option>
            <option value="node_move">node_move</option>
            <option value="node_restrict">node_restrict</option>
            <option value="node_delete">node_delete</option>
            <option value="record_create">record_create</option>
            <option value="record_edit">record_edit</option>
            <option value="record_delete">record_delete</option>
            <option value="attachment_upload">attachment_upload</option>
            <option value="attachment_delete">attachment_delete</option>
            <option value="subscription_add">subscription_add</option>
            <option value="subscription_remove">subscription_remove</option>
            <option value="notification_sent">notification_sent</option>
            <option value="notification_failure">notification_failure</option>
            <option value="login_success">login_success</option>
            <option value="login_failure">login_failure</option>
          </select>
        </div>
        <div>
          <label className="mr-2 text-sm">Actor ID</label>
          <input
            type="text"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            placeholder="User ID"
            className="rounded border px-2 py-1"
          />
        </div>
        <div>
          <label className="mr-2 text-sm">From</label>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border px-2 py-1"
          />
        </div>
        <div>
          <label className="mr-2 text-sm">To</label>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border px-2 py-1"
          />
        </div>
      </div>
      <p className="mb-2 text-sm text-gray-600">Total: {total}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left">Time</th>
              <th className="border px-2 py-1 text-left">Type</th>
              <th className="border px-2 py-1 text-left">Actor</th>
              <th className="border px-2 py-1 text-left">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="border px-2 py-1 text-sm">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="border px-2 py-1 text-sm">{e.type}</td>
                <td className="border px-2 py-1 text-sm">{e.actor?.email ?? e.actorId ?? "-"}</td>
                <td className="border px-2 py-1 text-sm">
                  <pre className="max-w-md overflow-auto text-xs">
                    {JSON.stringify(e.metadata)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
