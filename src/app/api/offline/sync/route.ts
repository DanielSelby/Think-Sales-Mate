import { NextResponse } from "next/server";
import { recordSale } from "@/app/(dashboard)/sales/actions";

export async function POST(request: Request) {
  const operation = await request.json() as { type?: string; payload?: unknown };
  if (operation.type !== "sale" || !operation.payload || typeof operation.payload !== "object") {
    return NextResponse.json({ ok: false, error: "Unsupported offline operation." }, { status: 400 });
  }

  const result = await recordSale(operation.payload as Parameters<typeof recordSale>[0]);
  if (result.error) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
