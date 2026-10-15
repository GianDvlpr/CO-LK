import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function CalendarPage() {
  const user = await requirePermission("calendar.read");
  return <CalendarWorkspace permissions={user.permissions} />;
}
