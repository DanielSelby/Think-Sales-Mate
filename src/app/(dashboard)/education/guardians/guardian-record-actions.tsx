"use client";

import { useFormStatus } from "react-dom";
import {
  deleteEducationGuardianRecord,
  saveEducationGuardianRecord,
} from "../actions";

function DeleteButton({
  label,
  confirmation,
}: {
  label: string;
  confirmation: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Deleting..." : label}
    </button>
  );
}

export function GuardianRecordActions({
  relationshipId,
  guardianId,
  firstName,
  lastName,
  email,
  phone,
  relationship,
  isPrimary,
  canEdit,
  canDeleteRelationship,
  canDeleteProfile,
}: {
  relationshipId: string;
  guardianId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  relationship: string;
  isPrimary: boolean;
  canEdit: boolean;
  canDeleteRelationship: boolean;
  canDeleteProfile: boolean;
}) {
  return (
    <div className="w-full border-t border-slate-100 pt-3">
      <div className="flex flex-wrap gap-3">
        {canEdit && (
          <details className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Edit guardian and relationship
            </summary>
            <form action={saveEducationGuardianRecord} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="relationship_id" value={relationshipId} />
              <label className="text-sm font-medium text-slate-700">
                First name
                <input required maxLength={100} name="first_name" defaultValue={firstName} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Last name
                <input required maxLength={100} name="last_name" defaultValue={lastName} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Email
                <input type="email" maxLength={254} name="email" defaultValue={email ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Phone
                <input type="tel" maxLength={40} name="phone" defaultValue={phone ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Relationship to student
                <select required name="relationship" defaultValue={relationship} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                  {!["Mother", "Father", "Guardian", "Grandparent", "Other"].includes(relationship) && <option value={relationship}>{relationship}</option>}
                  {["Mother", "Father", "Guardian", "Grandparent", "Other"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
                <input type="checkbox" name="is_primary" defaultChecked={isPrimary} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                Primary contact for this student
              </label>
              <button type="submit" className="w-fit rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 sm:col-span-2">
                Save changes
              </button>
            </form>
          </details>
        )}
        {(canDeleteRelationship || canDeleteProfile) && (
          <details className="rounded-lg border border-rose-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-rose-700">
              Delete options
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {canDeleteRelationship && (
                <form action={deleteEducationGuardianRecord}>
                  <input type="hidden" name="delete_mode" value="relationship" />
                  <input type="hidden" name="relationship_id" value={relationshipId} />
                  <DeleteButton
                    label="Remove this student link"
                    confirmation="Remove only this guardian–student relationship? Other student links and the guardian profile will remain."
                  />
                </form>
              )}
              {canDeleteProfile && (
                <form action={deleteEducationGuardianRecord}>
                  <input type="hidden" name="delete_mode" value="guardian" />
                  <input type="hidden" name="guardian_id" value={guardianId} />
                  <DeleteButton
                    label="Delete guardian and all links"
                    confirmation="Delete this guardian profile and all of its student links? This cannot be undone. Guardian profiles with payment history cannot be deleted."
                  />
                </form>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
