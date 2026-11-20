"use client";

export function ConfirmDeleteButton() {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (!window.confirm("Delete this unposted expense? This action cannot be undone.")) {
          event.preventDefault();
        }
      }}
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
    >
      Delete
    </button>
  );
}
