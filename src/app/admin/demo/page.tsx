import { currentUser, isStaff } from "@/lib/auth";
import { StaffLogin } from "@/components/StaffLogin";
import { CabinetNav } from "@/components/CabinetNav";
import { DemoClient } from "@/components/DemoClient";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const user = await currentUser();
  if (!isStaff(user)) return <StaffLogin />;
  return <><CabinetNav name={user.name} role={user.role} /><DemoClient /></>;
}
