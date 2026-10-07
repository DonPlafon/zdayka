import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const clientId = process.env.TELEGRAM_CLIENT_ID;
  if (!clientId || !process.env.TELEGRAM_CLIENT_SECRET) return NextResponse.redirect(new URL("/setup?missing=telegram", request.url));
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(24).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const origin = process.env.APP_ORIGIN || request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/telegram/callback`;
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next = requestedNext === "/admin" || requestedNext === "/cabinet/new" ? requestedNext : "/cabinet";
  const auth = new URL("https://oauth.telegram.org/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid profile telegram:bot_access");
  auth.searchParams.set("state", state);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  const response = NextResponse.redirect(auth);
  response.cookies.set("tg_oauth", JSON.stringify({ state, verifier, next }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600
  });
  return response;
}
