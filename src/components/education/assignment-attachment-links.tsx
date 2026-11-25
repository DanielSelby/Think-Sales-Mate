import type { EducationAssignmentAttachment } from "@/lib/education/assignments";

export function EducationAssignmentAttachmentLinks({
  attachments,
  label = "Attachments",
}: {
  attachments: EducationAssignmentAttachment[];
  label?: string;
}) {
  if (!attachments.length) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <ul className="mt-1 space-y-1">
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            <a
              href={`/api/education/assignment-attachments/${attachment.id}/download`}
              className="text-sm font-medium text-indigo-700 underline-offset-2 hover:underline"
            >
              {attachment.file_name} <span className="text-xs text-slate-500">({Math.ceil(attachment.file_size / 1024)} KB)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
