import { NextRequest, NextResponse } from "next/server";
import { safeOrigin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!safeOrigin(request)) return NextResponse.json({ error: "Origin rejected" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("zdayka_session");
  return response;
}
