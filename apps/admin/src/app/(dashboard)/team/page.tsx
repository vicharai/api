import { notFound } from "next/navigation";

import { TeamPage } from "@/components/team/team-page";
import { getUserMe } from "@/lib/server-api";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };

export default async function Page() {
	const user = await getUserMe();
	if (user?.adminRole !== "admin") {
		notFound();
	}
	return <TeamPage />;
}
