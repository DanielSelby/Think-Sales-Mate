"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteProject } from "@/app/(dashboard)/projects/actions";

export interface ProjectRow {
  id: string;
  name: string;
  customerName: string | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  budget: number | null;
  endDate: string | null;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const STATUS_STYLES: Record<ProjectRow["status"], string> = {
  planning: "bg-ledger-100 text-ledger-600 dark:bg-white/10 dark:text-ledger-300",
  active: "bg-signal-soft text-signal",
  on_hold: "bg-amber-soft text-amber",
  completed: "bg-ledger-100 text-ledger-500 dark:bg-white/5 dark:text-ledger-400",
  cancelled: "bg-alert-soft text-alert"
};

const STATUS_LABELS: Record<ProjectRow["status"], string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled"
};

export function ProjectsTable({ projects, canManage }: { projects: ProjectRow[]; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}"? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteProject(id);
      if (result?.error) setError(result.error);
    });
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">No projects yet — add your first one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <table className="w-full text-sm">
          <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
            <tr>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3 text-right">Budget</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                <td className="px-4 py-3 text-ink-900 dark:text-white">{project.name}</td>
                <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{project.customerName ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[project.status]}`}>
                    {STATUS_LABELS[project.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">
                  {project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-right figure text-ink-900 dark:text-white">
                  {project.budget != null ? `$${formatMoney(project.budget)}` : "—"}
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/projects/${project.id}/edit`}
                        className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                        aria-label={`Edit ${project.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDelete(project.id, project.name)}
                        disabled={isPending}
                        className="text-ledger-400 hover:text-alert disabled:opacity-40"
                        aria-label={`Remove ${project.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}