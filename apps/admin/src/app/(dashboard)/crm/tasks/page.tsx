import { TasksPage } from "@/components/crm/tasks-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "CRM tasks" };

export default function Page() {
	return <TasksPage />;
}
