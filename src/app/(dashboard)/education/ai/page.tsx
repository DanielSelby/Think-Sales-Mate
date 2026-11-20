import { AiAssistantPage } from "@/app/(dashboard)/ai/page";

export const metadata = { title: "Think Education AI Assistant" };

export default async function EducationAiAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <AiAssistantPage
      searchParams={searchParams}
      productLabel="Think Education"
    />
  );
}
