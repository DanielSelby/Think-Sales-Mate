import { notFound } from "next/navigation";
import { StudentEducationPortalPage } from "../portal-page";

export const dynamic = "force-dynamic";

const SECTIONS = ["assistant", "assignments", "attendance", "results", "timetable"] as const;

export default async function EducationStudentPortalSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  const selectedSection = SECTIONS.find((candidate) => candidate === section);
  if (!selectedSection) notFound();

  return <StudentEducationPortalPage
    searchParams={searchParams}
    section={selectedSection}
  />;
}
