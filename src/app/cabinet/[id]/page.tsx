import { currentUser } from "@/lib/auth";
import { LoginGate } from "@/components/LoginGate";
import { CabinetNav } from "@/components/CabinetNav";
import { OrderDetailClient } from "@/components/OrderDetailClient";

export const dynamic = "force-dynamic";
export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return <LoginGate />;
  const { id } = await params;
  return <><CabinetNav name={user.name} role={user.role} /><OrderDetailClient id={id} /></>;
}
