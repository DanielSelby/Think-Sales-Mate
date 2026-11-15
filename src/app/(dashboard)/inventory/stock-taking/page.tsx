import StockAdjustmentPage from "../adjustments/page";

export const metadata = {
  title: "Stock Taking & Adjustment · Think Digital Solutions",
};

export default function StockTakingPage() {
  return <StockAdjustmentPage searchParams={Promise.resolve({ mode: "stock_taking" })} />;
}
