"use client";

interface UserSelectorProps {
  selectedUserId: string;
  selectedLocationId: string | null;
  users: Array<{ id: string; name: string }>;
}

export function UserSelector({ selectedUserId, selectedLocationId, users }: UserSelectorProps) {
  return (
    <form method="get" className="flex h-10 items-center gap-2 rounded-lg border border-[#d5e2ef] bg-white px-3 text-xs font-medium text-[#31577c] shadow-sm dark:border-ledger-700 dark:bg-ink-900">
      {selectedLocationId && <input type="hidden" name="location_id" value={selectedLocationId} />}
      <label>
        User{" "}
        <select
          name="user_id"
          defaultValue={selectedUserId}
          onChange={(event) => event.currentTarget.form?.submit()}
          className="max-w-[150px] bg-transparent outline-none"
        >
          <option value="">All users</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </label>
    </form>
  );
}
