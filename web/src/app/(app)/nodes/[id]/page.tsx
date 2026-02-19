"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { AddRecordForm } from "@/components/AddRecordForm";
import { AddNodeForm } from "@/components/AddNodeForm";

type NodeRecord = { id: string; title: string; occurredAt: string; status: string };

type Node = {
  id: string;
  name: string;
  path: string;
  slug: string;
  type: string;
  parent?: { id: string; name: string };
  createdBy: { email: string };
  records: NodeRecord[];
};

export default function NodeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [node, setNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subs, setSubs] = useState<{ id: string; nodeId: string }[]>([]);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);

  useEffect(() => {
    api.nodes
      .get(id)
      .then(setNode)
      .catch(() => router.push("/nodes"))
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    api.subscriptions
      .list()
      .then((r) => {
        setSubs(r.subscriptions);
        setSubscribed(r.subscriptions.some((s: { nodeId: string }) => s.nodeId === id));
      })
      .catch(() => {});
  }, [id]);

  async function toggleSubscribe() {
    try {
      if (subscribed) {
        const sub = subs.find((s) => s.nodeId === id);
        if (sub) {
          await api.subscriptions.delete(sub.id);
          setSubscribed(false);
          setSubs(subs.filter((s) => s.nodeId !== id));
        }
      } else {
        await api.subscriptions.create({ nodeId: id, includeDescendants: true });
        setSubscribed(true);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function refreshNode() {
    const n = await api.nodes.get(id);
    setNode(n);
    setShowAddRecord(false);
    setShowAddChild(false);
  }

  if (loading || !node) return <div>Loading...</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          {node.parent && (
            <Link href={`/nodes/${node.parent.id}`} className="text-sm text-blue-600 hover:underline">
              ← {node.parent.name}
            </Link>
          )}
          <h1 className="text-xl font-semibold">{node.name}</h1>
          <p className="text-sm text-gray-600">{node.path} • {node.type}</p>
          <p className="text-xs text-gray-500">created by {node.createdBy.email}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddChild(true)}
            className="rounded border px-3 py-1 text-sm hover:bg-gray-100"
          >
            Add child node
          </button>
          <button
            onClick={toggleSubscribe}
            className={`rounded px-3 py-1 text-sm ${subscribed ? "bg-gray-200" : "bg-blue-600 text-white"}`}
          >
            {subscribed ? "Unsubscribe" : "Subscribe"}
          </button>
        </div>
      </div>
      {showAddChild && <AddNodeForm parentId={id} onDone={refreshNode} onCancel={() => setShowAddChild(false)} />}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Change Records</h2>
        <button
          onClick={() => setShowAddRecord(true)}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        >
          Add record
        </button>
      </div>
      {showAddRecord && (
        <AddRecordForm nodeId={id} onDone={refreshNode} onCancel={() => setShowAddRecord(false)} />
      )}
      <ul className="mt-2 space-y-2">
        {node.records.map((r) => (
          <li key={r.id} className="rounded border bg-white p-2">
            <Link href={`/records/${r.id}`} className="text-blue-600 hover:underline">
              {r.title}
            </Link>
            <span className="ml-2 text-sm text-gray-600">
              {new Date(r.occurredAt).toLocaleDateString()} • {r.status}
            </span>
          </li>
        ))}
      </ul>
      {node.records.length === 0 && <p className="text-gray-500">No records.</p>}
    </div>
  );
}
