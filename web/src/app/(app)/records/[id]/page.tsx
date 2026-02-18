"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

type Record = {
  id: string;
  title: string;
  description: string;
  reason: string | null;
  occurredAt: string;
  changeType: string;
  impact: string;
  status: string;
  links: string[];
  node: { id: string; name: string; path: string };
  createdBy: { email: string };
  updatedBy: { email: string } | null;
  revisions: Array<{
    id: string;
    createdAt: string;
    editor: { email: string };
    snapshotBefore: Record<string, unknown>;
    snapshotAfter: Record<string, unknown>;
  }>;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function RecordDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [record, setRecord] = useState<Record | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRevisions, setShowRevisions] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.records
      .get(id)
      .then(setRecord)
      .catch(() => router.push("/dashboard"))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.attachments.upload(id, file);
      const r = await api.records.get(id);
      setRecord(r);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (loading || !record) return <div>Loading...</div>;

  return (
    <div>
      <Link href={`/nodes/${record.node.id}`} className="text-sm text-blue-600 hover:underline">
        ← {record.node.path}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{record.title}</h1>
      <div className="mt-2 text-sm text-gray-600">
        {new Date(record.occurredAt).toLocaleString()} • {record.changeType} • {record.impact} • {record.status}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        by {record.createdBy.email}
        {record.updatedBy && ` • updated by ${record.updatedBy.email}`}
      </div>

      <div className="mt-4">
        <h2 className="font-medium">Description</h2>
        <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-100 p-2 text-sm">{record.description}</pre>
      </div>
      {record.reason && (
        <div className="mt-4">
          <h2 className="font-medium">Reason</h2>
          <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-100 p-2 text-sm">{record.reason}</pre>
        </div>
      )}
      {record.links.length > 0 && (
        <div className="mt-4">
          <h2 className="font-medium">Links</h2>
          <ul className="mt-1 list-inside list-disc">
            {record.links.map((url, i) => (
              <li key={i}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Attachments</h2>
          <label className="cursor-pointer rounded bg-gray-200 px-2 py-1 text-sm hover:bg-gray-300">
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            {uploading ? "Uploading..." : "Upload"}
          </label>
        </div>
        {record.attachments.length === 0 ? (
          <p className="text-sm text-gray-500">None</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {record.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`${API}/api/attachments/${a.id}/download`}
                  className="text-blue-600 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {a.filename} ({(a.sizeBytes / 1024).toFixed(1)} KB)
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <button
          onClick={() => setShowRevisions(!showRevisions)}
          className="rounded bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300"
        >
          {showRevisions ? "Hide" : "Show"} revision history
        </button>
        {showRevisions && (
          <ul className="mt-2 space-y-2">
            {record.revisions.map((rev) => (
              <li key={rev.id} className="rounded border bg-gray-50 p-2 text-sm">
                <div>{new Date(rev.createdAt).toLocaleString()} by {rev.editor.email}</div>
                {Object.keys(rev.snapshotBefore).length > 0 && (
                  <details className="mt-1">
                    <summary>Diff</summary>
                    <pre className="mt-1 overflow-auto text-xs">
                      Before: {JSON.stringify(rev.snapshotBefore, null, 2)}
                    </pre>
                    <pre className="mt-1 overflow-auto text-xs">
                      After: {JSON.stringify(rev.snapshotAfter, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
