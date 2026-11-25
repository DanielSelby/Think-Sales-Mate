import { TeacherEducationPortalPage } from "./portal-page";

export const dynamic = "force-dynamic";

export default function EducationTeacherPortalPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TeacherEducationPortalPage {...props} section="dashboard" />;
}
