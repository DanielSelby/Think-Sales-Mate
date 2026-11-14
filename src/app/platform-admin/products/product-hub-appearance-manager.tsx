"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ImagePlus, Moon, Sun } from "lucide-react";
import {
  saveProductHubCardBackground,
  saveProductHubTheme,
  uploadProductHubArtwork,
  type ProductHubAppearanceActionResult,
} from "../actions";
import type { ProductHubBranding } from "@/lib/supabase/platform-admin";
import type { PlatformProductSlug } from "@/types/platform-database";

interface ProductOption {
  slug: PlatformProductSlug;
  name: string;
}

function ArtworkUploader({
  assetType,
  productSlug,
  label,
  description,
  imageUrl,
  canManage,
}: {
  assetType: "hero" | "about" | "product" | "product-background";
  productSlug?: PlatformProductSlug;
  label: string;
  description: string;
  imageUrl: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ProductHubAppearanceActionResult | null>(null);
  const imageFit = assetType === "product-background" ? "object-cover" : "object-contain p-2";

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const actionResult = await uploadProductHubArtwork(formData);
        setResult(actionResult);
        if (actionResult.ok) {
          form.reset();
          router.refresh();
        }
      } catch (error) {
        setResult({
          ok: false,
          error: error instanceof Error ? error.message : "Could not upload this image.",
        });
      }
    });
  }

  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4">
      <div className={`relative mb-3 flex w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 ${
        assetType === "hero" ? "aspect-[16/5] max-h-40" : assetType === "about" ? "aspect-[4/3] max-h-40" : assetType === "product-background" ? "aspect-[16/7] max-h-40" : "aspect-square max-h-40"
      }`}>
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill unoptimized className={imageFit} />
        ) : (
          <div className="text-center text-slate-400">
            <ImagePlus aria-hidden="true" className="mx-auto h-7 w-7" />
            <p className="mt-1 text-xs">No image uploaded</p>
          </div>
        )}
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
      <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{description}</p>
      <form onSubmit={upload} className="mt-3 space-y-2">
        <input type="hidden" name="assetType" value={assetType} />
        {productSlug && <input type="hidden" name="productSlug" value={productSlug} />}
        <label className="block">
          <span className="sr-only">Choose {label.toLowerCase()}</span>
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/svg+xml,image/webp"
            required
            disabled={!canManage || isPending}
            className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
        </label>
        <button
          type="submit"
          disabled={!canManage || isPending}
          className="w-full rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
        </button>
      </form>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`mt-2 text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </article>
  );
}

function ProductCardBackgroundToggle({
  productSlug,
  productName,
  imageUrl,
  initialEnabled,
  canManage,
}: {
  productSlug: PlatformProductSlug;
  productName: string;
  imageUrl: string | null;
  initialEnabled: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ProductHubAppearanceActionResult | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const formData = new FormData(event.currentTarget);
    formData.set("productSlug", productSlug);
    formData.set("showBackground", String(formData.has("showBackground")));
    startTransition(async () => {
      try {
        const actionResult = await saveProductHubCardBackground(formData);
        setResult(actionResult);
        if (actionResult.ok) router.refresh();
      } catch (error) {
        setResult({
          ok: false,
          error: error instanceof Error ? error.message : "Could not save product card background settings.",
        });
      }
    });
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="showBackground"
          value="true"
          defaultChecked={initialEnabled}
          disabled={!canManage || isPending || !imageUrl}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-50"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-900">Show background on Product Hub card</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {imageUrl ? `Control whether ${productName} uses its uploaded card image.` : "Upload a card background image before enabling it."}
          </span>
        </span>
      </label>
      <button
        type="submit"
        disabled={!canManage || isPending || !imageUrl}
        className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save background setting"}
      </button>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`mt-2 text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </form>
  );
}

export function ProductHubAppearanceManager({
  branding,
  products,
  canManage,
}: {
  branding: ProductHubBranding;
  products: ProductOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [darkThemeEnabled, setDarkThemeEnabled] = useState(branding.darkThemeEnabled);
  const [darkSurfaceStyle, setDarkSurfaceStyle] = useState(branding.darkSurfaceStyle);
  const [result, setResult] = useState<ProductHubAppearanceActionResult | null>(null);

  function saveTheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const formData = new FormData(event.currentTarget);
    formData.set("darkThemeEnabled", String(darkThemeEnabled));
    formData.set("darkSurfaceStyle", darkSurfaceStyle);
    startTransition(async () => {
      try {
        const actionResult = await saveProductHubTheme(formData);
        setResult(actionResult);
        if (actionResult.ok) router.refresh();
      } catch (error) {
        setResult({
          ok: false,
          error: error instanceof Error ? error.message : "Could not save Product Hub theme.",
        });
      }
    });
  }

  return (
    <section aria-labelledby="product-hub-appearance-heading" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Product Hub</p>
        <h2 id="product-hub-appearance-heading" className="mt-1 text-xl font-bold text-slate-950">Product Hub Appearance</h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage the artwork shown to customers and choose the Product Hub color appearance.
        </p>
      </div>

      <form onSubmit={saveTheme} className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={darkThemeEnabled}
              onChange={(event) => setDarkThemeEnabled(event.target.checked)}
              disabled={!canManage || isPending}
              className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Moon aria-hidden="true" className="h-4 w-4" />
              Enable dark theme on Product Hub
            </span>
          </label>
          <label className="flex max-w-sm items-center gap-2 text-sm text-slate-700">
            <span className="shrink-0">Dark surface style</span>
            <select
              value={darkSurfaceStyle}
              onChange={(event) => {
                if (event.target.value === "opaque" || event.target.value === "transparent") {
                  setDarkSurfaceStyle(event.target.value);
                }
              }}
              disabled={!canManage || isPending || !darkThemeEnabled}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="opaque">Dark opaque</option>
              <option value="transparent">Dark transparent</option>
            </select>
            <Sun aria-hidden="true" className="h-4 w-4 text-slate-400" />
          </label>
        </div>
        <button
          type="submit"
          disabled={!canManage || isPending}
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save theme"}
        </button>
        {result && (
          <p role={result.ok ? "status" : "alert"} className={`text-xs md:col-span-2 ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
            {result.ok ? result.message : result.error}
          </p>
        )}
      </form>

      {!canManage && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          View only — platform management permission is required to change these settings.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ArtworkUploader
          assetType="hero"
          label="Hero artwork"
          description="Shown contained on the right side of the transparent hero. Use a transparent PNG or WebP for artwork that blends into the page; the image will not be cropped."
          imageUrl={branding.heroArtworkUrl}
          canManage={canManage}
        />
        <ArtworkUploader
          assetType="about"
          label="About section image"
          description="Image shown in the About Think Digital Solutions section."
          imageUrl={branding.aboutImageUrl}
          canManage={canManage}
        />
        {products.map((product) => (
          <div key={product.slug} className="space-y-3">
            <ArtworkUploader
              assetType="product"
              productSlug={product.slug}
              label={`${product.name} logo`}
              description="Shown on this product's Product Hub card and in its application sidebar."
              imageUrl={branding.productImageUrls[product.slug] ?? null}
              canManage={canManage}
            />
            <ArtworkUploader
              assetType="product-background"
              productSlug={product.slug}
              label={`${product.name} card background`}
              description="Fills the full Product Hub card while its name, tagline, description, and status stay readable on top."
              imageUrl={branding.productCardBackgroundImageUrls[product.slug] ?? null}
              canManage={canManage}
            />
            <ProductCardBackgroundToggle
              key={`${product.slug}-${branding.productCardBackgroundEnabled[product.slug] ?? false}`}
              productSlug={product.slug}
              productName={product.name}
              imageUrl={branding.productCardBackgroundImageUrls[product.slug] ?? null}
              initialEnabled={branding.productCardBackgroundEnabled[product.slug] ?? false}
              canManage={canManage}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Images must be valid JPEG, PNG, SVG, or WebP files no larger than 2 MB.</p>
    </section>
  );
}
