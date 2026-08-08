"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEPARTMENTS } from "@/lib/expenses/format";
import {
  CATEGORY_ICONS, CATEGORY_ICON_OPTIONS, CATEGORY_COLORS, CATEGORY_COLOR_OPTIONS,
  type CategoryIconKey, type CategoryColorKey,
} from "@/lib/expenses/categories";
import { createExpenseCategory, updateExpenseCategory, type CategoryInput } from "@/app/(dashboard)/expenses/categories/actions";

export interface EditingCategory {
  id: string;
  name: string;
  icon: CategoryIconKey;
  color: CategoryColorKey;
  description: string | null;
  department: string | null;
  budgetLimit: number | null;
}

interface CategoryDialogProps {
  open: boolean;
  onClose: () => void;
  editing: EditingCategory | null;
  onSaved: (name: string) => void;
}

export function CategoryDialog({ open, onClose, editing, onSaved }: CategoryDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState<CategoryIconKey>("Tag");
  const [color, setColor] = React.useState<CategoryColorKey>("blue");
  const [description, setDescription] = React.useState("");
  const [department, setDepartment] = React.useState<string>(DEPARTMENTS[0]);
  const [budgetLimit, setBudgetLimit] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setIcon(editing.icon);
      setColor(editing.color);
      setDescription(editing.description ?? "");
      setDepartment(editing.department ?? DEPARTMENTS[0]);
      setBudgetLimit(editing.budgetLimit ? String(editing.budgetLimit) : "");
    } else {
      setName(""); setIcon("Tag"); setColor("blue"); setDescription("");
      setDepartment(DEPARTMENTS[0]); setBudgetLimit("");
    }
    setError(null);
  }, [open, editing]);

  function submit() {
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    const input: CategoryInput = {
      name, icon, color, description: description || null, department: department || null,
      budgetLimit: budgetLimit ? Number(budgetLimit) : null,
    };
    startTransition(async () => {
      const result = editing ? await updateExpenseCategory(editing.id, input) : await createExpenseCategory(input);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onSaved(name);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={() => (isPending ? null : onClose())} title={editing ? "Edit Category" : "Add Category"} className="max-w-lg">
      <div className="space-y-3">
        <Field label="Category Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Operating Expenses" />
        </Field>

        <Field label="Icon">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ICON_OPTIONS.map((key) => {
              const Icon = CATEGORY_ICONS[key];
              return (
                <button
                  key={key}
                  onClick={() => setIcon(key)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md border",
                    icon === key ? "border-signal ring-2 ring-signal/30" : "border-ledger-200 dark:border-ledger-700"
                  )}
                >
                  <Icon className="h-4 w-4 text-ledger-500" />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLOR_OPTIONS.map((key) => (
              <button
                key={key}
                onClick={() => setColor(key)}
                className={cn(
                  "h-7 w-7 rounded-full",
                  CATEGORY_COLORS[key].bg,
                  color === key && "ring-2 ring-offset-2 ring-ink-900 dark:ring-white"
                )}
              />
            ))}
          </div>
        </Field>

        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Day to day operational costs" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Budget Limit (Optional)">
            <Input type="number" min={0} step="0.01" value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)} placeholder="0.00" />
          </Field>
        </div>

        {error && <p className="text-sm text-alert">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="md" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save Changes" : "Add Category"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ledger-500">{label} {required && <span className="text-alert">*</span>}</span>
      {children}
    </label>
  );
}