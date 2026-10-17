import { Suspense } from "react";

import { UsersSearch } from "@/components/users/users-search";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
	return (
		<Suspense>
			<UsersSearch />
		</Suspense>
	);
}
