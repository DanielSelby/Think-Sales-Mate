"use client";

import { useState } from "react";

export function OpenRegisterOverrideFields({
  canOverride,
  sessions,
}: {
  canOverride: boolean;
  sessions: Array<{ registerName: string; cashierName: string; branchName: string; openedAt: string }>;
}) {
  const [override, setOverride] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="font-semibold">POS registers are still open for this closing period.</p>
      <ul className="list-inside list-disc space-y-1">
        {sessions.map((session, index) => (
          <li key={`${session.registerName}-${session.openedAt}-${index}`}>
            {session.branchName} · {session.registerName} · {session.cashierName} · opened {new Date(session.openedAt).toLocaleString()}
          </li>
        ))}
      </ul>
      {canOverride ? (
        <>
          <label className="flex items-start gap-2 font-medium">
            <input
              type="checkbox"
              name="override_open_register"
              value="on"
              checked={override}
              onChange={(event) => setOverride(event.target.checked)}
              className="mt-0.5"
            />
            Continue without closing these registers (manager override)
          </label>
          {override && (
            <label className="block font-medium">
              Override reason (required)
              <textarea
                name="open_register_override_reason"
                required
                minLength={5}
                rows={2}
                className="mt-1 w-full rounded-md border border-amber-300 bg-white p-2 text-ink-900 dark:border-amber-800 dark:bg-ink-950 dark:text-white"
                placeholder="Explain why the end-of-day closing must proceed."
              />
            </label>
          )}
        </>
      ) : (
        <p>Close the listed POS registers before completing the end-of-day account. A manager with approval access can override with a reason.</p>
      )}
    </div>
  );
}
