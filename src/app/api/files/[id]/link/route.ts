import { NextRequest, NextResponse } from "next/server";
import { requestUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { signedDownload } from "@/lib/file-storage";
import type { Offer, Order, RequestRow, StoredFile } from "@/lib/models";
import { getRequest } from "@/lib/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });
  const { id } = await context.params;
  const file = one<StoredFile>("SELECT * FROM files WHERE id=? AND deleted_at IS NULL", id);
  if (!file) return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 });
  let req: RequestRow;
  try { req = getRequest(file.request_id, user); }
  catch { return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 }); }
  if (file.kind === "final" && req.client_id === user.id) {
    const order = one<Order>("SELECT * FROM orders WHERE request_id=?", req.id);
    const offer = order && one<Offer>("SELECT * FROM offers WHERE id=?", order.offer_id);
    const confirmed = one<{ n: number }>("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE request_id=? AND state='confirmed'", req.id)?.n || 0;
    if (!order?.final_released_at || !offer || confirmed < offer.total_cents) return NextResponse.json({ error: "Файл буде доступний після підтвердження доплати" }, { status: 403 });
  }
  return NextResponse.json({ url: signedDownload(id, user.id) }, { headers: { "Cache-Control": "no-store" } });
}
