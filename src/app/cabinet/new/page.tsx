import { currentUser } from "@/lib/auth";
import { LoginGate } from "@/components/LoginGate";
import { CabinetNav } from "@/components/CabinetNav";
import { NewRequestForm } from "@/components/NewRequestForm";

export const dynamic = "force-dynamic";
export default async function NewRequestPage() {
  const user = await currentUser();
  if (!user) return <LoginGate next="/cabinet/new" />;
  return <><CabinetNav name={user.name} role={user.role} /><main className="shell form-page"><NewRequestForm /></main></>;
}
