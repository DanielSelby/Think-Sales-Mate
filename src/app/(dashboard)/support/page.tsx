import Link from "next/link";
import { ArrowUpRight, Globe, Headphones, MapPin, MessageCircle, Package, Mail, ShieldCheck } from "lucide-react";

export const metadata = { title: "Developer & Support · ThinkSales" };

const support = {
  name: process.env.DEVELOPER_NAME || "ThinkSales Technology Team",
  email: process.env.DEVELOPER_EMAIL || "support@thinksales.app",
  phone: process.env.DEVELOPER_PHONE || "+233 000 000 000",
  whatsapp: process.env.DEVELOPER_WHATSAPP || "+233 000 000 000",
  location: process.env.DEVELOPER_LOCATION || "Accra, Ghana",
  website: process.env.DEVELOPER_WEBSITE || "https://thinksales.app",
  packageName: process.env.APP_PACKAGE_NAME || "ThinkSales Pro",
};

const cards = [
  { label: "Support email", value: support.email, href: `mailto:${support.email}`, icon: Mail },
  { label: "WhatsApp", value: support.whatsapp, href: `https://wa.me/${support.whatsapp.replace(/\D/g, "")}`, icon: MessageCircle },
  { label: "Website", value: support.website.replace(/^https?:\/\//, ""), href: support.website, icon: Globe },
];

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-10 text-white shadow-xl sm:px-10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100">
            <ShieldCheck className="h-3.5 w-3.5" /> Official developer support
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">We are here to keep your business moving.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
            Contact the ThinkSales team for product guidance, technical support, account questions, and implementation help.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href={`mailto:${support.email}`} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-blue-50">
              Contact support <ArrowUpRight className="h-4 w-4" />
            </a>
            <Link href="/settings" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
              System settings
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map(({ label, value, href, icon: Icon }) => (
          <a key={label} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5" /></div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-800 group-hover:text-blue-700">{value}</p>
          </a>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Developer information</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">{support.name}</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Info icon={MapPin} label="Location" value={support.location} />
            <Info icon={Package} label="Package" value={support.packageName} />
            <Info icon={Headphones} label="Support hours" value="Monday – Friday · 8:00 – 17:00 GMT" />
            <Info icon={ShieldCheck} label="Service status" value="Operational support available" />
          </div>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Before contacting us</p>
          <h2 className="mt-2 text-lg font-bold text-slate-900">Help us resolve it faster</h2>
          <ul className="mt-4 space-y-3 text-sm leading-5 text-slate-600">
            <li>• Include the page and action where the issue occurred.</li>
            <li>• Share a screenshot without passwords or private keys.</li>
            <li>• Include your branch or location when relevant.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-xs text-slate-400">{label}</p><p className="mt-0.5 text-sm font-semibold text-slate-700">{value}</p></div></div>;
}
