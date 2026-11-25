import { StudentEducationPortalPage } from "./portal-page";

export const dynamic = "force-dynamic";

export default function EducationStudentPortalPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <StudentEducationPortalPage {...props} section="dashboard" />;
}
