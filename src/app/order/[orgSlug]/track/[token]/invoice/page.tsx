import { trackOrder } from "@/app/order/[orgSlug]/track/[token]/actions";
import { notFound } from "next/navigation";
import { InvoicePrintButton } from "@/components/customer-portal/invoice-print-button";

export default async function CustomerInvoicePage({ params }: { params: Promise<{ orgSlug: string; token: string }> }) {
  const { token } = await params;
  const order = await trackOrder(token);
  if (!order || !order.allowInvoiceDownload || order.status !== "completed") notFound();
  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-slate-900 print:max-w-none">
      <div className="flex items-start justify-between border-b pb-6">
        <div><h1 className="text-2xl font-bold">Invoice</h1><p className="mt-1 text-sm text-slate-500">Order {order.orderNumber}</p></div>
        <InvoicePrintButton />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6 text-sm"><div><p className="font-semibold">Customer</p><p>{order.guestName}</p><p>{order.guestPhone}</p></div><div><p className="font-semibold">Delivery</p><p>{order.deliveryAddress}</p></div></div>
      <table className="mt-8 w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Item</th><th className="py-2">Qty</th><th className="py-2 text-right">Amount</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.productName} className="border-b"><td className="py-3">{item.productName}</td><td className="py-3">{item.quantity}</td><td className="py-3 text-right">{order.currency} {item.lineTotal.toFixed(2)}</td></tr>)}</tbody></table>
      <p className="mt-6 text-right text-lg font-bold">Total: {order.currency} {order.total.toFixed(2)}</p>
    </main>
  );
}
