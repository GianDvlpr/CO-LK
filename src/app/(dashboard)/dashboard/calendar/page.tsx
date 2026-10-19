import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function CalendarPage() {
  const user = await requirePagePermission("calendar.read");
  return <CalendarWorkspace permissions={user.permissions} />;
}
