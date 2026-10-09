import { currentUser, isStaff } from "@/lib/auth";
import { CabinetNav } from "@/components/CabinetNav";
import { AdminClient } from "@/components/AdminClient";
import { StaffLogin } from "@/components/StaffLogin";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const user = await currentUser();
  if (!isStaff(user)) return <StaffLogin />;
  return <><CabinetNav name={user.name} role={user.role} /><AdminClient /></>;
}
