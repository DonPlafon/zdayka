import { currentUser, isStaff } from "@/lib/auth";
import { LoginGate } from "@/components/LoginGate";
import { CabinetNav } from "@/components/CabinetNav";
import { AdminClient } from "@/components/AdminClient";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const user = await currentUser();
  if (!user) return <LoginGate next="/admin" />;
  if (!isStaff(user)) return <main className="shell legal-page"><h1>Доступу немає</h1><p>Ця сторінка доступна лише команді.</p></main>;
  return <><CabinetNav name={user.name} role={user.role} /><AdminClient /></>;
}
