import { NextRequest, NextResponse } from "next/server";
import { getHardwarePrinterAdapter } from "@/lib/server/hardware/printer-adapter";
import { authorizeStaffAction } from "@/lib/server/auth/staff-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, targetPrinter, rawBytesBase64, textProjection } = body;

    if (!type || !targetPrinter || !rawBytesBase64) {
      return NextResponse.json(
        { error: "Missing required fields (type, targetPrinter, rawBytesBase64)." },
        { status: 400 }
      );
    }

    const staffAuth = await authorizeStaffAction(req, "TABLE_VIEW");
    if (!staffAuth.authorized) {
      return NextResponse.json({ error: "Unauthorized: Staff access required to print." }, { status: 403 });
    }

    const adapter = getHardwarePrinterAdapter();
    const printJob = await adapter.spoolPrintJob({
      type,
      targetPrinter,
      rawBytesBase64,
      textProjection: textProjection || ""
    });

    return NextResponse.json({ success: true, printJob });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to spool print job";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
