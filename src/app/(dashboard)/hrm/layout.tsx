import { HrmTabNavigation } from "@/components/hrm/hrm-tab-navigation";

export default function HrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <HrmTabNavigation />
      {children}
    </div>
  );
}
