import type { ReactNode } from "react";

export default function AssetsLayout({ children }: { children: ReactNode }) {
  return <div className="asset-pages">{children}</div>;
}
