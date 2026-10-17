import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getUserMe } from "@/lib/server-api";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
	const user = await getUserMe();
	if (user?.isAdmin) {
		redirect("/");
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
			<LoginForm signedInAs={user?.email ?? null} />
		</main>
	);
}
