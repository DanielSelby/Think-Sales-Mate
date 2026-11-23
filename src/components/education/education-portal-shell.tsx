import Link from "next/link";
import type { ReactNode } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Users,
  Wallet,
} from "lucide-react";

type EducationPortalRole = "parent" | "teacher" | "student";

type EducationPortalShellProps = {
  role: EducationPortalRole;
  title: string;
  activeItem: string;
  subtitle: string;
  userEmail?: string | null;
  children: ReactNode;
};

const portalNavigation: Record<EducationPortalRole, Array<{ label: string; href: string; icon: typeof LayoutDashboard }>> = {
  parent: [
    { label: "Dashboard", href: "/education-portal", icon: LayoutDashboard },
    { label: "My Children", href: "/education-portal#children", icon: Users },
    { label: "Attendance", href: "/education-portal#attendance", icon: CalendarDays },
    { label: "Academic Performance", href: "/education-portal#performance", icon: GraduationCap },
    { label: "Fees & Payments", href: "/education-portal#fees", icon: Wallet },
    { label: "Announcements", href: "/education-portal#announcements", icon: Bell },
  ],
  teacher: [
    { label: "Dashboard", href: "/teacher-education-portal", icon: LayoutDashboard },
    { label: "Homework & Assignments", href: "/teacher-education-portal#assignments", icon: BookOpen },
    { label: "My Classes", href: "/teacher-education-portal#classes", icon: Users },
    { label: "Attendance", href: "/teacher-education-portal#attendance", icon: CalendarDays },
    { label: "Timetable", href: "/teacher-education-portal#timetable", icon: GraduationCap },
  ],
  student: [
    { label: "Dashboard", href: "/student-education-portal", icon: LayoutDashboard },
    { label: "AI School Assistant", href: "/student-education-portal#assistant", icon: BookOpen },
    { label: "Homework & Assignments", href: "/student-education-portal#assignments", icon: ClipboardCheck },
    { label: "Attendance", href: "/student-education-portal#attendance", icon: CalendarDays },
    { label: "My Results", href: "/student-education-portal#results", icon: GraduationCap },
    { label: "Timetable", href: "/student-education-portal#timetable", icon: CalendarDays },
  ],
};

export function EducationPortalShell({
  role,
  title,
  activeItem,
  subtitle,
  userEmail,
  children,
}: EducationPortalShellProps) {
  const roleLabel = role === "parent" ? "Parent Portal" : role === "teacher" ? "Teacher Portal" : "Student Portal";
  const initial = userEmail?.trim().charAt(0).toUpperCase() || roleLabel.charAt(0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <aside className="bg-[#102a43] text-white lg:flex lg:min-h-screen lg:w-64 lg:shrink-0 lg:flex-col">
        <Link href="/" className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-400 text-[#102a43]">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-base font-bold tracking-wide">Think Education</span>
            <span className="block text-xs text-slate-300">{roleLabel}</span>
          </span>
        </Link>
        <nav aria-label={`${roleLabel} navigation`} className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:py-5">
          {portalNavigation[role].map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              aria-current={label === activeItem ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                label === activeItem
                  ? "bg-teal-500 text-white"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 text-xs text-slate-300 lg:block">
          Secure school portal
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex min-h-20 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {userEmail && <span className="hidden max-w-48 truncate text-sm text-slate-600 sm:block">{userEmail}</span>}
            <span aria-label={userEmail ? `Signed in as ${userEmail}` : roleLabel} className="grid h-10 w-10 place-items-center rounded-full bg-teal-100 text-sm font-bold text-teal-900">
              {initial}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function EducationPortalUnavailable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
          <BookOpen className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <div className="mt-1 text-sm leading-6 text-slate-600">{children}</div>
        </div>
      </div>
    </section>
  );
}
