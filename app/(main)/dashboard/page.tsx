import { redirect } from "next/navigation";

// The planner now lives on "/", which serves signed-in users directly.
// Kept so existing links and bookmarks keep working.
export default function DashboardPage() {
  redirect("/");
}
