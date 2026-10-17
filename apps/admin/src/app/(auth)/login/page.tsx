import { ServerCrash } from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/server-api";

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@llmgateway/shared/components";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
	const session = await getSession();
	const user = session.status === "ok" ? session.user : null;
	if (user?.isAdmin) {
		redirect("/");
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40 px-4">
			{session.status === "unreachable" ? (
				<Alert variant="destructive" className="w-full max-w-sm">
					<ServerCrash className="size-4" />
					<AlertTitle>API unreachable</AlertTitle>
					<AlertDescription>
						Signing in will fail until the API is back.
					</AlertDescription>
				</Alert>
			) : null}
			<LoginForm signedInAs={user?.email ?? null} />
		</main>
	);
}
