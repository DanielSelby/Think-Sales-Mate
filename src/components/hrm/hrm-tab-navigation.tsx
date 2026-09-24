"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users, CalendarCheck, ClipboardList, Wallet, FileText, Star, Building2, UserPlus,
  GraduationCap, PackageCheck, ShieldAlert, Network, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  ["Employees", "/hrm/employees", Users],
  ["Attendance", "/hrm/attendance", CalendarCheck],
  ["Leave Management", "/hrm/leave", ClipboardList],
  ["Payroll", "/hrm/payroll", Wallet],
  ["Payslips", "/hrm/payslips", FileText],
  ["Performance Reviews", "/hrm/performance-reviews", Star],
  ["Departments", "/hrm/departments", Building2],
  ["Recruitment", "/hrm/recruitment", UserPlus],
  ["Training & Development", "/hrm/training", GraduationCap],
  ["Asset Assignment", "/hrm/asset-assignment", PackageCheck],
  ["Discipline & Incidents", "/hrm/discipline", ShieldAlert],
  ["Organization Chart", "/hrm/organization-chart", Network],
  ["Reports & Analytics", "/hrm/reports", BarChart3],
] as const;

export function HrmTabNavigation({ visibleTabs }: { visibleTabs?: string[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="HRM sections" className="mb-5 overflow-x-auto border-b border-ledger-200 dark:border-ledger-700">
      <div className="flex min-w-max gap-1">
        {TABS.filter(([, href]) => !visibleTabs || visibleTabs.includes(href)).map(([label, href, Icon]) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors",
              active
                ? "border-signal text-signal"
                : "border-transparent text-ledger-500 hover:border-ledger-300 hover:text-ink-900 dark:hover:text-white"
            )}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
