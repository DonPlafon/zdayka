import { NextRequest, NextResponse } from "next/server";
import { requestUser } from "@/lib/auth";
import { stateFor } from "@/lib/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: "Потрібен вхід через Telegram" }, { status: 401 });
  return NextResponse.json(stateFor(user), { headers: { "Cache-Control": "no-store" } });
}
