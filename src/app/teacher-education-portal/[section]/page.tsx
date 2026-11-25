import { notFound } from "next/navigation";
import { TeacherEducationPortalPage } from "../portal-page";

export const dynamic = "force-dynamic";

const SECTIONS = ["assignments", "classes", "attendance", "timetable"] as const;

export default async function EducationTeacherPortalSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  const selectedSection = SECTIONS.find((candidate) => candidate === section);
  if (!selectedSection) notFound();

  return <TeacherEducationPortalPage
    searchParams={searchParams}
    section={selectedSection}
  />;
}
