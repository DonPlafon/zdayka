import { NextRequest, NextResponse } from "next/server";
import { attachSession } from "@/lib/auth";
import { run } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const host = request.nextUrl.hostname;
  if (process.env.NODE_ENV === "production" || process.env.DEV_TEST_LOGIN !== "1" || !["localhost", "127.0.0.1"].includes(host)) {
    return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  }
  const role = request.nextUrl.searchParams.get("role") === "owner" ? "owner" : request.nextUrl.searchParams.get("role") === "manager" ? "manager" : "client";
  const id = role === "owner" ? "dev-owner" : role === "manager" ? "dev-manager" : "dev-client";
  run("INSERT INTO users(id,name,role) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET role=excluded.role", id, role === "owner" ? "Власниця · демо" : role === "manager" ? "Менеджер · демо" : "Клієнт · демо", role);
  return attachSession(NextResponse.redirect(new URL(role === "client" ? "/cabinet" : "/admin", request.url)), id);
}
