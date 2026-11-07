import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { ServiceCenterWorkspace } from "@/components/service-center/service-center-workspace";
import { ServiceJobPartsPanel } from "@/components/service-center/service-job-parts-panel";
import { ServiceStatusNotificationSettings } from "@/components/service-center/service-status-notification-settings";
import { getServiceAssetWarrantyStatus } from "@/lib/service-center/warranty-validation";

export const metadata = { title: "Think Service & Repairs · ThinkSales Pro" };

export default async function ServiceCenterPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  if (!await canPermission("service_jobs", "view")) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500">You do not have permission to view service jobs.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const allowedLocationIds = context.isBranchScoped
    ? Array.from(new Set([context.locationId, ...context.secondaryLocationIds].filter((id): id is string => Boolean(id))))
    : context.masterLocationId
      ? [context.masterLocationId]
      : null;

  const locationsQuery = supabase.from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");
  const locationsPromise = allowedLocationIds && allowedLocationIds.length === 0
    ? Promise.resolve({ data: [], error: null })
    : allowedLocationIds
      ? locationsQuery.in("id", allowedLocationIds)
      : locationsQuery;
  const assetsQuery = supabase.from("service_assets")
    .select("id, location_id, customer_id, asset_type, brand, model, serial_number, warranty_provider, warranty_reference, warranty_start_date, warranty_end_date, warranty_terms")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const techniciansQuery = supabase.from("service_technicians")
    .select("id, location_id, user_id, skills")
    .eq("org_id", context.orgId)
    .eq("is_active", true);

  const [
    canCreate,
    canEdit,
    canViewAssets,
    canCreateAsset,
    canViewTechnicians,
    canViewAppointments,
    canCreateAppointment,
    canEditAppointments,
    canViewInventory,
    canEditInventory,
    canManageServiceNotifications,
  ] = await Promise.all([
    canPermission("service_jobs", "create"),
    canPermission("service_jobs", "edit"),
    canPermission("service_assets", "view"),
    canPermission("service_assets", "create"),
    canPermission("service_technicians", "view"),
    canPermission("service_appointments", "view"),
    canPermission("service_appointments", "create"),
    canPermission("service_appointments", "edit"),
    canPermission("inventory", "view"),
    canPermission("inventory", "edit"),
    canPermission("settings", "edit"),
  ]);
  const { data: notificationSettings, error: notificationSettingsError } = await supabase
    .from("service_status_notification_settings")
    .select("enabled")
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (notificationSettingsError) {
    throw new Error(`Unable to load automatic repair status message settings: ${notificationSettingsError.message}`);
  }

  const [locationsResult, customersResult, assetsResult, techniciansResult, appointmentsResult] = await Promise.all([
    locationsPromise,
    supabase.from("customers")
      .select("id, name")
      .eq("org_id", context.orgId)
      .order("name")
      .limit(2000),
    (canViewAssets || canViewAppointments || canCreateAppointment) && (!allowedLocationIds || allowedLocationIds.length > 0)
      ? allowedLocationIds
        ? assetsQuery.in("location_id", allowedLocationIds)
        : assetsQuery
      : Promise.resolve({ data: [], error: null }),
    (canViewTechnicians || canViewAppointments || canCreateAppointment) && (!allowedLocationIds || allowedLocationIds.length > 0)
      ? allowedLocationIds
        ? techniciansQuery.in("location_id", allowedLocationIds)
        : techniciansQuery
      : Promise.resolve({ data: [], error: null }),
    canViewAppointments && (!allowedLocationIds || allowedLocationIds.length > 0)
      ? (() => {
          const query = supabase.from("service_appointments")
            .select("id, location_id, customer_id, asset_id, technician_id, job_id, title, notes, starts_at, ends_at, status")
            .eq("org_id", context.orgId)
            .order("starts_at", { ascending: true })
            .limit(500);
          return allowedLocationIds ? query.in("location_id", allowedLocationIds) : query;
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);
  const { data: locations, error: locationsError } = locationsResult;
  const { data: customers, error: customersError } = customersResult;
  const { data: assets, error: assetsError } = assetsResult;
  const { data: technicians, error: techniciansError } = techniciansResult;
  const { data: appointments, error: appointmentsError } = appointmentsResult;
  if (locationsError) throw new Error(`Unable to load service branches: ${locationsError.message}`);
  if (customersError) throw new Error(`Unable to load service customers: ${customersError.message}`);
  if (assetsError) throw new Error(`Unable to load customer equipment: ${assetsError.message}`);
  if (techniciansError) throw new Error(`Unable to load service technicians: ${techniciansError.message}`);
  if (appointmentsError) throw new Error(`Unable to load service appointments: ${appointmentsError.message}`);
  const categoriesQuery = supabase.from("service_categories")
    .select("id, name, location_id")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name")
    .limit(500);
  const categoriesResult = allowedLocationIds && allowedLocationIds.length === 0
    ? { data: [], error: null }
    : await categoriesQuery;
  if (categoriesResult.error) throw new Error(`Unable to load service types: ${categoriesResult.error.message}`);
  const visibleCategories = (categoriesResult.data ?? []).filter((category) =>
    category.location_id === null || !allowedLocationIds || allowedLocationIds.includes(category.location_id),
  );

  const [inventoryProductsResult, stockLevelsResult, partMovementsResult] = await Promise.all([
    canViewInventory && (!allowedLocationIds || allowedLocationIds.length > 0)
      ? supabase.from("products")
        .select("id, sku, name, unit, cost_price")
        .eq("org_id", context.orgId)
        .eq("is_active", true)
        .eq("track_inventory", true)
        .eq("product_type", "standard")
        .eq("status", "active")
        .order("name")
        .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    canViewInventory && (!allowedLocationIds || allowedLocationIds.length > 0)
      ? (() => {
          const query = supabase.from("product_stock_levels")
            .select("product_id, location_id, quantity")
            .eq("org_id", context.orgId);
          return allowedLocationIds ? query.in("location_id", allowedLocationIds) : query;
        })()
      : Promise.resolve({ data: [], error: null }),
    canViewInventory && (!allowedLocationIds || allowedLocationIds.length > 0)
      ? (() => {
          const query = supabase.from("service_job_part_movements")
            .select("id, location_id, job_id, product_id, movement_type, related_issue_id, quantity, returned_quantity, unit_cost, note, created_at")
            .eq("org_id", context.orgId)
            .order("created_at", { ascending: false })
            .limit(500);
          return allowedLocationIds ? query.in("location_id", allowedLocationIds) : query;
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (inventoryProductsResult.error) throw new Error(`Unable to load inventory products for repairs: ${inventoryProductsResult.error.message}`);
  if (stockLevelsResult.error) throw new Error(`Unable to load branch stock for repairs: ${stockLevelsResult.error.message}`);
  if (partMovementsResult.error) throw new Error(`Unable to load repair part history: ${partMovementsResult.error.message}`);

  const { data: technicianProfiles, error: technicianProfilesError } = await (
    technicians?.length
      ? supabase.from("profiles").select("id, full_name").in("id", Array.from(new Set(technicians.map((technician) => technician.user_id))))
      : Promise.resolve({ data: [], error: null })
  );
  if (technicianProfilesError) throw new Error(`Unable to load technician names: ${technicianProfilesError.message}`);
  const technicianNameById = new Map((technicianProfiles ?? []).map((profile) => [profile.id, profile.full_name?.trim() || "Technician"]));

  let jobsQuery = supabase.from("service_jobs")
    .select("id, job_number, location_id, customer_id, asset_id, category_id, technician_id, status, priority, reported_problem, condition_on_arrival, accessories, intake_confirmed_by, intake_confirmed_as, intake_confirmed_at, created_at")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  const jobsResult = allowedLocationIds && allowedLocationIds.length === 0
    ? { data: [], error: null }
    : await (allowedLocationIds ? jobsQuery.in("location_id", allowedLocationIds) : jobsQuery);
  const { data: jobs, error: jobsError } = jobsResult;
  if (jobsError) throw new Error(`Unable to load service jobs: ${jobsError.message}`);

  const notificationResultsQuery = supabase.from("service_job_status_notification_outbox")
    .select("id, job_id, status, delivery_status, result_message, created_at")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(30);
  const notificationResultsResult = canManageServiceNotifications
    ? allowedLocationIds && allowedLocationIds.length === 0
      ? { data: [], error: null }
      : await (allowedLocationIds ? notificationResultsQuery.in("location_id", allowedLocationIds) : notificationResultsQuery)
    : { data: [], error: null };
  if (notificationResultsResult.error) {
    throw new Error(`Unable to load automatic repair status message results: ${notificationResultsResult.error.message}`);
  }

  const contactsQuery = supabase.from("service_job_customer_contacts")
    .select("id, location_id, job_id, direction, method, outcome, details, actor_id, created_at")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  const contactsResult = allowedLocationIds && allowedLocationIds.length === 0
    ? { data: [], error: null }
    : await (allowedLocationIds ? contactsQuery.in("location_id", allowedLocationIds) : contactsQuery);
  const { data: contacts, error: contactsError } = contactsResult;
  if (contactsError) throw new Error(`Unable to load repair customer contact history: ${contactsError.message}`);

  const quotationsQuery = supabase.from("service_quotations")
    .select("id, location_id, job_id, version, status, notes, subtotal, tax_rate, tax_amount, total, created_at, sent_at, sent_note, decided_at, decision_note")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  const quotationsResult = allowedLocationIds && allowedLocationIds.length === 0
    ? { data: [], error: null }
    : await (allowedLocationIds ? quotationsQuery.in("location_id", allowedLocationIds) : quotationsQuery);
  const { data: quotations, error: quotationsError } = quotationsResult;
  if (quotationsError) throw new Error(`Unable to load service estimates: ${quotationsError.message}`);

  const activeServiceInvoicesResult = (jobs ?? []).length
    ? await supabase.from("invoices")
      .select("id, invoice_number, status, due_date, source_service_job_id")
      .eq("org_id", context.orgId)
      .in("source_service_job_id", (jobs ?? []).map((job) => job.id))
      .neq("status", "void")
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  const { data: activeServiceInvoices, error: serviceInvoicesError } = activeServiceInvoicesResult;
  if (serviceInvoicesError) throw new Error(`Unable to load repair invoices: ${serviceInvoicesError.message}`);

  const serviceHandoversResult = (jobs ?? []).length
    ? await supabase.from("service_job_handovers")
      .select("id, job_id, recipient_name, recipient_type, condition_on_handover, accessories_returned, collected_at")
      .eq("org_id", context.orgId)
      .in("job_id", (jobs ?? []).map((job) => job.id))
      .order("collected_at", { ascending: false })
      .limit(500)
    : { data: [], error: null };
  const { data: serviceHandovers, error: serviceHandoversError } = serviceHandoversResult;
  if (serviceHandoversError) throw new Error(`Unable to load repair handover history: ${serviceHandoversError.message}`);

  const warrantyClaimsResult = (jobs ?? []).length
    ? await supabase.from("service_job_warranty_claims")
      .select("id, follow_up_job_id, original_job_id, status, decision_note, decided_at")
      .eq("org_id", context.orgId)
      .in("follow_up_job_id", (jobs ?? []).map((job) => job.id))
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  const { data: warrantyClaims, error: warrantyClaimsError } = warrantyClaimsResult;
  if (warrantyClaimsError) throw new Error(`Unable to load warranty claim history: ${warrantyClaimsError.message}`);

  const quotationItemBatches = await Promise.all(
    Array.from({ length: Math.ceil((quotations ?? []).length / 10) }, (_, batchIndex) => {
      const quotationIds = (quotations ?? []).slice(batchIndex * 10, batchIndex * 10 + 10).map((quotation) => quotation.id);
      return supabase.from("service_quotation_items")
        .select("id, quotation_id, description, quantity, unit_price, line_total")
        .in("quotation_id", quotationIds)
        .order("created_at")
        .limit(500);
    }),
  );
  const quotationItems = quotationItemBatches.flatMap((batch) => {
    if (batch.error) throw new Error(`Unable to load estimate line items: ${batch.error.message}`);
    return batch.data ?? [];
  });

  const readyJobIds = (jobs ?? []).filter((job) => job.status === "ready_for_collection").map((job) => job.id);
  let approvedQuotationsQuery = supabase.from("service_quotations")
      .select("job_id")
      .eq("org_id", context.orgId)
      .in("job_id", readyJobIds)
      .eq("status", "approved");
  if (allowedLocationIds) approvedQuotationsQuery = approvedQuotationsQuery.in("location_id", allowedLocationIds);
  const approvedQuotationsResult = readyJobIds.length
    ? await approvedQuotationsQuery
    : { data: [], error: null };
  if (approvedQuotationsResult.error) throw new Error(`Unable to verify approved estimates for billing: ${approvedQuotationsResult.error.message}`);
  const jobsWithApprovedQuotation = new Set((approvedQuotationsResult.data ?? []).map((quotation) => quotation.job_id));
  const serviceInvoiceByJobId = new Map((activeServiceInvoices ?? [])
    .filter((invoice) => invoice.source_service_job_id)
    .map((invoice) => [invoice.source_service_job_id!, invoice]));
  const serviceHandoversByJobId = new Map<string, Array<{
    id: string;
    job_id: string;
    recipient_name: string;
    recipient_type: "customer" | "authorized_representative";
    condition_on_handover: string;
    accessories_returned: string | null;
    collected_at: string;
  }>>();
  for (const handover of serviceHandovers ?? []) {
    const jobHandovers = serviceHandoversByJobId.get(handover.job_id) ?? [];
    jobHandovers.push(handover);
    serviceHandoversByJobId.set(handover.job_id, jobHandovers);
  }

  const assetById = new Map((assets ?? []).map((asset) => [
    asset.id,
    {
      label: [asset.asset_type, asset.brand, asset.model, asset.serial_number ? `S/N ${asset.serial_number}` : null].filter(Boolean).join(" · "),
      warranty_provider: asset.warranty_provider,
      warranty_reference: asset.warranty_reference,
      warranty_start_date: asset.warranty_start_date,
      warranty_end_date: asset.warranty_end_date,
      warranty_terms: asset.warranty_terms,
      warranty_status: getServiceAssetWarrantyStatus(asset.warranty_start_date, asset.warranty_end_date),
    },
  ]));
  const technicianById = new Map((technicians ?? []).map((technician) => [
    technician.id,
    technicianNameById.get(technician.user_id) ?? "Technician",
  ]));
  const customerById = new Map((customers ?? []).map((customer) => [customer.id, customer.name]));
  const locationById = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const jobNumberById = new Map((jobs ?? []).map((job) => [job.id, job.job_number]));
  const productById = new Map((inventoryProductsResult.data ?? []).map((product) => [product.id, product]));
  const missingLinkedJobIds = Array.from(new Set([
    ...(quotations ?? []).map((quotation) => quotation.job_id),
    ...(partMovementsResult.data ?? []).map((movement) => movement.job_id),
    ...(contacts ?? []).map((contact) => contact.job_id),
    ...(warrantyClaims ?? []).map((claim) => claim.original_job_id),
  ]
    .filter((jobId) => !jobNumberById.has(jobId))));
  if (missingLinkedJobIds.length) {
    const { data: quotationJobs, error: quotationJobsError } = await supabase.from("service_jobs")
      .select("id, job_number")
      .in("id", missingLinkedJobIds);
    if (quotationJobsError) throw new Error(`Unable to load jobs linked to estimates, parts, contacts, and warranty claims: ${quotationJobsError.message}`);
    for (const job of quotationJobs ?? []) jobNumberById.set(job.id, job.job_number);
  }
  const warrantyClaimByFollowUpJobId = new Map((warrantyClaims ?? []).map((claim) => [claim.follow_up_job_id, {
    id: claim.id,
    original_job_id: claim.original_job_id,
    original_job_number: jobNumberById.get(claim.original_job_id) ?? "Original job",
    status: claim.status,
    decision_note: claim.decision_note,
    decided_at: claim.decided_at,
  }]));

  return (
    <ServiceCenterWorkspace
      jobs={(jobs ?? []).map((job) => ({
        ...job,
        has_approved_estimate: jobsWithApprovedQuotation.has(job.id),
        invoice: serviceInvoiceByJobId.get(job.id) ?? null,
        handovers: serviceHandoversByJobId.get(job.id) ?? [],
        warranty_claim: warrantyClaimByFollowUpJobId.get(job.id) ?? null,
      }))}
      partsPanel={canViewInventory ? (
        <ServiceJobPartsPanel
          jobs={(jobs ?? []).map(({ id, job_number, location_id, status }) => ({ id, job_number, location_id, status }))}
          products={(inventoryProductsResult.data ?? []).map((product) => ({
            ...product,
            stock_by_location: (stockLevelsResult.data ?? [])
              .filter((stock) => stock.product_id === product.id)
              .map(({ location_id, quantity }) => ({ location_id, quantity })),
          }))}
          movements={(partMovementsResult.data ?? []).map((movement) => {
            const product = productById.get(movement.product_id);
            return {
              ...movement,
              product_name: product?.name ?? "Inventory product",
              sku: product?.sku ?? "",
              job_number: jobNumberById.get(movement.job_id) ?? "Service job",
              remaining_quantity: movement.movement_type === "issued"
                ? movement.quantity - movement.returned_quantity
                : 0,
            };
          })}
          canManageParts={canEdit && canViewInventory && canEditInventory}
        />
      ) : null}
      quotations={(quotations ?? []).map((quotation) => ({
        ...quotation,
        job_number: jobNumberById.get(quotation.job_id) ?? "Service job",
        items: quotationItems
          .filter((item) => item.quotation_id === quotation.id)
          .map(({ id, description, quantity, unit_price, line_total }) => ({ id, description, quantity, unit_price, line_total })),
      }))}
      contactLogs={(contacts ?? []).map((contact) => ({
        ...contact,
        job_number: jobNumberById.get(contact.job_id) ?? "Service job",
      }))}
      customers={customers ?? []}
      serviceCategories={visibleCategories}
      locations={locations ?? []}
      assets={(assets ?? []).map((asset) => ({
        ...asset,
        label: [asset.asset_type, asset.brand, asset.model, asset.serial_number ? `S/N ${asset.serial_number}` : null].filter(Boolean).join(" · "),
        warranty_status: getServiceAssetWarrantyStatus(asset.warranty_start_date, asset.warranty_end_date),
      }))}
      technicians={(technicians ?? []).map((technician) => ({
        id: technician.id,
        userId: technician.user_id,
        locationId: technician.location_id,
        name: technicianNameById.get(technician.user_id) ?? "Technician",
        skills: technician.skills,
      }))}
      appointments={(appointments ?? []).map((appointment) => ({
        ...appointment,
        customer_name: customerById.get(appointment.customer_id) ?? "Customer",
        location_name: locationById.get(appointment.location_id) ?? "Branch",
        asset_label: appointment.asset_id ? assetById.get(appointment.asset_id)?.label ?? null : null,
        technician_name: appointment.technician_id ? technicianById.get(appointment.technician_id) ?? null : null,
        job_number: appointment.job_id ? jobNumberById.get(appointment.job_id) ?? null : null,
      }))}
      canCreate={canCreate}
      canEdit={canEdit}
      canViewAssets={canViewAssets}
      canCreateAsset={canCreateAsset}
      canViewAppointments={canViewAppointments}
      canCreateAppointment={canCreateAppointment}
      canEditAppointments={canEditAppointments}
      canManageServiceNotifications={canManageServiceNotifications}
      serviceStatusNotificationsEnabled={notificationSettings?.enabled ?? false}
      serviceStatusNotificationResults={(notificationResultsResult.data ?? []).map((result) => ({
        ...result,
        job_number: jobs?.find((job) => job.id === result.job_id)?.job_number ?? "Repair job",
      }))}
      currency={context.currency}
    />
  );
}
