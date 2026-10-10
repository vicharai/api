import { notFound } from "next/navigation";

import { getUserMe } from "@/lib/server-api";

import type { ReactNode } from "react";

function isAdminEmail(email: string | null | undefined): boolean {
	const adminEmails = (process.env.ADMIN_EMAILS ?? "")
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);
	return Boolean(email) && adminEmails.includes(email!.toLowerCase());
}

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	const userData = await getUserMe();
	const user = userData?.user;

	if (!user?.email || !isAdminEmail(user.email)) {
		notFound();
	}

	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-2xl font-semibold">Vichar Admin</h1>
				<nav className="flex gap-4 text-sm">
					<a href="/admin/organizations" className="hover:underline">
						Organizations
					</a>
					<a href="/admin/users" className="hover:underline">
						Users
					</a>
					<a
						href="/dashboard"
						className="text-muted-foreground hover:underline"
					>
						Back to dashboard
					</a>
				</nav>
			</div>
			{children}
		</div>
	);
}
