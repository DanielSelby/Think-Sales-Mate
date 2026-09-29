import type { ReactNode } from "react";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <div className="business-reports-page">{children}</div>;
}
