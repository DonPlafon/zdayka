import { promises as fs } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { requestUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { privatePath, verifyDownload } from "@/lib/file-storage";
import type { Offer, Order, RequestRow, StoredFile } from "@/lib/models";
import { getRequest } from "@/lib/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });
  const { id } = await context.params;
  const expires = Number(request.nextUrl.searchParams.get("expires"));
  const signature = request.nextUrl.searchParams.get("signature") || "";
  if (!verifyDownload(id, user.id, expires, signature)) return NextResponse.json({ error: "Посилання недійсне" }, { status: 403 });
  const file = one<StoredFile & { storage_key: string }>("SELECT * FROM files WHERE id=? AND deleted_at IS NULL", id);
  if (!file) return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 });
  let req: RequestRow;
  try { req = getRequest(file.request_id, user); }
  catch { return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 }); }
  if (file.kind === "final" && req.client_id === user.id) {
    const order = one<Order>("SELECT * FROM orders WHERE request_id=?", req.id);
    const offer = order && one<Offer>("SELECT * FROM offers WHERE id=?", order.offer_id);
    const confirmed = one<{ n: number }>("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE request_id=? AND state='confirmed'", req.id)?.n || 0;
    if (!order?.final_released_at || !offer || confirmed < offer.total_cents) return NextResponse.json({ error: "Файл ще недоступний" }, { status: 403 });
  }
  try {
    const bytes = await fs.readFile(privatePath(file.storage_key));
    const name = encodeURIComponent(file.original_name);
    return new NextResponse(bytes, { headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    } });
  } catch { return NextResponse.json({ error: "Файл недоступний" }, { status: 404 }); }
}
