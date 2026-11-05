"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createServiceAsset,
  createServiceAppointment,
  createServiceCustomerContact,
  createServiceJobInvoice,
  createServiceJob,
  recordServiceJobHandover,
  decideServiceJobWarrantyClaim,
  transitionServiceQuotation,
  registerServiceTechnician,
  transitionServiceAppointment,
  transitionServiceJob,
} from "@/app/(dashboard)/service-center/actions";
import { ServiceQuotationForm } from "@/components/service-center/service-quotation-form";
import { ServiceCustomerUpdate } from "@/components/service-center/service-customer-update";
import { ServiceAppointmentReminder } from "@/components/service-center/service-appointment-reminder";
import { ServiceQuotationDelivery } from "@/components/service-center/service-quotation-delivery";
import type { InvoiceStatus, ServiceAppointmentStatus, ServiceJobPriority, ServiceJobStatus, ServiceQuotationStatus, ServiceWarrantyClaimStatus } from "@/types/database";

type ServiceJobRow = {
  id: string;
  job_number: string;
  location_id: string;
  customer_id: string;
  asset_id: string | null;
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
type TechnicianCandidate = { userId: string; name: string };
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
  locations,
  assets,
  technicians,
  technicianCandidates,
  appointments,
  canCreate,
  canEdit,
  canViewAssets,
  canViewTechnicians,
  canCreateAsset,
  canCreateTechnician,
  canViewAppointments,
  canCreateAppointment,
  canEditAppointments,
  currency,
}: {
  jobs: ServiceJobRow[];
  partsPanel: ReactNode;
  quotations: QuotationRow[];
  contactLogs: ContactLogRow[];
  customers: SelectOption[];
  locations: SelectOption[];
  assets: AssetOption[];
  technicians: TechnicianOption[];
  technicianCandidates: TechnicianCandidate[];
  appointments: AppointmentRow[];
  canCreate: boolean;
  canEdit: boolean;
  canViewAssets: boolean;
  canViewTechnicians: boolean;
  canCreateAsset: boolean;
  canCreateTechnician: boolean;
  canViewAppointments: boolean;
  canCreateAppointment: boolean;
  canEditAppointments: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appointmentLocationId, setAppointmentLocationId] = useState("");
  const [appointmentCustomerId, setAppointmentCustomerId] = useState("");

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
  const activeJobs = jobs.filter((job) => !["closed", "cancelled"].includes(job.status)).length;
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
  const estimateJobs = jobs.filter((job) =>
    (job.status === "inspection" || job.status === "awaiting_quotation")
    && (!job.warranty_claim || job.warranty_claim.status === "not_covered"),
  );
  const warrantySourceJobs = jobs.filter((job) => job.status === "closed" && job.asset_id);
  const warrantyClaimLabels: Record<ServiceWarrantyClaimStatus, string> = {
    pending: "Pending staff review",
    covered: "Covered · no customer charge",
    not_covered: "Not covered",
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Think Service &amp; Repairs</p>
          <h1 className="mt-1 text-2xl font-semibold text-ledger-900 dark:text-white">Service jobs</h1>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Track customer repairs and move each job through its service workflow.</p>
        </div>
        <div className="rounded-xl border border-ledger-200 bg-white px-4 py-3 text-sm dark:border-ledger-700 dark:bg-ink-900">
          <span className="text-ledger-500 dark:text-ledger-400">Open jobs</span>
          <span className="ml-3 font-semibold text-ledger-900 dark:text-white">{activeJobs}</span>
        </div>
        <Link href="/service-center/reports" className="rounded-lg border border-ledger-200 bg-white px-4 py-3 text-sm font-medium text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200 dark:hover:bg-ink-800">
          Service reports
        </Link>
      </header>

      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>
          {error ?? notice}
        </p>
      )}

      {canCreateAppointment && (
        <form onSubmit={submitAppointment} className="grid gap-4 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900 md:grid-cols-2 xl:grid-cols-3">
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
        <section className="overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900">
          <div className="border-b border-ledger-200 px-5 py-4 dark:border-ledger-700">
            <h2 className="font-semibold text-ledger-900 dark:text-white">Service appointments</h2>
          </div>
          {appointments.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ledger-500 dark:text-ledger-400">No appointments are scheduled.</p>
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
                  {appointments.map((appointment) => {
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
        </section>
      )}

      {canCreate && (
        <form onSubmit={submitCreate} className="grid gap-4 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="font-semibold text-ledger-900 dark:text-white">Receive a service job</h2>
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
      )}

      <section className="overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900">
        <div className="border-b border-ledger-200 px-5 py-4 dark:border-ledger-700">
          <h2 className="font-semibold text-ledger-900 dark:text-white">Recent jobs</h2>
        </div>
        {jobs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ledger-500 dark:text-ledger-400">No service jobs have been received yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-ledger-50 text-xs uppercase text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Job</th>
                  <th className="px-5 py-3 font-medium">Customer / branch</th>
                  <th className="px-5 py-3 font-medium">Problem</th>
                  <th className="px-5 py-3 font-medium">Priority</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                {jobs.map((job) => {
                  const asset = job.asset_id ? assetById.get(job.asset_id) : undefined;
                  const availableStatuses = job.warranty_claim?.status === "covered"
                    ? nextStatuses[job.status].filter((status) => status !== "awaiting_payment")
                    : nextStatuses[job.status];
                  return (
                  <tr key={job.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-medium text-ledger-900 dark:text-white">{job.job_number}</p>
                      <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{new Date(job.created_at).toLocaleDateString()}</p>
                      <p className="mt-2 text-xs text-ledger-600 dark:text-ledger-300">Received condition: {job.condition_on_arrival}</p>
                      <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
                        Intake confirmed by {job.intake_confirmed_by} · {job.intake_confirmed_as === "customer" ? "Customer" : "Authorized representative"}
                      </p>
                      <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{new Date(job.intake_confirmed_at).toLocaleString()}</p>
                      {job.accessories.length > 0 && (
                        <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Accessories: {job.accessories.join(", ")}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-ledger-900 dark:text-white">{customerNames.get(job.customer_id) ?? "Customer"}</p>
                      <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{locationNames.get(job.location_id) ?? "Branch"}</p>
                      {asset && (
                        <div className="mt-1 space-y-1">
                          <p className="text-xs text-ledger-500 dark:text-ledger-400">Equipment: {asset.label}</p>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${warrantyStatusClasses[asset.warranty_status]}`}>
                            {warrantyStatusLabels[asset.warranty_status]}
                          </span>
                          {asset.warranty_end_date && (
                            <p className="text-xs text-ledger-500 dark:text-ledger-400">
                              Coverage through {new Date(`${asset.warranty_end_date}T00:00:00`).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      )}
                      {job.technician_id && technicianById.has(job.technician_id) && (
                        <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Technician: {technicianById.get(job.technician_id)?.name}</p>
                      )}
                    </td>
                    <td className="max-w-sm whitespace-pre-wrap px-5 py-4 text-ledger-700 dark:text-ledger-300">{job.reported_problem}</td>
                    <td className="px-5 py-4 text-ledger-700 dark:text-ledger-300">{priorityLabels[job.priority]}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-ledger-800 dark:text-ledger-200">{statusLabels[job.status]}</p>
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
                        <Link href="/accounting/invoices" className="mt-2 block text-xs font-medium text-amber-700 hover:underline dark:text-amber-300">
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
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(canCreateAsset || canCreateTechnician) && (
        <div className="grid gap-6 xl:grid-cols-2">
          {canCreateAsset && (
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
          )}

          {canCreateTechnician && (
            <form
              onSubmit={(event) => void submitRecord(event, registerServiceTechnician, "Technician registered for the selected branch.")}
              className="space-y-4 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900"
            >
              <div>
                <h2 className="font-semibold text-ledger-900 dark:text-white">Register a technician</h2>
                <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Only active organization members assigned to the branch can be registered.</p>
              </div>
              <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                <span>Branch</span>
                <select name="technicianLocationId" required disabled={isPending || !locations.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
                  <option value="">Select a branch</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                <span>Organization member</span>
                <select name="technicianUserId" required disabled={isPending || !technicianCandidates.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
                  <option value="">Select a member</option>
                  {technicianCandidates.map((candidate) => <option key={candidate.userId} value={candidate.userId}>{candidate.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
                <span>Skills (comma separated)</span>
                <input name="technicianSkills" maxLength={1600} disabled={isPending} placeholder="Diagnostics, electrical repair" className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
              </label>
              <button type="submit" disabled={isPending || !locations.length || !technicianCandidates.length} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                Register technician
              </button>
            </form>
          )}
        </div>
      )}

      {partsPanel}

      <section className="space-y-4 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
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
              <select name="contactJobId" required disabled={isPending || !jobs.length} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-900">
                <option value="">Select a repair job</option>
                {jobs.map((job) => <option key={job.id} value={job.id}>{job.job_number} · {customerNames.get(job.customer_id) ?? "Customer"}</option>)}
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
              <button type="submit" disabled={isPending || !jobs.length} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {isPending ? "Saving..." : "Add to contact history"}
              </button>
            </div>
          </form>
        )}
        {contactLogs.length === 0 ? (
          <p className="rounded-lg bg-ledger-50 px-4 py-6 text-center text-sm text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">No customer contact has been logged for repair jobs.</p>
        ) : (
          <ul className="divide-y divide-ledger-100 dark:divide-ledger-800">
            {contactLogs.map((contact) => (
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

      <section className="space-y-4 rounded-xl border border-ledger-200 bg-ledger-50/60 p-5 dark:border-ledger-700 dark:bg-ink-950/40">
        <div>
          <h2 className="font-semibold text-ledger-900 dark:text-white">Repair estimates and customer decisions</h2>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Each estimate is versioned and its sent/decision actions are recorded in the job history.</p>
        </div>
        {canEdit && <ServiceQuotationForm jobs={estimateJobs} currency={currency} />}
        {quotations.length === 0 ? (
          <p className="rounded-lg bg-white px-4 py-8 text-center text-sm text-ledger-500 dark:bg-ink-900 dark:text-ledger-400">No estimates have been prepared yet.</p>
        ) : (
          <div className="space-y-3">
            {quotations.map((quotation) => (
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
      </section>

      {(canViewAssets || canViewTechnicians) && (
        <div className="grid gap-6 xl:grid-cols-2">
          {canViewAssets && (
            <section className="rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
              <h2 className="font-semibold text-ledger-900 dark:text-white">Customer equipment</h2>
              {assets.length === 0 ? (
                <p className="mt-3 text-sm text-ledger-500 dark:text-ledger-400">No equipment has been registered yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-ledger-100 dark:divide-ledger-800">
                  {assets.slice(0, 8).map((asset) => (
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
          )}
          {canViewTechnicians && (
            <section className="rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
              <h2 className="font-semibold text-ledger-900 dark:text-white">Service technicians</h2>
              {technicians.length === 0 ? (
                <p className="mt-3 text-sm text-ledger-500 dark:text-ledger-400">No technicians have been registered yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-ledger-100 dark:divide-ledger-800">
                  {technicians.map((technician) => (
                    <li key={technician.id} className="py-3 text-sm">
                      <p className="font-medium text-ledger-900 dark:text-white">{technician.name}</p>
                      <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{locationNames.get(technician.locationId) ?? "Branch"}{technician.skills.length ? ` · ${technician.skills.join(", ")}` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
