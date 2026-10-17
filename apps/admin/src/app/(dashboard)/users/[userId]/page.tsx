import { UserDetail } from "@/components/users/user-detail";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "User" };

export default async function UserPage({
	params,
}: {
	params: Promise<{ userId: string }>;
}) {
	const { userId } = await params;
	return <UserDetail userId={userId} />;
}
