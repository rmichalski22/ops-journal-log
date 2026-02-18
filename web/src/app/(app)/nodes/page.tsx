"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AddNodeForm } from "@/components/AddNodeForm";

type TreeNode = {
  id: string;
  name: string;
  path: string;
  slug: string;
  children: TreeNode[];
};

export default function NodesPage() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRoot, setShowAddRoot] = useState(false);

  async function refresh() {
    const r = await api.nodes.tree();
    setTree(r.tree);
    setShowAddRoot(false);
  }

  useEffect(() => {
    api.nodes
      .tree()
      .then((r) => setTree(r.tree))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function renderNode(n: TreeNode) {
    return (
      <li key={n.id} className="ml-4">
        <Link href={`/nodes/${n.id}`} className="text-blue-600 hover:underline">
          {n.name}
        </Link>
        {n.children.length > 0 && (
          <ul className="mt-1">{n.children.map(renderNode)}</ul>
        )}
      </li>
    );
  }

  if (loading) return <div>Loading nodes...</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Node Tree</h1>
        <button
          onClick={() => setShowAddRoot(true)}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        >
          Add root node
        </button>
      </div>
      {showAddRoot && <AddNodeForm parentId={null} onDone={refresh} onCancel={() => setShowAddRoot(false)} />}
      <ul>{tree.map(renderNode)}</ul>
      {tree.length === 0 && !showAddRoot && <p className="text-gray-500">No nodes. Add a root node to get started.</p>}
    </div>
  );
}
