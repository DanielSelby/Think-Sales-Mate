"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  CircleCheck,
  GraduationCap,
  Info,
  Layers3,
  PackageOpen,
  Search,
  ShoppingCart,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  updatePlatformProductCatalog,
  type PlatformProductCatalogActionResult,
} from "../actions";
import type { PlatformProductSlug } from "@/types/platform-database";

export type CatalogProduct = {
  slug: PlatformProductSlug;
  name: string;
  description: string;
  is_published: boolean;
  created_at: string;
  modules: string[];
  organizations: string[];
};

type CatalogSummary = {
  totalProducts: number;
  activeOrganizations: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
};

const PRODUCT_PRESENTATION: Record<PlatformProductSlug, {
  icon: LucideIcon;
  accent: string;
}> = {
  "thinksales-erp": {
    icon: ShoppingCart,
    accent: "bg-blue-600 text-white shadow-blue-200",
  },
  restaurant: {
    icon: Utensils,
    accent: "bg-orange-500 text-white shadow-orange-200",
  },
  "think-service-repairs": {
    icon: Wrench,
    accent: "bg-emerald-600 text-white shadow-emerald-200",
  },
};
const FALLBACK_PRESENTATION = {
  icon: PackageOpen,
  accent: "bg-slate-600 text-white shadow-slate-200",
};

function ProductCard({ product, canManage }: { product: CatalogProduct; canManage: boolean }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PlatformProductCatalogActionResult | null>(null);
  const presentation = PRODUCT_PRESENTATION[product.slug] ?? FALLBACK_PRESENTATION;
  const Icon = presentation.icon;

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const actionResult = await updatePlatformProductCatalog(formData);
        setResult(actionResult);
        if (actionResult.ok) {
          setIsEditing(false);
          router.refresh();
        }
      } catch (error) {
        setResult({
          ok: false,
          error: error instanceof Error ? error.message : "Could not save product settings.",
        });
      }
    });
  }

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm ${presentation.accent}`}>
          <Icon aria-hidden="true" className="h-6 w-6" />
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
          product.is_published
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${product.is_published ? "bg-emerald-500" : "bg-slate-400"}`} />
          {product.is_published ? "Published" : "Unpublished"}
        </span>
      </div>

      <div className="mt-4 min-h-24">
        <h2 className="text-lg font-bold tracking-tight text-slate-950">{product.name}</h2>
        <p className="mt-0.5 text-xs font-medium text-slate-500">Registered platform product</p>
        <p className="mt-3 line-clamp-3 min-h-14 text-sm leading-5 text-slate-600">
          {product.description || "No product description has been added."}
        </p>
      </div>

      <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-900">
          <Building2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          {product.organizations.length} {product.organizations.length === 1 ? "organization" : "organizations"} using this product
        </p>
        {product.organizations.length > 0 && (
          <p className="mt-1 truncate pl-6 text-xs text-blue-800" title={product.organizations.join(", ")}>
            {product.organizations.slice(0, 3).join(", ")}
            {product.organizations.length > 3 ? ` +${product.organizations.length - 3} more` : ""}
          </p>
        )}
      </div>

      <div className="mt-4 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mapped modules</p>
        {product.modules.length ? (
          <ul className="mt-2 space-y-1.5">
            {product.modules.slice(0, 4).map((module) => (
              <li key={module} className="flex items-start gap-2 text-xs text-slate-700">
                <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span>{module}</span>
              </li>
            ))}
            {product.modules.length > 4 && (
              <li className="pl-5 text-xs text-slate-500">and {product.modules.length - 4} more mapped modules</li>
            )}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-500">No product feature mappings are configured.</p>
        )}
      </div>

      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`mt-4 rounded-lg px-3 py-2 text-xs ${
            result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}

      {isEditing && (
        <form onSubmit={saveProduct} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
          <input type="hidden" name="slug" value={product.slug} />
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Display name</span>
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={product.name}
              disabled={!canManage || isPending}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Description</span>
            <textarea
              name="description"
              maxLength={1000}
              rows={3}
              defaultValue={product.description}
              disabled={!canManage || isPending}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Registration availability</span>
            <span className="relative block">
              <select
                name="isPublished"
                defaultValue={String(product.is_published)}
                disabled={!canManage || isPending}
                className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              >
                <option value="true">Published — available for registration requests</option>
                <option value="false">Unpublished — hidden from new requests</option>
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
            </span>
          </label>
          {canManage && (
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
              >
                {isPending ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setIsEditing(false);
                  setResult(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      )}

      {!isEditing && canManage && (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Manage product
          <span aria-hidden="true">→</span>
        </button>
      )}
      {!canManage && (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
          View only — platform management permission is required to edit.
        </p>
      )}
    </article>
  );
}

export function ProductCatalogDashboard({
  products,
  summary,
  canManage,
}: {
  products: CatalogProduct[];
  summary: CatalogSummary;
  canManage: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "recent">("name");
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matches = products.filter((product) =>
      !query
      || product.name.toLocaleLowerCase().includes(query)
      || product.slug.toLocaleLowerCase().includes(query)
      || product.description.toLocaleLowerCase().includes(query)
      || product.modules.some((module) => module.toLocaleLowerCase().includes(query))
      || product.organizations.some((organization) => organization.toLocaleLowerCase().includes(query))
    );
    return matches.sort((left, right) => sort === "name"
      ? left.name.localeCompare(right.name)
      : right.created_at.localeCompare(left.created_at));
  }, [products, search, sort]);

  const summaryCards = [
    { label: "Total products", value: summary.totalProducts, icon: PackageOpen, iconClass: "bg-blue-100 text-blue-700" },
    { label: "Active organizations", value: summary.activeOrganizations, icon: Building2, iconClass: "bg-emerald-100 text-emerald-700" },
    { label: "Total subscriptions", value: summary.totalSubscriptions, icon: Layers3, iconClass: "bg-violet-100 text-violet-700" },
    { label: "Active subscriptions", value: summary.activeSubscriptions, icon: CircleCheck, iconClass: "bg-teal-100 text-teal-700" },
  ];

  return (
    <>
      <section aria-label="Product catalog summary" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon, iconClass }) => (
          <article key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
              <Icon aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950">{value.toLocaleString()}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-md">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products, modules, organizations…"
            aria-label="Search products and organizations"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-slate-600">
          <span className="shrink-0">Sort by</span>
          <span className="relative">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as "name" | "recent")}
              className="appearance-none rounded-xl border border-slate-300 bg-white py-2.5 pl-3 pr-9 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="name">Name (A–Z)</option>
              <option value="recent">Recently added</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500" />
          </span>
        </label>
      </section>

      {filteredProducts.length ? (
        <section aria-label="Software products" className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <ProductCard key={product.slug} product={product} canManage={canManage} />
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Search aria-hidden="true" className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 font-semibold text-slate-900">No products found</h2>
          <p className="mt-1 text-sm text-slate-500">Try another product name, module, or organization.</p>
        </section>
      )}

      <aside className="flex gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-violet-50 p-4 sm:p-5">
        <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Adding another platform product?</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            New products need an application integration, supported product identifier, and entitlement mappings before they can be safely listed here. This catalog edits registered products only.
          </p>
        </div>
        <GraduationCap aria-hidden="true" className="ml-auto hidden h-7 w-7 shrink-0 text-violet-600 sm:block" />
      </aside>
    </>
  );
}
