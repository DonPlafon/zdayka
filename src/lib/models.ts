export type Role = "client" | "manager" | "owner";
export type User = { id: string; name: string; username: string | null; role: Role; bot_started: number };
export type RequestRow = {
  id: string; client_id: string; description: string; work_type: string | null; subject: string | null;
  topic: string | null; volume: string | null; deadline: string | null; urgent: number;
  status: string; source: string | null; created_at: string; updated_at: string; closed_at: string | null;
};
export type Offer = {
  id: string; request_id: string; version: number; scope: string; total_cents: number; deposit_cents: number;
  due_at: string; revisions_text: string; stages_json: string; expires_at: string; accepted_at: string | null;
  created_at: string;
};
export type Order = {
  id: string; request_id: string; offer_id: string; status: string;
  final_ready_at: string | null; final_released_at: string | null; closed_at: string | null; cost_cents?: number;
};
export type Stage = { id: string; order_id: string; position: number; title: string; result_description: string; amount_cents: number; due_at: string; delivery_note: string | null; delivered_at: string | null };
export type Payment = { id: string; request_id: string; order_id: string | null; kind: string; amount_cents: number; state: string; reported_at: string; confirmed_at: string | null };
export type StoredFile = { id: string; request_id: string; stage_id: string | null; revision_id: string | null; kind: string; original_name: string; mime: string; size_bytes: number; created_at: string; deleted_at: string | null };
export type Revision = { id: string; order_id: string; client_id: string; description: string; status: string; free_requested: number; decision_note: string | null; created_at: string };
export type EventRow = { id: string; request_id: string; actor_id: string | null; type: string; message: string; created_at: string };
