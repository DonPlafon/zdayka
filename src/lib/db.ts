import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

let instance: Database.Database | undefined;

export function db() {
  if (instance) return instance;
  const filename = process.env.DB_PATH || join(process.cwd(), ".data", "zdayka.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  instance = new Database(filename);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT, role TEXT NOT NULL DEFAULT 'client',
      bot_started INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY, description TEXT NOT NULL, work_type TEXT, subject TEXT,
      source TEXT, expires_at TEXT NOT NULL, claimed_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES users(id), description TEXT NOT NULL,
      work_type TEXT, subject TEXT, topic TEXT, volume TEXT, deadline TEXT, urgent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'received', source TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS requests_client_idx ON requests(client_id, created_at);
    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), version INTEGER NOT NULL,
      scope TEXT NOT NULL, total_cents INTEGER NOT NULL, deposit_cents INTEGER NOT NULL,
      due_at TEXT NOT NULL, revisions_text TEXT NOT NULL, stages_json TEXT NOT NULL,
      expires_at TEXT NOT NULL, accepted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(request_id, version)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES requests(id),
      offer_id TEXT NOT NULL REFERENCES offers(id), status TEXT NOT NULL DEFAULT 'awaiting_payment',
      final_ready_at TEXT, final_released_at TEXT, closed_at TEXT, cost_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS stages (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), position INTEGER NOT NULL,
      title TEXT NOT NULL, result_description TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      due_at TEXT NOT NULL, delivery_note TEXT, delivered_at TEXT,
      UNIQUE(order_id, position)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id),
      order_id TEXT REFERENCES orders(id), kind TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'reported', reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      confirmed_at TEXT, confirmed_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id),
      stage_id TEXT REFERENCES stages(id), revision_id TEXT, kind TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, mime TEXT NOT NULL,
      size_bytes INTEGER NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT, delete_notice_at TEXT
    );
    CREATE INDEX IF NOT EXISTS files_request_idx ON files(request_id, kind);
    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), client_id TEXT NOT NULL REFERENCES users(id),
      description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', free_requested INTEGER NOT NULL DEFAULT 0,
      decision_note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, handled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), actor_id TEXT REFERENCES users(id),
      type TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES users(id), request_id TEXT REFERENCES requests(id),
      type TEXT NOT NULL, text TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
      due_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(request_id, type, due_at)
    );
    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL REFERENCES requests(id),
      purpose TEXT NOT NULL, granted INTEGER NOT NULL DEFAULT 0, changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(client_id, request_id, purpose)
    );
    CREATE TABLE IF NOT EXISTS analytics (
      id TEXT PRIMARY KEY, client_id TEXT REFERENCES users(id), request_id TEXT REFERENCES requests(id),
      type TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL
    );
  `);
  const draftColumns = instance.prepare("PRAGMA table_info(drafts)").all() as { name: string }[];
  if (!draftColumns.some(column => column.name === "claimed_by")) instance.exec("ALTER TABLE drafts ADD COLUMN claimed_by TEXT");
  const orderColumns = instance.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
  if (!orderColumns.some(column => column.name === "cost_cents")) instance.exec("ALTER TABLE orders ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0");
  return instance;
}

export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function many<T>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: unknown[]) {
  return db().prepare(sql).run(...params);
}

export function withinLimit(key: string, max: number, seconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const row = one<{ count: number; window_start: number }>("SELECT count, window_start FROM rate_limits WHERE key = ?", key);
  if (!row || now - row.window_start >= seconds) {
    run("INSERT INTO rate_limits(key,count,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,window_start=excluded.window_start", key, now);
    return true;
  }
  if (row.count >= max) return false;
  run("UPDATE rate_limits SET count=count+1 WHERE key=?", key);
  return true;
}
