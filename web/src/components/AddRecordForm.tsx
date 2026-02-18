"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export function AddRecordForm({
  nodeId,
  onDone,
  onCancel,
}: {
  nodeId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.records.create({
        nodeId,
        title,
        description,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded border bg-gray-50 p-4">
      <h3 className="mb-2 font-medium">New change record</h3>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="mb-2">
        <label className="block text-sm">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full rounded border px-2 py-1"
        />
      </div>
      <div className="mb-2">
        <label className="block text-sm">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={3}
          className="w-full rounded border px-2 py-1"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50">
          Create
        </button>
        <button type="button" onClick={onCancel} className="rounded border px-3 py-1 hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
