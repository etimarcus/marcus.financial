import { NextRequest, NextResponse } from "next/server";
import { runAllScheduledScanners } from "@/lib/scheduled-scan";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runAllScheduledScanners();
  const anyFailure = results.some((r) => !r.ok);
  return NextResponse.json(
    { ok: !anyFailure, results },
    { status: anyFailure ? 500 : 200 }
  );
}
