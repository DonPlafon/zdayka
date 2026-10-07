import type { EventRow, Offer, Order, Payment, RequestRow, Revision, Stage, StoredFile, User } from "./models";

export type Snapshot = RequestRow & {
  offers: Offer[]; order: Order | null; stages: Stage[]; payments: Payment[];
  files: StoredFile[]; revisions: Revision[]; events: EventRow[]; caseConsent: boolean;
  client?: { id: string; name: string; username: string | null; bot_started: number };
};

export type AppState = {
  user: User;
  requests: Snapshot[];
  stats: { confirmedOrders: number; confirmedRevenueCents: number; costCents: number; requests: number } | null;
  setup: { telegram: boolean; notifications: boolean; managerUsername: string | null; botUsername: string | null; paymentInstructions: string | null };
};
