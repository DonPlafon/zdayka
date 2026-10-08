import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { attachSession, upsertTelegramUser } from "@/lib/auth";

export const runtime = "nodejs";

const jwks = createRemoteJWKSet(new URL("https://oauth.telegram.org/.well-known/jwks.json"));

function tokenErrorCode(error: unknown) {
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === "aud") return "audience";
    if (error.claim === "iss") return "issuer";
    return "claims";
  }
  if (error instanceof errors.JWTExpired) return "expired";
  if (error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid) return "key";
  if (error instanceof errors.JWSSignatureVerificationFailed) return "signature";
  return "token";
}

export async function GET(request: NextRequest) {
  const origin = process.env.APP_ORIGIN || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const raw = request.cookies.get("tg_oauth")?.value;
  const clientId = process.env.TELEGRAM_CLIENT_ID;
  const clientSecret = process.env.TELEGRAM_CLIENT_SECRET;
  if (!code || !state || !raw || !clientId || !clientSecret) {
    const reason = request.nextUrl.searchParams.has("error") ? "telegram" : "session";
    return NextResponse.redirect(new URL(`/setup?error=${reason}`, origin));
  }
  let step = "state";
  try {
    const saved = JSON.parse(raw) as { state: string; verifier: string; next: string };
    if (saved.state !== state || !saved.verifier) throw new Error("Invalid state");
    step = "exchange";
    const redirectUri = `${origin}/api/auth/telegram/callback`;
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: saved.verifier });
    const exchange = await fetch("https://oauth.telegram.org/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
      body, cache: "no-store"
    });
    if (!exchange.ok) throw new Error("Token exchange failed");
    const tokens = await exchange.json() as { id_token?: string };
    if (!tokens.id_token) throw new Error("Missing ID token");
    let payload;
    try {
      ({ payload } = await jwtVerify(tokens.id_token, jwks, { issuer: "https://oauth.telegram.org", audience: clientId }));
    } catch (error) {
      step = tokenErrorCode(error);
      throw error;
    }
    step = "identity";
    const id = payload.id;
    if (typeof id !== "number" || !Number.isSafeInteger(id)) throw new Error("Missing Telegram ID");
    step = "account";
    upsertTelegramUser(String(id), String(payload.name || payload.given_name || "Клієнт"), typeof payload.preferred_username === "string" ? payload.preferred_username : null);
    const next = ["/admin", "/cabinet/new"].includes(saved.next) ? saved.next : "/cabinet";
    const response = NextResponse.redirect(new URL(next, origin));
    response.cookies.delete("tg_oauth");
    return attachSession(response, String(id));
  } catch {
    const response = NextResponse.redirect(new URL(`/setup?error=${step}`, origin));
    response.cookies.delete("tg_oauth");
    return response;
  }
}
