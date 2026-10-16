import MobileScannerClient from "./scanner-client";

export const metadata = {
  title: "Phone Barcode Scanner · SalesMate ERP",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function MobileScanPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return <MobileScannerClient token={token} />;
}
