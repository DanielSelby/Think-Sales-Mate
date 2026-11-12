"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Save } from "lucide-react";
import { AccessMatrixTab } from "./access-matrix-tab";
import {
  saveProductRolePermissions,
  setMemberProductRole,
} from "@/app/(dashboard)/settings/organization/actions";
import {
  filterPermissionMatrixForProduct,
  getRequiredProductSlugsForPermissionModule,
  isOrganizationWidePermissionModule,
} from "@/lib/product-entitlement-routes";
import { canonicalRoleKey, normalizePermissionMatrix } from "@/lib/rbac/permission-matrix";
import { EDUCATION_ROLE_PRESETS } from "@/lib/rbac/education-roles";
import type { PlatformProductSlug } from "@/types/platform-database";
import type {
  ManagedUser,
  ModulePermissionConfig,
  PermissionPageConfig,
  RoleDefinition,
} from "../types";

interface ProductOption {
  slug: PlatformProductSlug;
  name: string;
}

export interface ProductRoleTemplate {
  product_slug: PlatformProductSlug;
  role_key: string;
  name: string | null;
  permissions: Record<string, unknown> | null;
}

export interface ProductMemberRole {
  user_id: string;
  product_slug: PlatformProductSlug;
  role_key: string;
}

interface ProductPermissionsTabProps {
  users: ManagedUser[];
  products: ProductOption[];
  assignments: Record<string, string[]>;
  templates: ProductRoleTemplate[];
  memberRoles: ProductMemberRole[];
  roles: RoleDefinition[];
  moduleConfigs: ModulePermissionConfig[];
  pageConfigs: Record<string, PermissionPageConfig[]>;
  activeProductSlug?: PlatformProductSlug | null;
}

function getMemberRoleKey(user: ManagedUser): string {
  const roleKey = user.accessPermissions?.role_key;
  return canonicalRoleKey(typeof roleKey === "string" ? roleKey : user.role);
}

export function ProductPermissionsTab({
  users,
  products,
  assignments,
  templates,
  memberRoles,
  roles,
  moduleConfigs,
  pageConfigs,
  activeProductSlug,
}: ProductPermissionsTabProps) {
  const initialProduct = activeProductSlug && products.some((product) => product.slug === activeProductSlug)
    ? activeProductSlug
    : products[0]?.slug;
  const [selectedProduct, setSelectedProduct] = useState<PlatformProductSlug | undefined>(initialProduct);
  const [selectedMemberRoles, setSelectedMemberRoles] = useState<Record<string, string>>(() =>
    Object.fromEntries(memberRoles.map((item) => [`${item.product_slug}:${item.user_id}`, item.role_key])),
  );
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ userId: string; text: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const productRoles = useMemo(() => {
    if (!selectedProduct) return [];
    const productTemplates = templates.filter((template) => template.product_slug === selectedProduct);
    const sharedRoles = roles
      .filter((role) => !["owner", "super_admin"].includes(canonicalRoleKey(role.key)))
      .map((role) => {
        const template = productTemplates.find((item) => item.role_key === role.key);
        const source = template?.permissions ?? role.permissions;
        const permissions = normalizePermissionMatrix(filterPermissionMatrixForProduct(source, selectedProduct));
        return {
          ...role,
          name: template?.name || role.name,
          permissions,
          permissionCount: Object.values(permissions).reduce((count, actions) => count + actions.length, 0),
        };
      });
    if (selectedProduct !== "think-education") return sharedRoles;

    const templateRole = roles.find((role) => role.key === "manager") ?? roles[0];
    if (!templateRole) return sharedRoles;
    const educationRoles = EDUCATION_ROLE_PRESETS.map((preset) => {
      const template = productTemplates.find((item) => item.role_key === preset.key);
      const permissions = normalizePermissionMatrix(
        filterPermissionMatrixForProduct(template?.permissions ?? preset.permissions, selectedProduct),
      );
      return {
        ...templateRole,
        id: preset.key,
        key: preset.key,
        name: template?.name || preset.name,
        description: preset.description,
        permissions,
        permissionCount: Object.values(permissions).reduce((count, actions) => count + actions.length, 0),
      };
    });
    return [...sharedRoles.filter((role) => role.permissionCount > 0), ...educationRoles];
  }, [roles, selectedProduct, templates]);

  const assignedUsers = users.filter((user) =>
    user.userId
    && user.status === "active"
    && !["owner", "super_admin"].includes(getMemberRoleKey(user))
    && (assignments[user.userId] ?? []).includes(selectedProduct ?? ""),
  );

  function saveMemberRole(userId: string) {
    if (!selectedProduct) return;
    const roleKey = selectedMemberRoles[`${selectedProduct}:${userId}`];
    if (!roleKey) return;
    setSavingUserId(userId);
    setMessage(null);
    startTransition(async () => {
      const result = await setMemberProductRole(userId, selectedProduct, roleKey);
      setMessage(result.error
        ? { userId, text: result.error, error: true }
        : { userId, text: "Product role updated.", error: false });
      setSavingUserId(null);
    });
  }

  if (!products.length || !selectedProduct) {
    return <p className="rounded-xl border border-dashed p-6 text-sm text-ledger-500">There are no active products to configure.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <div>
          <h2 className="text-sm font-bold text-blue-950 dark:text-blue-100">Product-specific permissions</h2>
          <p className="mt-1 max-w-3xl text-xs text-blue-800 dark:text-blue-200">
            These roles apply only inside the selected product. Organization team administration and global roles remain unchanged.
          </p>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
          Product
          <select
            value={selectedProduct}
            onChange={(event) => {
              const next = products.find((product) => product.slug === event.target.value);
              if (!next) return;
              setSelectedProduct(next.slug);
              setMessage(null);
            }}
            className="min-w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}
          </select>
        </label>
      </div>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-ink-900 dark:text-white">Member roles in {products.find((item) => item.slug === selectedProduct)?.name}</h3>
          <p className="mt-1 text-xs text-ledger-500">Only active members assigned to this product are shown.</p>
        </div>
        {assignedUsers.length ? (
          <div className="overflow-x-auto rounded-xl border border-ledger-200 bg-white dark:border-ledger-800 dark:bg-slate-900">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ledger-200 text-xs uppercase tracking-wide text-ledger-500 dark:border-ledger-800">
                  <th className="px-4 py-3 font-semibold">Team member</th>
                  <th className="px-4 py-3 font-semibold">Product role</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {assignedUsers.map((user) => {
                  const userId = user.userId!;
                  const roleKey = selectedMemberRoles[`${selectedProduct}:${userId}`]
                    ?? getMemberRoleKey(user);
                  const rowMessage = message?.userId === userId ? message : null;
                  return (
                    <tr key={userId} className="border-b border-ledger-100 last:border-0 dark:border-ledger-800">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-ink-900 dark:text-white">{user.fullName || user.name}</p>
                        <p className="text-xs text-ledger-500">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={roleKey}
                          onChange={(event) => setSelectedMemberRoles((previous) => ({
                            ...previous,
                            [`${selectedProduct}:${userId}`]: event.target.value,
                          }))}
                          className="min-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          {productRoles.map((role) => (
                            <option key={role.key} value={role.key}>{role.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => saveMemberRole(userId)}
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {rowMessage && !rowMessage.error ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                          {isPending && savingUserId === userId ? "Saving" : "Save"}
                        </button>
                        {rowMessage && (
                          <p className={`mt-1 text-[11px] ${rowMessage.error ? "text-red-600" : "text-emerald-700"}`} role={rowMessage.error ? "alert" : "status"}>
                            {rowMessage.text}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-ledger-500">
            No active non-administrator members are assigned to this product. Assign members in the Product Access tab first.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-ink-900 dark:text-white">Role permissions</h3>
          <p className="mt-1 text-xs text-ledger-500">Changes here affect only {products.find((item) => item.slug === selectedProduct)?.name}.</p>
        </div>
        {productRoles.length ? (
          <AccessMatrixTab
            key={selectedProduct}
            roles={productRoles}
            canManage
            moduleConfigs={moduleConfigs.filter((module) =>
              !isOrganizationWidePermissionModule(module.key)
              && getRequiredProductSlugsForPermissionModule(module.key).includes(selectedProduct)
            )}
            pageConfigs={Object.fromEntries(
              Object.entries(pageConfigs).filter(([module]) =>
                !isOrganizationWidePermissionModule(module)
                && getRequiredProductSlugsForPermissionModule(module).includes(selectedProduct)
              ),
            )}
            onUpdateRolePermissions={async (roleId, permissions) => {
              const role = productRoles.find((item) => item.id === roleId || item.key === roleId);
              if (!role) return { error: "The selected product role could not be found." };
              const result = await saveProductRolePermissions(selectedProduct, role.key, permissions, role.name);
              return "error" in result && result.error ? { error: result.error } : {};
            }}
          />
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-ledger-500">No product roles are available to configure.</p>
        )}
      </section>
    </div>
  );
}
