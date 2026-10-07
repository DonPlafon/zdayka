import { currentUser } from "@/lib/auth";
import { LoginGate } from "@/components/LoginGate";
import { CabinetNav } from "@/components/CabinetNav";
import { CabinetClient } from "@/components/CabinetClient";

export const dynamic = "force-dynamic";
export default async function CabinetPage() {
  const user = await currentUser();
  if (!user) return <LoginGate />;
  return <><CabinetNav name={user.name} role={user.role} /><CabinetClient /></>;
}
