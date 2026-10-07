import type { AppState } from "./client-types";

export async function loadState(): Promise<AppState> {
  const response = await fetch("/api/state", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Не вдалося завантажити дані");
  return data;
}

export async function action(body: Record<string, unknown>) {
  const response = await fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Не вдалося виконати дію");
  return data;
}

export async function uploadFile(file: File, requestId: string, kind: string, extra?: { stageId?: string; revisionId?: string }) {
  const body = new FormData();
  body.set("file", file); body.set("requestId", requestId); body.set("kind", kind);
  if (extra?.stageId) body.set("stageId", extra.stageId);
  if (extra?.revisionId) body.set("revisionId", extra.revisionId);
  const response = await fetch("/api/files", { method: "POST", body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Не вдалося додати файл");
  return data;
}

export async function downloadFile(id: string) {
  const response = await fetch(`/api/files/${id}/link`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Файл недоступний");
  window.location.href = data.url;
}
