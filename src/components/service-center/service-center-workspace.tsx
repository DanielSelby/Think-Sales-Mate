"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  Eye,
  Plus,
  RotateCcw,
  Search,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  createServiceAsset,
  createServiceAppointment,
  createServiceCustomerContact,
  createServiceJobInvoice,
  createServiceJob,
  recordServiceJobHandover,
  decideServiceJobWarrantyClaim,
  transitionServiceQuotation,
  transitionServiceAppointment,
  transitionServiceJob,
} from "@/app/(dashboard)/service-center/actions";
import { ServiceQuotationForm } from "@/components/service-center/service-quotation-form";
import { ServiceCustomerUpdate } from "@/components/service-center/service-customer-update";
import { ServiceAppointmentReminder } from "@/components/service-center/service-appointment-reminder";
import { ServiceQuotationDelivery } from "@/components/service-center/service-quotation-delivery";
import { ServiceStatusNotificationSettings } from "@/components/service-center/service-status-notification-settings";
import type { InvoiceStatus, ServiceAppointmentStatus, ServiceJobPriority, ServiceJobStatus, ServiceQuotationStatus, ServiceWarrantyClaimStatus } from "@/types/database";

type ServiceJobRow = {
  id: string;
  job_number: string;
  location_id: string;
  customer_id: string;
  asset_id: string | null;
  category_id: string | null;
  technician_id: string | null;
  status: ServiceJobStatus;
  priority: ServiceJobPriority;
  reported_problem: string;
  condition_on_arrival: string;
  accessories: string[];
  intake_confirmed_by: string;
  intake_confirmed_as: "customer" | "authorized_representative";
  intake_confirmed_at: string;
  created_at: string;
  has_approved_estimate: boolean;
  invoice: {
    id: string;
    invoice_number: number;
    status: InvoiceStatus;
    due_date: string;
  } | null;
  handovers: Array<{
    id: string;
    recipient_name: string;
    recipient_type: "customer" | "authorized_representative";
    condition_on_handover: string;
    accessories_returned: string | null;
    collected_at: string;
  }>;
  warranty_claim: {
    id: string;
    original_job_id: string;
    original_job_number: string;
    status: ServiceWarrantyClaimStatus;
    decision_note: string | null;
    decided_at: string | null;
  } | null;
};

type SelectOption = { id: string; name: string };
type CustomerOption = SelectOption & { email: string | null; phone: string | null; company: string | null };
type ServiceCategoryOption = SelectOption & { location_id: string | null };
type AssetWarrantyStatus = "not_recorded" | "upcoming" | "active" | "expired";
type AssetOption = {
  id: string;
  location_id: string;
  customer_id: string;
  label: string;
  warranty_provider: string | null;
  warranty_reference: string | null;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  warranty_terms: string | null;
  warranty_status: AssetWarrantyStatus;
};
type TechnicianOption = { id: string; userId: string; locationId: string; name: string; skills: string[] };
type QuotationRow = {
  id: string;
  job_id: string;
  job_number: string;
  version: number;
  status: ServiceQuotationStatus;
  notes: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  created_at: string;
  sent_at: string | null;
  sent_note: string | null;
  decided_at: string | null;
  decision_note: string | null;
  items: Array<{ id: string; description: string; quantity: number; unit_price: number; line_total: number }>;
};
type ContactLogRow = {
  id: string;
  job_id: string;
  job_number: string;
  direction: "incoming" | "outgoing";
  method: "phone" | "email" | "sms" | "whatsapp" | "in_person" | "other";
  outcome: "completed" | "no_answer" | "left_message" | "follow_up_needed" | "other";
  details: string;
  created_at: string;
};
type ServiceInvoiceRow = {
  id: string;
  invoice_number: number;
  customer_name: string;
  amount: number;
  amount_paid: number;
  status: InvoiceStatus;
  due_date: string;
  source_service_job_id: string | null;
  created_at: string;
  job_number: string;
  location_id: string;
};
type AppointmentRow = {
  id: string;
  location_id: string;
  customer_id: string;
  asset_id: string | null;
  technician_id: string | null;
  job_id: string | null;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: ServiceAppointmentStatus;
  customer_name: string;
  location_name: string;
  asset_label: string | null;
  technician_name: string | null;
  job_number: string | null;
};

const statusLabels: Record<ServiceJobStatus, string> = {
  received: "Received",
  inspection: "Inspection",
  awaiting_quotation: "Awaiting quotation",
  awaiting_customer_approval: "Awaiting customer approval",
  approved: "Approved",
  rejected: "Rejected",
  in_progress: "In progress",
  awaiting_parts: "Awaiting parts",
  quality_check: "Quality check",
  ready_for_collection: "Ready for collection",
  awaiting_payment: "Awaiting payment",
  completed: "Paid · awaiting collection",
  closed: "Handed over",
  cancelled: "Cancelled",
};

const priorityLabels: Record<ServiceJobPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};
const priorityOptions: ServiceJobPriority[] = ["low", "normal", "high", "urgent"];
const warrantyStatusLabels: Record<AssetWarrantyStatus, string> = {
  not_recorded: "No warranty dates recorded",
  upcoming: "Warranty not yet active",
  active: "Warranty active",
  expired: "Warranty expired",
};
const warrantyStatusClasses: Record<AssetWarrantyStatus, string> = {
  not_recorded: "bg-ledger-100 text-ledger-600 dark:bg-ink-700 dark:text-ledger-300",
  upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  expired: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
};

const nextStatuses: Record<ServiceJobStatus, ServiceJobStatus[]> = {
  received: ["inspection", "cancelled"],
  inspection: ["awaiting_quotation", "in_progress", "cancelled"],
  awaiting_quotation: ["cancelled"],
  awaiting_customer_approval: [],
  approved: ["in_progress", "cancelled"],
  rejected: ["inspection", "cancelled"],
  in_progress: ["awaiting_parts", "quality_check", "cancelled"],
  awaiting_parts: ["in_progress", "cancelled"],
  quality_check: ["in_progress", "ready_for_collection"],
  ready_for_collection: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["ready_for_collection"],
  completed: [],
  closed: ["inspection"],
  cancelled: ["inspection"],
};

export function ServiceCenterWorkspace({
  jobs,
  partsPanel,
  quotations,
  contactLogs,
  customers,
  serviceCategories,
  locations,
  assets,
  technicians,
  appointments,
  serviceInvoices: serviceInvoiceRows,
  serviceInvoicesLimited,
  canCreate,
  canEdit,
  canViewAssets,
  canCreateAsset,
  canViewAppointments,
  canCreateAppointment,
  canEditAppointments,
  canManageServiceNotifications,
  canViewAccounting,
  serviceStatusNotificationsEnabled,
  serviceStatusNotificationResults,
  currency,
}: {
  jobs: ServiceJobRow[];
  partsPanel: ReactNode;
  quotations: QuotationRow[];
  contactLogs: ContactLogRow[];
  customers: CustomerOption[];
  serviceCategories: ServiceCategoryOption[];
  locations: SelectOption[];
  assets: AssetOption[];
  technicians: TechnicianOption[];
  appointments: AppointmentRow[];
  serviceInvoices: ServiceInvoiceRow[];
  serviceInvoicesLimited: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canViewAssets: boolean;
  canCreateAsset: boolean;
  canViewAppointments: boolean;
  canCreateAppointment: boolean;
  canEditAppointments: boolean;
  canManageServiceNotifications: boolean;
  canViewAccounting: boolean;
  serviceStatusNotificationsEnabled: boolean;
  serviceStatusNotificationResults: Array<{
    id: string;
    job_id: string;
    job_number: string;
    status: ServiceJobStatus;
    delivery_status: "pending" | "processing" | "sent" | "failed" | "skipped";
    result_message: string | null;
    created_at: string;
  }>;
  currency: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const view = requestedView === "appointments"
    || requestedView === "quotations"
    || requestedView === "parts"
    || requestedView === "communications"
    || requestedView === "warranty"
    || requestedView === "assets"
    || requestedView === "invoices"
    ? requestedView
    : "jobs";
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appointmentLocationId, setAppointmentLocationId] = useState("");
  const [appointmentCustomerId, setAppointmentCustomerId] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState("all");
  const [jobPriorityFilter, setJobPriorityFilter] = useState("all");
  const [jobCategoryFilter, setJobCategoryFilter] = useState("all");
  const [jobTechnicianFilter, setJobTechnicianFilter] = useState("all");
  const [jobCustomerFilter, setJobCustomerFilter] = useState("all");
  const [jobLocationFilter, setJobLocationFilter] = useState("all");
  const [jobDateRange, setJobDateRange] = useState("30");
  const [jobPage, setJobPage] = useState(1);
  const [jobPageSize, setJobPageSize] = useState(10);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false);
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState("all");
  const [appointmentDateFilter, setAppointmentDateFilter] = useState("all");
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [invoicePage, setInvoicePage] = useState(1);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#new-service-job") setIsCreateJobOpen(true);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  useEffect(() => {
    const openJobFromHash = () => {
      if (!window.location.hash.startsWith("#job-")) return;
      const jobId = window.location.hash.slice("#job-".length);
      const jobIndex = jobs.findIndex((job) => job.id === jobId);
      if (jobIndex < 0) return;
      setJobSearch("");
      setJobStatusFilter("all");
      setJobPriorityFilter("all");
      setJobCategoryFilter("all");
      setJobTechnicianFilter("all");
      setJobCustomerFilter("all");
      setJobLocationFilter("all");
      setJobDateRange("all");
      setJobPage(Math.floor(jobIndex / jobPageSize) + 1);
      setExpandedJobId(jobId);
    };
    openJobFromHash();
    window.addEventListener("hashchange", openJobFromHash);
    return () => window.removeEventListener("hashchange", openJobFromHash);
  }, [jobs, jobPageSize]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await createServiceJob(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setNotice(`Job ${result.jobNumber} was created.`);
      setIsCreateJobOpen(false);
      router.refresh();
    } catch (cause) {
      console.error("Service job creation failed:", cause);
      setError("The service job could not be created. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function submitTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await transitionServiceJob(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("Job status updated.");
      router.refresh();
    } catch (cause) {
      console.error("Service job status update failed:", cause);
      setError("The service job status could not be updated. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function submitServiceInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await createServiceJobInvoice(new FormData(form));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`Repair invoice #${String(result.invoiceNumber).padStart(4, "0")} was created.`);
      router.refresh();
    } catch (cause) {
      console.error("Service invoice creation failed:", cause);
      setError("The repair invoice could not be created. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function submitRecord(
    event: FormEvent<HTMLFormElement>,
    action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>,
    successMessage: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await action(new FormData(form));
      if (!result.ok) {
        setError(result.error ?? "The request could not be completed.");
        return;
      }
      form.reset();
      setNotice(successMessage);
      router.refresh();
    } catch (cause) {
      console.error("Service record operation failed:", cause);
      setError("The service record could not be saved. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function submitAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    for (const field of ["appointmentStartsAt", "appointmentEndsAt"]) {
      const localValue = formData.get(field);
      if (typeof localValue === "string" && localValue) {
        const date = new Date(localValue);
        if (Number.isFinite(date.getTime())) formData.set(field, date.toISOString());
      }
    }
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await createServiceAppointment(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setAppointmentLocationId("");
      setAppointmentCustomerId("");
      setNotice("Appointment scheduled.");
      router.refresh();
    } catch (cause) {
      console.error("Service appointment creation failed:", cause);
      setError("The appointment could not be scheduled. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function submitAppointmentTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await transitionServiceAppointment(new FormData(event.currentTarget));
      if (!result.ok) {
        setError(result.error ?? "The appointment could not be updated.");
        return;
      }
      setNotice("Appointment status updated.");
      router.refresh();
    } catch (cause) {
      console.error("Service appointment status update failed:", cause);
      setError("The appointment could not be updated. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function submitQuotationTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await transitionServiceQuotation(new FormData(event.currentTarget));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("Estimate status updated.");
      router.refresh();
    } catch (cause) {
      console.error("Service quotation update failed:", cause);
      setError("The estimate could not be updated. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const technicianById = new Map(technicians.map((technician) => [technician.id, technician]));
  const branchScopedJobs = jobLocationFilter === "all" ? jobs : jobs.filter((job) => job.location_id === jobLocationFilter);
  const branchScopedJobIds = new Set(branchScopedJobs.map((job) => job.id));
  const branchScopedAssets = jobLocationFilter === "all" ? assets : assets.filter((asset) => asset.location_id === jobLocationFilter);
  const branchCustomerIds = new Set([
    ...branchScopedJobs.map((job) => job.customer_id),
    ...branchScopedAssets.map((asset) => asset.customer_id),
  ]);
  const jobsPerCustomer = new Map<string, number>();
  branchScopedJobs.forEach((job) => jobsPerCustomer.set(job.customer_id, (jobsPerCustomer.get(job.customer_id) ?? 0) + 1));
  const assetsPerCustomer = new Map<string, number>();
  branchScopedAssets.forEach((asset) => assetsPerCustomer.set(asset.customer_id, (assetsPerCustomer.get(asset.customer_id) ?? 0) + 1));
  const branchScopedCustomers = jobLocationFilter === "all"
    ? customers
    : customers.filter((customer) => branchCustomerIds.has(customer.id));
  const customerActivity = branchScopedCustomers.map((customer) => ({
    ...customer,
    equipmentCount: assetsPerCustomer.get(customer.id) ?? 0,
    jobCount: jobsPerCustomer.get(customer.id) ?? 0,
  }));
  const filteredCustomerActivity = customerActivity.filter((customer) =>
    [customer.name, customer.company, customer.email, customer.phone]
      .some((value) => value?.toLocaleLowerCase().includes(customerSearch.trim().toLocaleLowerCase()))
  );
  const customerPageSize = 10;
  const customerPageCount = Math.max(1, Math.ceil(filteredCustomerActivity.length / customerPageSize));
  const currentCustomerPage = Math.min(customerPage, customerPageCount);
  const paginatedCustomerActivity = filteredCustomerActivity.slice((currentCustomerPage - 1) * customerPageSize, currentCustomerPage * customerPageSize);
  const branchScopedQuotations = jobLocationFilter === "all" ? quotations : quotations.filter((quotation) => branchScopedJobIds.has(quotation.job_id));
  const branchScopedContacts = jobLocationFilter === "all" ? contactLogs : contactLogs.filter((contact) => branchScopedJobIds.has(contact.job_id));
  const branchScopedInvoices = serviceInvoiceRows.filter((invoice) =>
    jobLocationFilter === "all" || invoice.location_id === jobLocationFilter,
  );
  const filteredServiceInvoices = branchScopedInvoices.filter((invoice) => {
    if (invoiceStatusFilter !== "all" && invoice.status !== invoiceStatusFilter) return false;
    const search = invoiceSearch.trim().toLocaleLowerCase();
    return !search || [
      String(invoice.invoice_number),
      invoice.customer_name,
      invoice.job_number,
    ].some((value) => value.toLocaleLowerCase().includes(search));
  });
  const invoicePageSize = 20;
  const invoicePageCount = Math.max(1, Math.ceil(filteredServiceInvoices.length / invoicePageSize));
  const currentInvoicePage = Math.min(invoicePage, invoicePageCount);
  const paginatedServiceInvoices = filteredServiceInvoices.slice(
    (currentInvoicePage - 1) * invoicePageSize,
    currentInvoicePage * invoicePageSize,
  );
  const appointmentNextStatuses: Record<ServiceAppointmentStatus, ServiceAppointmentStatus[]> = {
    scheduled: ["confirmed", "cancelled", "no_show"],
    confirmed: ["completed", "cancelled", "no_show"],
    completed: [],
    cancelled: [],
    no_show: [],
  };
  const appointmentStatusLabels: Record<ServiceAppointmentStatus, string> = {
    scheduled: "Scheduled",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No-show",
  };
  const quotationStatusLabels: Record<ServiceQuotationStatus, string> = {
    draft: "Draft",
    sent: "Sent to customer",
    approved: "Customer approved",
    rejected: "Customer declined",
    superseded: "Replaced by a newer estimate",
    withdrawn: "Withdrawn",
  };
  const contactMethodLabels: Record<ContactLogRow["method"], string> = {
    phone: "Phone",
    email: "Email",
    sms: "SMS",
    whatsapp: "WhatsApp",
    in_person: "In person",
    other: "Other",
  };
  const contactOutcomeLabels: Record<ContactLogRow["outcome"], string> = {
    completed: "Contact completed",
    no_answer: "No answer",
    left_message: "Message left",
    follow_up_needed: "Follow-up needed",
    other: "Other",
  };
  const estimateJobs = branchScopedJobs.filter((job) =>
    (job.status === "inspection" || job.status === "awaiting_quotation")
    && (!job.warranty_claim || job.warranty_claim.status === "not_covered"),
  );
  const warrantySourceJobs = branchScopedJobs.filter((job) => job.status === "closed" && job.asset_id);
  const warrantyClaimLabels: Record<ServiceWarrantyClaimStatus, string> = {
    pending: "Pending staff review",
    covered: "Covered · no customer charge",
    not_covered: "Not covered",
  };
  const serviceCategoryById = new Map(serviceCategories.map((category) => [category.id, category.name]));
  const dateScopedJobs = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    if (jobDateRange === "7" || jobDateRange === "30") {
      start = new Date(now);
      start.setDate(start.getDate() - (Number(jobDateRange) - 1));
      start.setHours(0, 0, 0, 0);
    } else if (jobDateRange === "this_month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (jobDateRange === "last_month") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return jobs.filter((job) => {
      if (jobLocationFilter !== "all" && job.location_id !== jobLocationFilter) return false;
      const createdAt = new Date(job.created_at);
      if (start && createdAt < start) return false;
      if (end && createdAt >= end) return false;
      return true;
    });
  }, [jobs, jobDateRange, jobLocationFilter]);
  const filteredJobs = dateScopedJobs.filter((job) => {
    const search = jobSearch.trim().toLocaleLowerCase();
    if (jobStatusFilter !== "all" && job.status !== jobStatusFilter) return false;
    if (jobPriorityFilter !== "all" && job.priority !== jobPriorityFilter) return false;
    if (jobCategoryFilter !== "all" && job.category_id !== jobCategoryFilter) return false;
    if (jobTechnicianFilter !== "all" && job.technician_id !== jobTechnicianFilter) return false;
    if (jobCustomerFilter !== "all" && job.customer_id !== jobCustomerFilter) return false;
    if (!search) return true;
    const searchableFields = [
      job.job_number,
      customerNames.get(job.customer_id),
      job.reported_problem,
      serviceCategoryById.get(job.category_id ?? ""),
      job.technician_id ? technicianById.get(job.technician_id)?.name : null,
    ];
    return searchableFields.some((value) => value?.toLocaleLowerCase().includes(search));
  });
  const pageCount = Math.max(1, Math.ceil(filteredJobs.length / jobPageSize));
  const currentPage = Math.min(jobPage, pageCount);
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * jobPageSize, currentPage * jobPageSize);
  const pendingStatuses: ServiceJobStatus[] = [
    "received",
    "inspection",
    "awaiting_quotation",
    "awaiting_customer_approval",
    "approved",
    "rejected",
    "awaiting_parts",
    "quality_check",
    "ready_for_collection",
    "awaiting_payment",
  ];
  const summaryCards = [
    { label: "Total Jobs", value: dateScopedJobs.length, icon: ClipboardList, color: "emerald" },
    { label: "In Progress", value: dateScopedJobs.filter((job) => job.status === "in_progress").length, icon: Clock3, color: "blue" },
    { label: "Completed", value: dateScopedJobs.filter((job) => job.status === "completed" || job.status === "closed").length, icon: CheckCircle2, color: "amber" },
    { label: "Pending", value: dateScopedJobs.filter((job) => pendingStatuses.includes(job.status)).length, icon: CircleAlert, color: "purple" },
    { label: "Cancelled", value: dateScopedJobs.filter((job) => job.status === "cancelled").length, icon: XCircle, color: "teal" },
  ] as const;
  const serviceInvoices = branchScopedInvoices;
  const warrantyClaims = branchScopedJobs.filter((job) => job.warranty_claim);
  const serviceWarrantyAssets = branchScopedAssets.filter((asset) => asset.warranty_status !== "not_recorded");
  const appointmentDateBoundary = new Date();
  const scopedAppointments = appointments.filter((appointment) => {
    if (jobLocationFilter !== "all" && appointment.location_id !== jobLocationFilter) return false;
    const startsAt = new Date(appointment.starts_at);
    if (appointmentDateFilter === "upcoming") return startsAt >= appointmentDateBoundary;
    if (appointmentDateFilter === "last_30") return startsAt >= new Date(appointmentDateBoundary.getTime() - 30 * 24 * 60 * 60 * 1000) && startsAt < appointmentDateBoundary;
    if (appointmentDateFilter === "next_30") return startsAt >= appointmentDateBoundary && startsAt <= new Date(appointmentDateBoundary.getTime() + 30 * 24 * 60 * 60 * 1000);
    return true;
  });
  const filteredAppointments = scopedAppointments.filter((appointment) => {
    if (appointmentStatusFilter !== "all" && appointment.status !== appointmentStatusFilter) return false;
    const term = appointmentSearch.trim().toLocaleLowerCase();
    return !term || [
      appointment.title,
      appointment.customer_name,
      appointment.technician_name,
      appointment.job_number,
      appointment.asset_label,
    ].some((value) => value?.toLocaleLowerCase().includes(term));
  });
  const appointmentPageSize = 10;
  const appointmentPageCount = Math.max(1, Math.ceil(filteredAppointments.length / appointmentPageSize));
  const currentAppointmentPage = Math.min(appointmentPage, appointmentPageCount);
  const paginatedAppointments = filteredAppointments.slice(
    (currentAppointmentPage - 1) * appointmentPageSize,
    currentAppointmentPage * appointmentPageSize,
  );
  const hasJobFilters = jobSearch !== ""
    || jobStatusFilter !== "all"
    || jobPriorityFilter !== "all"
    || jobCategoryFilter !== "all"
    || jobTechnicianFilter !== "all"
    || jobCustomerFilter !== "all"
    || jobLocationFilter !== "all"
    || jobDateRange !== "30";
  const serviceViewContent = {
    jobs: { title: "Service Jobs", subtitle: "Manage and track all service and repair jobs." },
    appointments: { title: "Appointments & Bookings", subtitle: "Schedule customer visits and manage service appointments." },
    quotations: { title: "Quotations & Invoices", subtitle: "Prepare repair estimates and follow their related invoices." },
    invoices: { title: "Service Invoices", subtitle: "Search and review invoices created for service repair jobs." },
    parts: { title: "Service Parts", subtitle: "Track parts issued to service jobs using existing inventory records." },
    communications: { title: "Customer Communications", subtitle: "Review customer updates and repair communication history." },
    assets: { title: "Customers & Assets", subtitle: "View shared CRM customers and their registered service equipment." },
    warranty: { title: "Warranty & Returns", subtitle: "Review recorded equipment coverage and service warranty claims." },
  }[view];
  function resetJobFilters() {
    setJobSearch("");
    setJobStatusFilter("all");
    setJobPriorityFilter("all");
    setJobCategoryFilter("all");
    setJobTechnicianFilter("all");
    setJobCustomerFilter("all");
    setJobLocationFilter("all");
    setJobDateRange("30");
    setJobPage(1);
  }

  return (
    <div className="service-center-ui flex flex-col gap-6">
      <header className="order-1 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            <Wrench className="h-7 w-7" aria-hidden="true" />
          </span>
          <div>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Think Service &amp; Repairs</p>
          <h1 className="mt-1 text-2xl font-semibold text-ledger-900 dark:text-white">{serviceViewContent.title}</h1>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">{serviceViewContent.subtitle}</p>
          </div>
        </div>
        <div className={view === "jobs" ? "flex flex-wrap items-center gap-2" : "hidden"}>
          <label className="sr-only" htmlFor="service-job-date-range">Job date range</label>
          <span className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-500" aria-hidden="true" />
            <select id="service-job-date-range" value={jobDateRange} onChange={(event) => { setJobDateRange(event.target.value); setJobPage(1); }} className="rounded-lg border border-ledger-200 bg-white py-2.5 pl-9 pr-8 text-sm text-ledger-700 shadow-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="all">All time</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-500" aria-hidden="true" />
          </span>
          <label className="sr-only" htmlFor="service-job-branch">Job branch</label>
          <span className="relative">
            <select id="service-job-branch" value={jobLocationFilter} onChange={(event) => { setJobLocationFilter(event.target.value); setJobPage(1); }} className="rounded-lg border border-ledger-200 bg-white px-3 py-2.5 pr-8 text-sm text-ledger-700 shadow-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
              <option value="all">All branches</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-500" aria-hidden="true" />
          </span>
          {canCreate && (
            <button type="button" onClick={() => setIsCreateJobOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 dark:bg-emerald-700 dark:hover:bg-emerald-600">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New service job
            </button>
          )}
        </div>
      </header>

      <div className={view === "jobs" || view === "appointments" ? "hidden" : "order-2 flex items-center justify-end gap-2"}>
        <label htmlFor="service-view-branch" className="text-sm text-ledger-600 dark:text-ledger-300">Branch</label>
        <select id="service-view-branch" value={jobLocationFilter} onChange={(event) => { setJobLocationFilter(event.target.value); setCustomerPage(1); }} className="rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm text-ledger-700 shadow-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
          <option value="all">All branches</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </div>

      <nav aria-label="Service center sections" className="order-2 flex gap-1 overflow-x-auto rounded-xl border border-ledger-200 bg-white p-1 dark:border-ledger-700 dark:bg-ink-900">
        {([
          ["jobs", "Service Jobs"],
          ["appointments", "Appointments"],
          ["quotations", "Quotations"],
          ["invoices", "Invoices"],
          ["assets", "Customers & Assets"],
          ["warranty", "Warranty"],
          ["parts", "Service Parts"],
          ["communications", "Communications"],
        ] as const).filter(([key]) =>
          (key !== "parts" || partsPanel !== null)
          && (key !== "assets" || canViewAssets || canCreateAsset)
          && (key !== "warranty" || canViewAssets)
          && (key !== "appointments" || canViewAppointments || canCreateAppointment)
          && (key !== "invoices" || canViewAccounting)
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === "jobs" ? "/service-center" : `/service-center/${key === "assets" ? "customers" : key}`}
            aria-current={view === key ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${view === key ? "bg-emerald-800 text-white dark:bg-emerald-700" : "text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-ink-800"}`}
          >
            {label}
          </Link>
        ))}
        <Link href="/inventory/return-products" className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-ink-800">Returns</Link>
      </nav>

      <section aria-label="Appointment summary" className={view === "appointments" ? "order-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : "hidden"}>
        {[
          { label: "Total Bookings", value: scopedAppointments.length },
          { label: "Completed", value: scopedAppointments.filter((item) => item.status === "completed").length },
          { label: "Pending", value: scopedAppointments.filter((item) => item.status === "scheduled" || item.status === "confirmed").length },
          { label: "Cancelled", value: scopedAppointments.filter((item) => item.status === "cancelled" || item.status === "no_show").length },
        ].map((card) => (
          <article key={card.label} className="rounded-xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <p className="text-sm font-medium text-ledger-500 dark:text-ledger-400">{card.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-ledger-900 dark:text-white">{card.value.toLocaleString()}</p>
            <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Appointments in the selected date range and branch</p>
          </article>
        ))}
      </section>

      <section aria-label="Service job summary" className={view === "jobs" ? "order-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" : "hidden"}>
        {summaryCards.map((card) => {
          const Icon = card.icon;
          const style = {
            emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
            blue: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900",
            amber: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
            purple: "bg-purple-50 text-purple-700 ring-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:ring-purple-900",
            teal: "bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900",
          }[card.color];
          return (
            <article key={card.label} className="min-w-0 rounded-xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${style}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-right text-2xl font-bold tabular-nums text-ledger-900 dark:text-white">{card.value.toLocaleString()}</span>
              </div>
              <p className="mt-3 text-sm font-medium text-ledger-600 dark:text-ledger-300">{card.label}</p>
              <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">In selected period and branch</p>
            </article>
          );
        })}
      </section>
      {jobs.length === 500 && (
        <p className={`order-4 -mt-3 text-xs text-ledger-500 dark:text-ledger-400 ${view === "jobs" ? "" : "hidden"}`}>
          Summary and filters reflect the latest 500 service jobs currently loaded.
        </p>
      )}

      <div className={`[order:20] ${view === "jobs" ? "" : "hidden"}`}>
        <ServiceStatusNotificationSettings
          enabled={serviceStatusNotificationsEnabled}
          canManage={canManageServiceNotifications}
          recentResults={serviceStatusNotificationResults}
        />
      </div>

      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={`order-5 rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>
          {error ?? notice}
        </p>
      )}

      <div className={view === "appointments" ? "order-6 space-y-6" : "hidden"}>
      {!canViewAppointments && !canCreateAppointment && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          You do not have permission to view or schedule service appointments.
        </p>
      )}
      {canCreateAppointment && (
        <form id="book-appointment" onSubmit={submitAppointment} className="[order:21] scroll-mt-24 grid gap-4 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-3">
            <h2 className="font-semibold text-ledger-900 dark:text-white">Schedule a service appointment</h2>
            <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Optionally reserve an active technician, link equipment, or attach an existing service job.</p>
          </div>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Branch</span>
            <select name="appointmentLocationId" required value={appointmentLocationId} onChange={(event) => setAppointmentLocationId(event.target.value)} disabled={isPending || !locations.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
              <option value="">Select a branch</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Customer</span>
            <select name="appointmentCustomerId" required value={appointmentCustomerId} onChange={(event) => setAppointmentCustomerId(event.target.value)} disabled={isPending || !customers.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
              <option value="">Select a customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Appointment</span>
            <input name="appointmentTitle" required maxLength={160} disabled={isPending} placeholder="Repair assessment, collection..." className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Starts</span>
            <input name="appointmentStartsAt" type="datetime-local" required disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Ends</span>
            <input name="appointmentEndsAt" type="datetime-local" required disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Equipment (optional)</span>
            <select name="appointmentAssetId" defaultValue="" disabled={isPending || !appointmentCustomerId || !appointmentLocationId} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
              <option value="">No equipment selected</option>
              {assets.filter((asset) => asset.location_id === appointmentLocationId && asset.customer_id === appointmentCustomerId).map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Technician (optional)</span>
            <select name="appointmentTechnicianId" defaultValue="" disabled={isPending || !appointmentLocationId} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
              <option value="">Unassigned</option>
              {technicians.filter((technician) => technician.locationId === appointmentLocationId).map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Service job (optional)</span>
            <select name="appointmentJobId" defaultValue="" disabled={isPending || !appointmentLocationId || !appointmentCustomerId} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
              <option value="">No job linked</option>
              {jobs.filter((job) => job.location_id === appointmentLocationId && job.customer_id === appointmentCustomerId).map((job) => <option key={job.id} value={job.id}>{job.job_number}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200 md:col-span-2 xl:col-span-3">
            <span>Notes (optional)</span>
            <textarea name="appointmentNotes" maxLength={2000} rows={2} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
          </label>
          <div className="md:col-span-2 xl:col-span-3">
            <button type="submit" disabled={isPending || !locations.length || !customers.length} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {isPending ? "Saving..." : "Schedule appointment"}
            </button>
          </div>
        </form>
      )}

      {canViewAppointments && (
        <section id="appointments" className="scroll-mt-24 overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ledger-200 px-5 py-4 dark:border-ledger-700">
            <div>
              <h2 className="font-semibold text-ledger-900 dark:text-white">Service appointments</h2>
              <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Showing {filteredAppointments.length.toLocaleString()} of {scopedAppointments.length.toLocaleString()} appointments</p>
              {appointments.length === 500 && <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">The appointment list is limited to the 500 records currently loaded.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="appointment-search">Search appointments</label>
              <input id="appointment-search" type="search" value={appointmentSearch} onChange={(event) => { setAppointmentSearch(event.target.value); setAppointmentPage(1); }} placeholder="Search appointments" className="rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800" />
              <label className="sr-only" htmlFor="appointment-status">Filter by appointment status</label>
              <select id="appointment-status" value={appointmentStatusFilter} onChange={(event) => { setAppointmentStatusFilter(event.target.value); setAppointmentPage(1); }} className="rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800">
                <option value="all">All statuses</option>
                {Object.entries(appointmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label className="sr-only" htmlFor="appointment-date-range">Filter by appointment date</label>
              <select id="appointment-date-range" value={appointmentDateFilter} onChange={(event) => { setAppointmentDateFilter(event.target.value); setAppointmentPage(1); }} className="rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800">
                <option value="all">All dates</option>
                <option value="upcoming">Upcoming</option>
                <option value="last_30">Last 30 days</option>
                <option value="next_30">Next 30 days</option>
              </select>
              <label className="sr-only" htmlFor="appointment-branch">Filter by branch</label>
              <select id="appointment-branch" value={jobLocationFilter} onChange={(event) => { setJobLocationFilter(event.target.value); setAppointmentPage(1); setCustomerPage(1); }} className="rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800">
                <option value="all">All branches</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </div>
          </div>
          {filteredAppointments.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ledger-500 dark:text-ledger-400">{appointments.length === 0 ? "No appointments are scheduled." : "No appointments match these filters."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-ledger-50 text-xs uppercase text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-5 py-3 font-medium">Appointment</th>
                    <th className="px-5 py-3 font-medium">Customer / branch</th>
                    <th className="px-5 py-3 font-medium">Assignment</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                  {paginatedAppointments.map((appointment) => {
                    const nextStatuses = appointmentNextStatuses[appointment.status];
                    return (
                      <tr key={appointment.id} className="align-top">
                        <td className="whitespace-nowrap px-5 py-4 text-ledger-700 dark:text-ledger-300">
                          <p>{new Date(appointment.starts_at).toLocaleString()}</p>
                          <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">until {new Date(appointment.ends_at).toLocaleTimeString()}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-ledger-900 dark:text-white">{appointment.title}</p>
                          {appointment.notes && <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-ledger-500 dark:text-ledger-400">{appointment.notes}</p>}
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-ledger-900 dark:text-white">{appointment.customer_name}</p>
                          <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{appointment.location_name}</p>
                        </td>
                        <td className="px-5 py-4 text-xs text-ledger-600 dark:text-ledger-300">
                          {appointment.asset_label && <p>{appointment.asset_label}</p>}
                          {appointment.technician_name && <p className="mt-1">Technician: {appointment.technician_name}</p>}
                          {appointment.job_number && <p className="mt-1">Job: {appointment.job_number}</p>}
                          {!appointment.asset_label && !appointment.technician_name && !appointment.job_number && "Unassigned"}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-ledger-800 dark:text-ledger-200">{appointmentStatusLabels[appointment.status]}</p>
                          {canEditAppointments && (appointment.status === "scheduled" || appointment.status === "confirmed") && (
                            <ServiceAppointmentReminder
                              appointmentId={appointment.id}
                              title={appointment.title}
                              customerName={appointment.customer_name}
                              startsAt={appointment.starts_at}
                            />
                          )}
                          {canEditAppointments && nextStatuses.length > 0 && (
                            <form onSubmit={submitAppointmentTransition} className="mt-2 flex gap-2">
                              <input type="hidden" name="appointmentId" value={appointment.id} />
                              <select name="appointmentStatus" defaultValue={nextStatuses[0]} disabled={isPending} aria-label={`Next status for ${appointment.title}`} className="min-w-0 rounded border border-ledger-300 bg-white px-2 py-1 text-xs dark:border-ledger-600 dark:bg-ink-800">
                                {nextStatuses.map((status) => <option key={status} value={status}>{appointmentStatusLabels[status]}</option>)}
                              </select>
                              <button type="submit" disabled={isPending} className="rounded bg-ledger-100 px-2 py-1 text-xs font-medium text-ledger-700 hover:bg-ledger-200 disabled:opacity-50 dark:bg-ink-700 dark:text-ledger-200 dark:hover:bg-ink-600">
                                Update
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredAppointments.length > appointmentPageSize && (
            <div className="flex items-center justify-between border-t border-ledger-200 px-5 py-3 text-sm dark:border-ledger-700">
              <span className="text-ledger-500 dark:text-ledger-400">Page {currentAppointmentPage} of {appointmentPageCount}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAppointmentPage((page) => Math.max(1, page - 1))} disabled={currentAppointmentPage <= 1} className="rounded-md border border-ledger-300 px-3 py-1.5 disabled:opacity-50 dark:border-ledger-600">Previous</button>
                <button type="button" onClick={() => setAppointmentPage((page) => Math.min(appointmentPageCount, page + 1))} disabled={currentAppointmentPage >= appointmentPageCount} className="rounded-md border border-ledger-300 px-3 py-1.5 disabled:opacity-50 dark:border-ledger-600">Next</button>
              </div>
            </div>
          )}
        </section>
      )}
      </div>

      {canCreate && (
        <details id="new-service-job" open={isCreateJobOpen} onToggle={(event) => setIsCreateJobOpen(event.currentTarget.open)} className={`order-5 scroll-mt-24 overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900 ${view === "jobs" ? "" : "hidden"}`}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold text-ledger-900 marker:hidden dark:text-white">
            Receive a service job
            <ChevronDown className="h-4 w-4 text-ledger-500" aria-hidden="true" />
          </summary>
          <form onSubmit={submitCreate} className="grid gap-4 border-t border-ledger-200 p-5 dark:border-ledger-700 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="font-semibold text-ledger-900 dark:text-white">Job intake details</h2>
            <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Create a branch-scoped job linked to an existing CRM customer.</p>
          </div>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Branch</span>
            <select name="locationId" required disabled={isPending || !locations.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
              <option value="">Select a branch</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Customer</span>
            <select name="customerId" required disabled={isPending || !customers.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
              <option value="">Select a customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Priority</span>
            <select name="priority" defaultValue="normal" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
              {priorityOptions.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}
            </select>
          </label>
          {assets.length > 0 && (
            <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
              <span>Customer equipment (optional)</span>
              <select name="assetId" defaultValue="" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
                <option value="">No equipment selected</option>
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.label} — {customerNames.get(asset.customer_id) ?? "Customer"} · {locationNames.get(asset.location_id) ?? "Branch"}</option>)}
              </select>
            </label>
          )}
          {warrantySourceJobs.length > 0 && (
            <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
              <span>Warranty follow-up <span className="text-ledger-400">(optional)</span></span>
              <select name="originalJobId" defaultValue="" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
                <option value="">New repair (not a warranty claim)</option>
                {warrantySourceJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.job_number} · {customerNames.get(job.customer_id) ?? "Customer"} · {assetById.get(job.asset_id!)?.label ?? "Equipment"}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-ledger-400">Only previously handed-over repairs with recorded equipment are eligible. Select the same customer, branch, and equipment above.</span>
            </label>
          )}
          {technicians.length > 0 && (
            <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
              <span>Assign technician (optional)</span>
              <select name="technicianId" defaultValue="" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
                <option value="">Unassigned</option>
                {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name} · {locationNames.get(technician.locationId) ?? "Branch"}</option>)}
              </select>
            </label>
          )}
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200 md:col-span-2">
            <span>Equipment condition at intake</span>
            <textarea name="conditionOnArrival" required maxLength={1000} rows={2} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" placeholder="Describe the visible condition when received" />
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200 md:col-span-2">
            <span>Accessories received <span className="text-ledger-400">(optional, one per line; up to 20)</span></span>
            <textarea name="intakeAccessories" maxLength={1800} rows={2} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" placeholder={"Charger\nProtective case"} />
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Intake confirmed by</span>
            <input name="intakeConfirmedBy" required maxLength={120} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
          </label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Confirming person</span>
            <select name="intakeConfirmedAs" required defaultValue="customer" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
              <option value="customer">Customer</option>
              <option value="authorized_representative">Authorized representative</option>
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm text-ledger-700 dark:text-ledger-200 md:col-span-2">
            <input type="checkbox" name="intakeAcknowledged" required disabled={isPending} className="mt-1" />
            The customer or representative reviewed and acknowledged the recorded problem, condition, and accessories.
          </label>
          <fieldset className="space-y-2 rounded-lg border border-ledger-200 p-3 dark:border-ledger-700 md:col-span-2">
            <legend className="px-1 text-sm font-medium text-ledger-800 dark:text-ledger-200">Optional automatic repair updates</legend>
            <p className="text-xs text-ledger-500 dark:text-ledger-400">
              Select channels only if the customer or representative expressly opted in. Updates are sent only for enabled statuses, only on the selected preferred channel, and only when its provider is configured.
            </p>
            <label className="flex items-start gap-2 text-xs text-ledger-700 dark:text-ledger-300">
              <input type="checkbox" name="customerUpdateConsentAcknowledged" value="on" disabled={isPending} className="mt-0.5" />
              The customer or representative expressly consents to automatic repair status messages on the selected channels.
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(["WhatsApp", "SMS", "Email"] as const).map((channel) => (
                <label key={channel} className="flex items-center gap-2 text-sm text-ledger-700 dark:text-ledger-200">
                  <input type="checkbox" name="customerUpdateChannels" value={channel} disabled={isPending} />
                  {channel}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200 md:col-span-2">
            <span>Reported problem</span>
            <textarea name="reportedProblem" required maxLength={4000} rows={3} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" placeholder="Describe the issue reported by the customer" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={isPending || !locations.length || !customers.length} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
              {isPending ? "Saving..." : "Create job"}
            </button>
            {(!locations.length || !customers.length) && <p className="mt-2 text-sm text-ledger-500 dark:text-ledger-400">Add an active branch and at least one CRM customer before creating a job.</p>}
          </div>
          </form>
        </details>
      )}

      <section id="service-jobs" className={`order-6 scroll-mt-24 overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900 ${view === "jobs" ? "" : "hidden"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ledger-200 px-5 py-4 dark:border-ledger-700">
          <div>
            <h2 className="font-semibold text-ledger-900 dark:text-white">All service jobs</h2>
            <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
              Showing {filteredJobs.length.toLocaleString()} matching {filteredJobs.length === 1 ? "job" : "jobs"}
              {jobs.length === 500 ? " from the latest 500 records" : ""}
            </p>
          </div>
          <Link href="/service-center/reports" className="text-sm font-medium text-amber-800 hover:underline dark:text-amber-300">
            Service reports
          </Link>
        </div>
        <div className="space-y-3 border-b border-ledger-200 p-4 dark:border-ledger-700">
          <label className="relative block">
            <span className="sr-only">Search jobs, customers, or service details</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" aria-hidden="true" />
            <input
              type="search"
              value={jobSearch}
              onChange={(event) => { setJobSearch(event.target.value); setJobPage(1); }}
              placeholder="Search jobs, customers, or services..."
              className="w-full rounded-lg border border-ledger-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ledger-800 outline-none placeholder:text-ledger-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-100"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <label>
              <span className="sr-only">Filter by job status</span>
              <select value={jobStatusFilter} onChange={(event) => { setJobStatusFilter(event.target.value); setJobPage(1); }} className="w-full rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm text-ledger-700 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
                <option value="all">All statuses</option>
                {(Object.keys(statusLabels) as ServiceJobStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by priority</span>
              <select value={jobPriorityFilter} onChange={(event) => { setJobPriorityFilter(event.target.value); setJobPage(1); }} className="w-full rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm text-ledger-700 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
                <option value="all">All priorities</option>
                {priorityOptions.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by service type</span>
              <select value={jobCategoryFilter} onChange={(event) => { setJobCategoryFilter(event.target.value); setJobPage(1); }} className="w-full rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm text-ledger-700 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
                <option value="all">All service types</option>
                <option value="">Uncategorized</option>
                {serviceCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by technician</span>
              <select value={jobTechnicianFilter} onChange={(event) => { setJobTechnicianFilter(event.target.value); setJobPage(1); }} className="w-full rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm text-ledger-700 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
                <option value="all">All technicians</option>
                <option value="">Unassigned</option>
                {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by customer</span>
              <select value={jobCustomerFilter} onChange={(event) => { setJobCustomerFilter(event.target.value); setJobPage(1); }} className="w-full rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm text-ledger-700 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
                <option value="all">All customers</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={resetJobFilters} disabled={!hasJobFilters} className="inline-flex items-center justify-center gap-2 rounded-lg border border-ledger-200 px-3 py-2 text-sm font-medium text-ledger-700 hover:bg-ledger-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-ink-800">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset filters
            </button>
          </div>
        </div>
        {jobs.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ledger-500 dark:text-ledger-400">No service jobs have been received yet.</p>
        )}
        {jobs.length > 0 && filteredJobs.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="font-medium text-ledger-800 dark:text-ledger-200">No jobs match these filters</p>
            <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Try changing your search or resetting the filters.</p>
            <button type="button" onClick={resetJobFilters} className="mt-4 text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300">Reset filters</button>
          </div>
        )}
        <div className={`overflow-x-auto ${filteredJobs.length === 0 ? "hidden" : ""}`}>
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-ledger-50 text-xs text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">
                <tr>
                  {["#", "Job Number", "Customer", "Service Type", "Status", "Priority", "Technician", "Branch", "Created On", "Actions"].map((heading) => (
                    <th key={heading} className="whitespace-nowrap px-4 py-3 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                {paginatedJobs.map((job, index) => {
                  const asset = job.asset_id ? assetById.get(job.asset_id) : undefined;
                  const availableStatuses = job.warranty_claim?.status === "covered"
                    ? nextStatuses[job.status].filter((status) => status !== "awaiting_payment")
                    : nextStatuses[job.status];
                  return (
                  <Fragment key={job.id}>
                  <tr id={`job-${job.id}`} className="scroll-mt-24 hover:bg-ledger-50/70 dark:hover:bg-ink-800/50">
                    <td className="px-4 py-3">
                      <p className="text-xs text-ledger-500 dark:text-ledger-400">{(currentPage - 1) * jobPageSize + index + 1}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <a href={`#job-${job.id}`} className="font-semibold text-emerald-800 hover:underline dark:text-emerald-300">{job.job_number}</a>
                      <details className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
                        <summary className="cursor-pointer">Intake details</summary>
                        <div className="mt-2 max-w-64 space-y-1">
                          <p>Condition: {job.condition_on_arrival}</p>
                          <p>Confirmed by {job.intake_confirmed_by} · {job.intake_confirmed_as === "customer" ? "Customer" : "Authorized representative"}</p>
                          <p>{new Date(job.intake_confirmed_at).toLocaleString()}</p>
                          {job.accessories.length > 0 && <p>Accessories: {job.accessories.join(", ")}</p>}
                        </div>
                      </details>
                    </td>
                    <td className="px-4 py-3 text-ledger-900 dark:text-white">{customerNames.get(job.customer_id) ?? "Customer"}</td>
                    <td className="max-w-56 px-4 py-3">
                      <p className="font-medium text-ledger-800 dark:text-ledger-200">{serviceCategoryById.get(job.category_id ?? "") ?? "General service"}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-ledger-500 dark:text-ledger-400">{job.reported_problem}</p>
                      {asset && <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{asset.label}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                        job.status === "in_progress" ? "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                          : job.status === "completed" || job.status === "closed" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                            : job.status === "cancelled" ? "bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ledger-300"
                              : job.status === "awaiting_parts" || job.status === "awaiting_quotation" || job.status === "awaiting_customer_approval" || job.status === "awaiting_payment" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                                : "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-200"
                      }`}>{statusLabels[job.status]}</span>
                      {job.warranty_claim || canEdit ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-300">Manage job</summary>
                          <div className="mt-2 min-w-64 space-y-3 rounded-lg border border-ledger-200 bg-white p-3 dark:border-ledger-700 dark:bg-ink-900">
                      {job.warranty_claim && (
                        <div className="mt-2 rounded-lg border border-purple-200 bg-purple-50/60 p-3 dark:border-purple-900 dark:bg-purple-950/20">
                          <p className="text-xs font-semibold text-purple-900 dark:text-purple-200">
                            Warranty claim · {warrantyClaimLabels[job.warranty_claim.status]}
                          </p>
                          <p className="mt-1 text-xs text-ledger-600 dark:text-ledger-300">
                            Follow-up to {job.warranty_claim.original_job_number}
                          </p>
                          {job.warranty_claim.decision_note && (
                            <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{job.warranty_claim.decision_note}</p>
                          )}
                          {job.warranty_claim.status === "pending" && job.status === "inspection" && (
                            <p className="mt-2 text-xs font-medium text-purple-800 dark:text-purple-200">
                              Decide coverage before work can proceed.
                            </p>
                          )}
                          {canEdit && job.warranty_claim.status === "pending" && (
                            <form
                              onSubmit={(event) => void submitRecord(event, decideServiceJobWarrantyClaim, "Warranty claim decision recorded.")}
                              className="mt-3 space-y-2"
                            >
                              <input type="hidden" name="warrantyClaimId" value={job.warranty_claim.id} />
                              <label className="block text-xs text-ledger-600 dark:text-ledger-300">
                                Staff decision
                                <select name="warrantyDecision" required defaultValue="" disabled={isPending} className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800">
                                  <option value="" disabled>Select decision</option>
                                  <option value="covered">Covered by warranty</option>
                                  <option value="not_covered">Not covered</option>
                                </select>
                              </label>
                              <label className="block text-xs text-ledger-600 dark:text-ledger-300">
                                Reason
                                <textarea name="warrantyDecisionNote" required maxLength={1000} rows={2} disabled={isPending} placeholder="Record the coverage assessment" className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800" />
                              </label>
                              <button type="submit" disabled={isPending} className="rounded bg-purple-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-800 disabled:opacity-50">
                                {isPending ? "Saving..." : "Record decision"}
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                      {canEdit && availableStatuses.length > 0 && (
                        <form onSubmit={submitTransition} className="mt-2 flex gap-2">
                          <input type="hidden" name="jobId" value={job.id} />
                          <select name="status" defaultValue={availableStatuses[0]} disabled={isPending} aria-label={`Next status for ${job.job_number}`} className="min-w-0 rounded border border-ledger-300 bg-white px-2 py-1 text-xs dark:border-ledger-600 dark:bg-ink-800">
                            {availableStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                          </select>
                          <input name="note" maxLength={2000} disabled={isPending} aria-label={`Status note for ${job.job_number}`} placeholder="Note (optional)" className="min-w-0 rounded border border-ledger-300 bg-white px-2 py-1 text-xs dark:border-ledger-600 dark:bg-ink-800" />
                          <button type="submit" disabled={isPending} className="rounded bg-ledger-100 px-2 py-1 text-xs font-medium text-ledger-700 hover:bg-ledger-200 disabled:opacity-50 dark:bg-ink-700 dark:text-ledger-200 dark:hover:bg-ink-600">
                            Update
                          </button>
                        </form>
                      )}
                      {job.invoice ? (
                        <Link href={`/accounting/invoices/${job.invoice.id}`} className="mt-2 block text-xs font-medium text-amber-700 hover:underline dark:text-amber-300">
                          Invoice #{String(job.invoice.invoice_number).padStart(4, "0")} · {job.invoice.status}
                        </Link>
                      ) : canEdit && job.status === "ready_for_collection" && job.has_approved_estimate ? (
                        <form onSubmit={submitServiceInvoice} className="mt-2 space-y-2">
                          <input type="hidden" name="serviceInvoiceJobId" value={job.id} />
                          <label className="block text-xs text-ledger-500 dark:text-ledger-400">
                            Invoice due date
                            <input
                              name="serviceInvoiceDueDate"
                              type="date"
                              required
                              min={new Date().toISOString().slice(0, 10)}
                              defaultValue={new Date().toISOString().slice(0, 10)}
                              disabled={isPending}
                              className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1 text-xs dark:border-ledger-600 dark:bg-ink-800"
                            />
                          </label>
                          <button type="submit" disabled={isPending} className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                            {isPending ? "Creating..." : "Create invoice"}
                          </button>
                        </form>
                      ) : null}
                      {job.status === "ready_for_collection" && job.warranty_claim?.status === "covered" && (
                        <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          No customer invoice required. Record handover after collection.
                        </p>
                      )}
                      {canEdit && (
                        (job.status === "completed" && job.invoice?.status === "paid")
                        || (job.status === "ready_for_collection" && job.warranty_claim?.status === "covered")
                      ) && (
                        <form
                          onSubmit={(event) => void submitRecord(event, recordServiceJobHandover, `Job ${job.job_number} handover recorded.`)}
                          className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20"
                        >
                          <input type="hidden" name="handoverJobId" value={job.id} />
                          {job.warranty_claim?.status === "covered" && <input type="hidden" name="handoverWarrantyCovered" value="yes" />}
                          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                            {job.warranty_claim?.status === "covered" ? "No-charge warranty handover" : "Record customer handover"}
                          </p>
                          <label className="block text-xs text-ledger-600 dark:text-ledger-300">
                            Collected by
                            <input name="handoverRecipientName" required maxLength={120} disabled={isPending} className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800" />
                          </label>
                          <label className="block text-xs text-ledger-600 dark:text-ledger-300">
                            Recipient
                            <select name="handoverRecipientType" required disabled={isPending} defaultValue="customer" className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800">
                              <option value="customer">Customer</option>
                              <option value="authorized_representative">Authorized representative</option>
                            </select>
                          </label>
                          <label className="block text-xs text-ledger-600 dark:text-ledger-300">
                            Equipment condition
                            <textarea name="handoverCondition" required maxLength={1000} rows={2} disabled={isPending} placeholder="Condition when released to the recipient" className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800" />
                          </label>
                          <label className="block text-xs text-ledger-600 dark:text-ledger-300">
                            Accessories returned <span className="text-ledger-400">(optional)</span>
                            <textarea name="handoverAccessories" maxLength={1000} rows={2} disabled={isPending} placeholder="List accessories returned with the equipment" className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800" />
                          </label>
                          <label className="flex items-start gap-2 text-xs text-ledger-600 dark:text-ledger-300">
                            <input type="checkbox" name="handoverAcknowledged" required disabled={isPending} className="mt-0.5" />
                            Recipient acknowledged receiving the equipment.
                          </label>
                          <button type="submit" disabled={isPending} className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
                            {isPending ? "Recording..." : "Confirm handover"}
                          </button>
                        </form>
                      )}
                      {job.handovers.length > 0 && (
                        <div className="mt-3 space-y-2 rounded-lg border border-ledger-200 p-3 dark:border-ledger-700">
                          <p className="text-xs font-semibold text-ledger-800 dark:text-ledger-200">Handover history</p>
                          {job.handovers.map((handover) => (
                            <div key={handover.id} className="border-t border-ledger-100 pt-2 text-xs dark:border-ledger-800">
                              <p className="font-medium text-ledger-700 dark:text-ledger-200">
                                {handover.recipient_name} · {handover.recipient_type === "customer" ? "Customer" : "Authorized representative"}
                              </p>
                              <p className="mt-1 text-ledger-500 dark:text-ledger-400">
                                {new Date(handover.collected_at).toLocaleString()} · Condition: {handover.condition_on_handover}
                              </p>
                              {handover.accessories_returned && (
                                <p className="mt-1 text-ledger-500 dark:text-ledger-400">Accessories returned: {handover.accessories_returned}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {canEdit && (
                        <ServiceCustomerUpdate
                          jobId={job.id}
                          jobNumber={job.job_number}
                          customerName={customerNames.get(job.customer_id) ?? "Customer"}
                          status={job.status}
                        />
                      )}
                          </div>
                        </details>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        job.priority === "urgent" ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"
                          : job.priority === "high" ? "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200"
                            : job.priority === "normal" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                              : "bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ledger-300"
                      }`}>{priorityLabels[job.priority]}</span>
                    </td>
                    <td className="px-4 py-3 text-ledger-700 dark:text-ledger-300">
                      {job.technician_id && technicianById.has(job.technician_id) ? technicianById.get(job.technician_id)?.name : <span className="text-ledger-400">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-ledger-700 dark:text-ledger-300">{locationNames.get(job.location_id) ?? "Branch"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ledger-600 dark:text-ledger-300">
                      <p>{new Date(job.created_at).toLocaleDateString()}</p>
                      <p className="mt-1 text-ledger-400">{new Date(job.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setExpandedJobId((current) => current === job.id ? null : job.id)} aria-label={`${expandedJobId === job.id ? "Hide" : "View"} details for ${job.job_number}`} aria-expanded={expandedJobId === job.id} title={`${expandedJobId === job.id ? "Hide" : "View"} ${job.job_number}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ledger-200 text-ledger-600 hover:bg-ledger-50 hover:text-emerald-800 dark:border-ledger-700 dark:text-ledger-300 dark:hover:bg-ink-800 dark:hover:text-emerald-300">
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                  {expandedJobId === job.id && (
                    <tr className="bg-emerald-50/50 dark:bg-emerald-950/10">
                      <td colSpan={10} className="px-5 py-4">
                        <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-ledger-500 dark:text-ledger-400">Reported problem</p>
                            <p className="mt-1 whitespace-pre-wrap text-ledger-800 dark:text-ledger-200">{job.reported_problem}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-ledger-500 dark:text-ledger-400">Equipment</p>
                            <p className="mt-1 text-ledger-800 dark:text-ledger-200">{asset?.label ?? "No equipment linked"}</p>
                            {asset && <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{warrantyStatusLabels[asset.warranty_status]}{asset.warranty_end_date ? ` · Through ${new Date(`${asset.warranty_end_date}T00:00:00`).toLocaleDateString()}` : ""}</p>}
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-ledger-500 dark:text-ledger-400">Intake condition</p>
                            <p className="mt-1 whitespace-pre-wrap text-ledger-800 dark:text-ledger-200">{job.condition_on_arrival}</p>
                            <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Confirmed by {job.intake_confirmed_by}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-ledger-500 dark:text-ledger-400">Related records</p>
                            {job.invoice ? <Link href={`/accounting/invoices/${job.invoice.id}`} className="mt-1 block text-emerald-800 hover:underline dark:text-emerald-300">Invoice #{String(job.invoice.invoice_number).padStart(4, "0")} · {job.invoice.status}</Link> : <p className="mt-1 text-ledger-600 dark:text-ledger-300">No invoice recorded</p>}
                            {job.warranty_claim && <p className="mt-1 text-xs text-purple-800 dark:text-purple-300">Warranty claim · {warrantyClaimLabels[job.warranty_claim.status]}</p>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-ledger-200 px-4 py-3 dark:border-ledger-700 ${filteredJobs.length === 0 ? "hidden" : ""}`}>
            <p className="text-xs text-ledger-500 dark:text-ledger-400">
              Showing {(currentPage - 1) * jobPageSize + 1}–{Math.min(currentPage * jobPageSize, filteredJobs.length)} of {filteredJobs.length.toLocaleString()} jobs
            </p>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="service-job-page-size">Rows per page</label>
              <select id="service-job-page-size" value={jobPageSize} onChange={(event) => { setJobPageSize(Number(event.target.value)); setJobPage(1); }} className="rounded-lg border border-ledger-200 bg-white px-2.5 py-2 text-xs text-ledger-700 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
              </select>
              <button type="button" onClick={() => setJobPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="rounded-lg border border-ledger-200 px-3 py-2 text-xs font-medium text-ledger-700 hover:bg-ledger-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-ink-800">Previous</button>
              <span className="min-w-16 text-center text-xs text-ledger-600 dark:text-ledger-300">{currentPage} / {pageCount}</span>
              <button type="button" onClick={() => setJobPage((page) => Math.min(pageCount, page + 1))} disabled={currentPage === pageCount} className="rounded-lg border border-ledger-200 px-3 py-2 text-xs font-medium text-ledger-700 hover:bg-ledger-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-ink-800">Next</button>
            </div>
          </div>
      </section>

      {canCreateAsset && (
        <div className={view === "assets" ? "[order:23] grid gap-6 xl:grid-cols-2" : "hidden"}>
            <form
              onSubmit={(event) => void submitRecord(event, createServiceAsset, "Customer equipment registered.")}
              className="space-y-4 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900"
            >
              <div>
                <h2 className="font-semibold text-ledger-900 dark:text-white">Register customer equipment</h2>
                <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Save an item once, then link it to future repair jobs.</p>
              </div>
              <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                <span>Branch</span>
                <select name="assetLocationId" required disabled={isPending || !locations.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
                  <option value="">Select a branch</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                <span>Owner</span>
                <select name="assetCustomerId" required disabled={isPending || !customers.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
                  <option value="">Select a customer</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                  <span>Equipment type</span>
                  <input name="assetType" required maxLength={80} disabled={isPending} placeholder="Laptop, generator..." className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
                </label>
                <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                  <span>Brand</span>
                  <input name="assetBrand" maxLength={100} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
                </label>
                <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                  <span>Model</span>
                  <input name="assetModel" maxLength={100} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
                </label>
                <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                  <span>Serial number</span>
                  <input name="assetSerialNumber" maxLength={120} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
                </label>
              </div>
              <fieldset className="space-y-3 rounded-lg border border-ledger-200 p-3 dark:border-ledger-700">
                <legend className="px-1 text-sm font-medium text-ledger-800 dark:text-ledger-200">Warranty details (optional)</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                    <span>Provider</span>
                    <input name="assetWarrantyProvider" maxLength={120} disabled={isPending} placeholder="Manufacturer or provider" className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
                  </label>
                  <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                    <span>Policy / claim reference</span>
                    <input name="assetWarrantyReference" maxLength={120} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
                  </label>
                  <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                    <span>Coverage starts</span>
                    <input name="assetWarrantyStartDate" type="date" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
                  </label>
                  <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                    <span>Coverage ends</span>
                    <input name="assetWarrantyEndDate" type="date" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
                  </label>
                </div>
                <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                  <span>Coverage terms</span>
                  <textarea name="assetWarrantyTerms" maxLength={1000} rows={2} disabled={isPending} placeholder="What is covered or excluded?" className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
                </label>
              </fieldset>
              <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                <span>Condition</span>
                <input name="assetCondition" maxLength={100} disabled={isPending} placeholder="New, good, damaged..." className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
              </label>
              <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                <span>Notes</span>
                <textarea name="assetNotes" maxLength={2000} rows={2} disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
              </label>
              <button type="submit" disabled={isPending || !locations.length || !customers.length} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                Register equipment
              </button>
            </form>
        </div>
      )}

      <div className={`[order:24] ${view === "parts" ? "" : "hidden"}`}>
        {partsPanel ?? <p className="rounded-xl border border-ledger-200 bg-white p-5 text-sm text-ledger-500 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-400">Service parts are unavailable for your current permissions.</p>}
      </div>

      <section id="communications" className={`[order:25] scroll-mt-24 space-y-4 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900 ${view === "communications" ? "" : "hidden"}`}>
        <div>
          <h2 className="font-semibold text-ledger-900 dark:text-white">Customer contact history</h2>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Record calls, messages, or visits about a repair. This saves an internal note only; it does not send anything to the customer.</p>
        </div>
        {canEdit && (
          <form
            onSubmit={(event) => void submitRecord(event, createServiceCustomerContact, "Customer contact was added to the repair history.")}
            className="grid gap-3 rounded-lg bg-ledger-50 p-4 dark:bg-ink-800 md:grid-cols-2 xl:grid-cols-4"
          >
            <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
              <span>Repair job</span>
              <select name="contactJobId" required disabled={isPending || !branchScopedJobs.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-900">
                <option value="">Select a repair job</option>
                {branchScopedJobs.map((job) => <option key={job.id} value={job.id}>{job.job_number} · {customerNames.get(job.customer_id) ?? "Customer"}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
              <span>Direction</span>
              <select name="contactDirection" defaultValue="outgoing" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-900">
                <option value="outgoing">We contacted customer</option>
                <option value="incoming">Customer contacted us</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
              <span>Method</span>
              <select name="contactMethod" defaultValue="phone" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-900">
                {Object.entries(contactMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
              <span>Outcome</span>
              <select name="contactOutcome" defaultValue="completed" disabled={isPending} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-900">
                {Object.entries(contactOutcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200 md:col-span-2 xl:col-span-4">
              <span>Contact details</span>
              <textarea name="contactDetails" required maxLength={2000} rows={2} disabled={isPending} placeholder="Summarize what was discussed or what follow-up is needed." className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-900" />
            </label>
            <div className="md:col-span-2 xl:col-span-4">
              <button type="submit" disabled={isPending || !branchScopedJobs.length} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {isPending ? "Saving..." : "Add to contact history"}
              </button>
            </div>
          </form>
        )}
        {branchScopedContacts.length === 0 ? (
          <p className="rounded-lg bg-ledger-50 px-4 py-6 text-center text-sm text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">No customer contact has been logged for repair jobs.</p>
        ) : (
          <ul className="divide-y divide-ledger-100 dark:divide-ledger-800">
            {branchScopedContacts.map((contact) => (
              <li key={contact.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium text-ledger-900 dark:text-white">{contact.job_number}</span>
                  <span className="text-ledger-500 dark:text-ledger-400">{contact.direction === "outgoing" ? "Outgoing" : "Incoming"} · {contactMethodLabels[contact.method]} · {contactOutcomeLabels[contact.outcome]}</span>
                  <time className="text-xs text-ledger-500 dark:text-ledger-400">{new Date(contact.created_at).toLocaleString()}</time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ledger-700 dark:text-ledger-300">{contact.details}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="quotations" className={`[order:26] scroll-mt-24 space-y-4 rounded-xl border border-ledger-200 bg-ledger-50/60 p-5 dark:border-ledger-700 dark:bg-ink-950/40 ${view === "quotations" ? "" : "hidden"}`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Estimates", value: branchScopedQuotations.length },
            { label: "Awaiting response", value: branchScopedQuotations.filter((item) => item.status === "draft" || item.status === "sent").length },
            { label: "Approved", value: branchScopedQuotations.filter((item) => item.status === "approved").length },
            { label: "Service invoices", value: serviceInvoices.length },
          ].map((card) => (
            <article key={card.label} className="rounded-xl border border-ledger-200 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900">
              <p className="text-sm font-medium text-ledger-500 dark:text-ledger-400">{card.label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-ledger-900 dark:text-white">{card.value.toLocaleString()}</p>
            </article>
          ))}
        </div>
        <div>
          <h2 className="font-semibold text-ledger-900 dark:text-white">Repair estimates and customer decisions</h2>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Each estimate is versioned and its sent/decision actions are recorded in the job history.</p>
        </div>
        <p className="text-sm text-ledger-600 dark:text-ledger-300">
          Service invoices are created through the existing accounting workflow. <Link href="/accounting/invoices" className="font-medium text-emerald-800 underline dark:text-emerald-300">Open all invoices</Link>
        </p>
        {canEdit && <ServiceQuotationForm jobs={estimateJobs} currency={currency} />}
        {branchScopedQuotations.length === 0 ? (
          <p className="rounded-lg bg-white px-4 py-8 text-center text-sm text-ledger-500 dark:bg-ink-900 dark:text-ledger-400">No estimates have been prepared yet.</p>
        ) : (
          <div className="space-y-3">
            {branchScopedQuotations.map((quotation) => (
              <article key={quotation.id} className="rounded-xl border border-ledger-200 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-ledger-900 dark:text-white">{quotation.job_number} · Estimate v{quotation.version}</h3>
                    <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
                      {new Date(quotation.created_at).toLocaleDateString()} · {quotationStatusLabels[quotation.status]}
                      {quotation.sent_at ? ` · Sent ${new Date(quotation.sent_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-ledger-500 dark:text-ledger-400">Subtotal {currency} {quotation.subtotal.toFixed(2)}</p>
                    <p className="text-ledger-500 dark:text-ledger-400">Tax ({quotation.tax_rate}%) {currency} {quotation.tax_amount.toFixed(2)}</p>
                    <p className="font-semibold text-ledger-900 dark:text-white">Total {currency} {quotation.total.toFixed(2)}</p>
                  </div>
                </div>
                {quotation.notes && <p className="mt-3 text-sm text-ledger-600 dark:text-ledger-300">{quotation.notes}</p>}
                {quotation.sent_note && (
                  <p className="mt-3 rounded-lg bg-ledger-50 px-3 py-2 text-xs text-ledger-600 dark:bg-ink-800 dark:text-ledger-300">
                    Sending note: {quotation.sent_note}
                  </p>
                )}
                {canEdit && quotation.status === "draft" && (
                  <ServiceQuotationDelivery quotationId={quotation.id} />
                )}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[400px] text-left text-xs">
                    <thead className="text-ledger-500 dark:text-ledger-400">
                      <tr><th className="py-2 font-medium">Item</th><th className="py-2 text-right font-medium">Qty</th><th className="py-2 text-right font-medium">Unit price</th><th className="py-2 text-right font-medium">Line total</th></tr>
                    </thead>
                    <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                      {quotation.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 text-ledger-800 dark:text-ledger-200">{item.description}</td>
                          <td className="py-2 text-right text-ledger-600 dark:text-ledger-300">{item.quantity}</td>
                          <td className="py-2 text-right text-ledger-600 dark:text-ledger-300">{currency} {item.unit_price.toFixed(2)}</td>
                          <td className="py-2 text-right text-ledger-700 dark:text-ledger-200">{currency} {item.line_total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {quotation.decision_note && (
                  <p className="mt-3 rounded-lg bg-ledger-50 px-3 py-2 text-xs text-ledger-600 dark:bg-ink-800 dark:text-ledger-300">
                    {quotation.status === "withdrawn" ? "Withdrawal note:" : "Customer response recorded:"} {quotation.decision_note}
                  </p>
                )}
                {canEdit && (quotation.status === "draft" || quotation.status === "sent") && (
                  <form onSubmit={submitQuotationTransition} className="mt-4 grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
                    <input type="hidden" name="quotationId" value={quotation.id} />
                    <select name="quotationStatus" defaultValue={quotation.status === "draft" ? "sent" : "approved"} disabled={isPending} aria-label={`Next action for estimate version ${quotation.version}`} className="rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800">
                      {quotation.status === "draft" ? (
                        <>
                          <option value="sent">Record as sent</option>
                          <option value="withdrawn">Withdraw draft</option>
                        </>
                      ) : (
                        <>
                          <option value="approved">Record customer approval</option>
                          <option value="rejected">Record customer decline</option>
                          <option value="withdrawn">Withdraw estimate and cancel job</option>
                        </>
                      )}
                    </select>
                    <input name="quotationActionNote" required maxLength={1000} disabled={isPending} aria-label="Sending, response, or withdrawal details" placeholder={quotation.status === "draft" ? "How it was sent, or why it was withdrawn" : "Customer response, or reason for withdrawal"} className="rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800" />
                    <button type="submit" disabled={isPending} className="rounded-lg bg-ledger-100 px-3 py-2 text-sm font-medium text-ledger-700 hover:bg-ledger-200 disabled:opacity-50 dark:bg-ink-700 dark:text-ledger-200 dark:hover:bg-ink-600">
                      {isPending ? "Saving..." : "Save action"}
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-ledger-200 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-ledger-900 dark:text-white">Service invoices</h3>
              <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Invoices linked to service jobs in the selected branch.</p>
            </div>
            <Link href="/accounting/invoices" className="text-sm font-medium text-emerald-800 underline dark:text-emerald-300">Open all invoices</Link>
          </div>
          {serviceInvoices.length === 0 ? (
            <p className="mt-4 text-sm text-ledger-500 dark:text-ledger-400">No service job invoices are recorded in this scope.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-ledger-200 text-xs uppercase text-ledger-500 dark:border-ledger-700 dark:text-ledger-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Invoice</th>
                    <th className="px-3 py-2 font-medium">Service job</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Due date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                  {serviceInvoices.slice(0, 10).map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-3 py-3">
                        <Link href={`/accounting/invoices/${invoice.id}`} className="font-medium text-emerald-800 underline dark:text-emerald-300">#{String(invoice.invoice_number).padStart(4, "0")}</Link>
                      </td>
                      <td className="px-3 py-3 text-ledger-700 dark:text-ledger-300">{invoice.job_number}</td>
                      <td className="px-3 py-3 capitalize text-ledger-700 dark:text-ledger-300">{invoice.status}</td>
                      <td className="px-3 py-3 text-ledger-700 dark:text-ledger-300">{new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {serviceInvoices.length > 10 && (
            <p className="mt-3 text-xs text-ledger-500 dark:text-ledger-400">
              Showing the latest 10 service invoices. <Link href="/service-center/invoices" className="font-medium text-emerald-800 underline dark:text-emerald-300">View all service invoices</Link>
            </p>
          )}
        </div>
      </section>

      {canViewAccounting && view === "invoices" && (
        <section className="order-7 space-y-5 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ledger-900 dark:text-white">Service invoices</h2>
              <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Invoices for repair jobs in the selected branch. Payment and invoice edits remain in Accounting.</p>
            </div>
            <Link href="/accounting/invoices" className="text-sm font-medium text-emerald-800 underline dark:text-emerald-300">Open accounting register</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Service invoices", value: branchScopedInvoices.length.toLocaleString() },
              { label: "Paid", value: branchScopedInvoices.filter((invoice) => invoice.status === "paid").length.toLocaleString() },
              { label: "Overdue", value: branchScopedInvoices.filter((invoice) => invoice.status === "overdue").length.toLocaleString() },
              {
                label: "Outstanding",
                value: `${currency} ${branchScopedInvoices
                  .filter((invoice) => invoice.status === "sent" || invoice.status === "overdue")
                  .reduce((total, invoice) => total + Math.max(0, invoice.amount - invoice.amount_paid), 0)
                  .toFixed(2)}`,
              },
            ].map((card) => (
              <article key={card.label} className="rounded-xl border border-ledger-200 bg-ledger-50/60 p-4 dark:border-ledger-700 dark:bg-ink-800">
                <p className="text-sm font-medium text-ledger-500 dark:text-ledger-400">{card.label}</p>
                <p className="mt-2 text-xl font-bold tabular-nums text-ledger-900 dark:text-white">{card.value}</p>
              </article>
            ))}
          </div>
          {serviceInvoicesLimited && (
            <p className="text-xs text-ledger-500 dark:text-ledger-400">Service invoice data is limited to the latest 1,000 organization records before branch filtering. Use the Accounting register for a complete search.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <label>
              <span className="sr-only">Search service invoices</span>
              <input
                type="search"
                value={invoiceSearch}
                onChange={(event) => { setInvoiceSearch(event.target.value); setInvoicePage(1); }}
                placeholder="Search invoice, customer, or job"
                className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800"
              />
            </label>
            <label>
              <span className="sr-only">Filter invoices by status</span>
              <select
                value={invoiceStatusFilter}
                onChange={(event) => { setInvoiceStatusFilter(event.target.value); setInvoicePage(1); }}
                className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800"
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </label>
          </div>
          {filteredServiceInvoices.length === 0 ? (
            <p className="rounded-lg bg-ledger-50 px-4 py-8 text-center text-sm text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">
              {branchScopedInvoices.length ? "No invoices match these filters." : "No service job invoices are recorded in this branch."}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-ledger-200 text-xs uppercase text-ledger-500 dark:border-ledger-700 dark:text-ledger-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Invoice</th>
                      <th className="px-3 py-2 font-medium">Customer</th>
                      <th className="px-3 py-2 font-medium">Service job</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Due date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                    {paginatedServiceInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="px-3 py-3">
                          <Link href={`/accounting/invoices/${invoice.id}`} className="font-medium text-emerald-800 underline dark:text-emerald-300">
                            #{String(invoice.invoice_number).padStart(4, "0")}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-ledger-700 dark:text-ledger-300">{invoice.customer_name}</td>
                        <td className="px-3 py-3 text-ledger-700 dark:text-ledger-300">{invoice.job_number}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-ledger-700 dark:text-ledger-300">{currency} {invoice.amount.toFixed(2)}</td>
                        <td className="px-3 py-3 capitalize text-ledger-700 dark:text-ledger-300">{invoice.status}</td>
                        <td className="px-3 py-3 text-ledger-700 dark:text-ledger-300">{new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredServiceInvoices.length > invoicePageSize && (
                <div className="flex items-center justify-between text-xs text-ledger-500 dark:text-ledger-400">
                  <span>Showing {(currentInvoicePage - 1) * invoicePageSize + 1}–{Math.min(currentInvoicePage * invoicePageSize, filteredServiceInvoices.length)} of {filteredServiceInvoices.length}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setInvoicePage((page) => Math.max(1, page - 1))} disabled={currentInvoicePage <= 1} className="rounded border border-ledger-300 px-2 py-1 disabled:opacity-50 dark:border-ledger-600">Previous</button>
                    <button type="button" onClick={() => setInvoicePage((page) => Math.min(invoicePageCount, page + 1))} disabled={currentInvoicePage >= invoicePageCount} className="rounded border border-ledger-300 px-2 py-1 disabled:opacity-50 dark:border-ledger-600">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {!canViewAccounting && view === "invoices" && (
        <p role="status" className="order-7 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          You do not have permission to view accounting invoices.
        </p>
      )}

      {canViewAssets && (
        <div className={view === "assets" ? "[order:27] grid gap-6 xl:grid-cols-2" : "hidden"}>
            <section id="customer-equipment" className="scroll-mt-24 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
              <h2 className="font-semibold text-ledger-900 dark:text-white">Customer equipment</h2>
              {branchScopedAssets.length === 0 ? (
                <p className="mt-3 text-sm text-ledger-500 dark:text-ledger-400">No equipment has been registered yet.</p>
              ) : (
                <ul className="mt-3 max-h-[34rem] divide-y divide-ledger-100 overflow-y-auto dark:divide-ledger-800">
                  {branchScopedAssets.map((asset) => (
                    <li key={asset.id} className="py-3 text-sm">
                      <p className="font-medium text-ledger-900 dark:text-white">{asset.label}</p>
                      <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{customerNames.get(asset.customer_id) ?? "Customer"} · {locationNames.get(asset.location_id) ?? "Branch"}</p>
                      <div className="mt-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${warrantyStatusClasses[asset.warranty_status]}`}>
                          {warrantyStatusLabels[asset.warranty_status]}
                        </span>
                      </div>
                      {(asset.warranty_provider || asset.warranty_reference || asset.warranty_end_date) && (
                        <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
                          {[asset.warranty_provider, asset.warranty_reference ? `Ref ${asset.warranty_reference}` : null, asset.warranty_end_date ? `Ends ${new Date(`${asset.warranty_end_date}T00:00:00`).toLocaleDateString()}` : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {asset.warranty_terms && <p className="mt-1 whitespace-pre-wrap text-xs text-ledger-500 dark:text-ledger-400">{asset.warranty_terms}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-ledger-900 dark:text-white">Shared CRM customers</h2>
                  <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Customer records remain managed in CRM; this view summarizes their service activity.</p>
                </div>
                <Link href="/crm" className="shrink-0 text-sm font-medium text-emerald-800 underline dark:text-emerald-300">Open CRM</Link>
              </div>
              <label className="mt-3 block">
                <span className="sr-only">Search CRM customers</span>
                <input type="search" value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setCustomerPage(1); }} placeholder="Search customer, company, email, or phone" className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800" />
              </label>
              {filteredCustomerActivity.length === 0 ? (
                <p className="mt-3 text-sm text-ledger-500 dark:text-ledger-400">{branchScopedCustomers.length === 0 ? "No CRM customers are available in this service scope." : "No customers match this search."}</p>
              ) : (
                <>
                  <ul className="mt-3 divide-y divide-ledger-100 dark:divide-ledger-800">
                    {paginatedCustomerActivity.map((customer) => (
                    <li key={customer.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <div>
                        <p className="font-medium text-ledger-900 dark:text-white">{customer.name}</p>
                        <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
                          {[customer.company, customer.email, customer.phone].filter(Boolean).join(" · ") || "No company or contact details"}
                        </p>
                      </div>
                      <p className="text-xs text-ledger-500 dark:text-ledger-400">{customer.equipmentCount} equipment · {customer.jobCount} service jobs</p>
                    </li>
                    ))}
                  </ul>
                  {filteredCustomerActivity.length > customerPageSize && (
                    <div className="mt-3 flex items-center justify-between text-xs text-ledger-500 dark:text-ledger-400">
                      <span>Page {currentCustomerPage} of {customerPageCount}</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setCustomerPage((page) => Math.max(1, page - 1))} disabled={currentCustomerPage <= 1} className="rounded border border-ledger-300 px-2 py-1 disabled:opacity-50 dark:border-ledger-600">Previous</button>
                        <button type="button" onClick={() => setCustomerPage((page) => Math.min(customerPageCount, page + 1))} disabled={currentCustomerPage >= customerPageCount} className="rounded border border-ledger-300 px-2 py-1 disabled:opacity-50 dark:border-ledger-600">Next</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
        </div>
      )}

      {canViewAssets && view === "warranty" && (
        <section id="warranty" className="order-7 space-y-5 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Warranties recorded", value: serviceWarrantyAssets.length },
              { label: "Active warranties", value: assets.filter((asset) => asset.warranty_status === "active").length },
              { label: "Expired warranties", value: assets.filter((asset) => asset.warranty_status === "expired").length },
              { label: "Repair claims", value: warrantyClaims.length },
            ].map((card) => (
              <article key={card.label} className="rounded-xl border border-ledger-200 bg-ledger-50/60 p-4 dark:border-ledger-700 dark:bg-ink-800">
                <p className="text-sm font-medium text-ledger-500 dark:text-ledger-400">{card.label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-ledger-900 dark:text-white">{card.value.toLocaleString()}</p>
              </article>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <h2 className="font-semibold text-ledger-900 dark:text-white">Equipment warranties</h2>
              {serviceWarrantyAssets.length === 0 ? (
                <p className="mt-3 text-sm text-ledger-500 dark:text-ledger-400">No equipment has warranty dates recorded.</p>
              ) : (
                <ul className="mt-3 divide-y divide-ledger-100 dark:divide-ledger-800">
                  {serviceWarrantyAssets.map((asset) => (
                    <li key={asset.id} className="py-3 text-sm">
                      <p className="font-medium text-ledger-900 dark:text-white">{asset.label}</p>
                      <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{customerNames.get(asset.customer_id) ?? "Customer"} · {locationNames.get(asset.location_id) ?? "Branch"}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${warrantyStatusClasses[asset.warranty_status]}`}>{warrantyStatusLabels[asset.warranty_status]}</span>
                      {(asset.warranty_provider || asset.warranty_reference || asset.warranty_end_date) && (
                        <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{[asset.warranty_provider, asset.warranty_reference ? `Ref ${asset.warranty_reference}` : null, asset.warranty_end_date ? `Ends ${new Date(`${asset.warranty_end_date}T00:00:00`).toLocaleDateString()}` : null].filter(Boolean).join(" · ")}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2 className="font-semibold text-ledger-900 dark:text-white">Warranty repair claims</h2>
              {warrantyClaims.length === 0 ? (
                <p className="mt-3 text-sm text-ledger-500 dark:text-ledger-400">No warranty repair claims are recorded.</p>
              ) : (
                <ul className="mt-3 divide-y divide-ledger-100 dark:divide-ledger-800">
                  {warrantyClaims.map((job) => (
                    <li key={job.id} className="py-3 text-sm">
                      <Link href={`/service-center#job-${job.id}`} className="font-medium text-emerald-800 underline dark:text-emerald-300">{job.job_number}</Link>
                      <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Claim {warrantyClaimLabels[job.warranty_claim!.status]} · original job {job.warranty_claim!.original_job_number}</p>
                      {job.warranty_claim!.decision_note && <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{job.warranty_claim!.decision_note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="border-t border-ledger-200 pt-4 dark:border-ledger-700">
            <p className="text-sm text-ledger-600 dark:text-ledger-300">Product and stock returns continue to use the existing inventory workflow.</p>
            <Link href="/inventory/return-products" className="mt-2 inline-flex text-sm font-medium text-emerald-800 underline dark:text-emerald-300">Open inventory returns</Link>
          </div>
        </section>
      )}
      {!canViewAssets && view === "warranty" && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          You do not have permission to view customer equipment or warranty records.
        </p>
      )}
    </div>
  );
}
