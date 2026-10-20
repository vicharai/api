"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AuthHeader, authLinkClass } from "@/components/auth/auth-shell";
import { useAuth } from "@/lib/auth-client";
import { Button } from "@/lib/components/button";
import { useApi } from "@/lib/fetch-client";

const CONTACT_URL = "https://vichar.io/contact";

function errorMessage(error: unknown): string | null {
	return typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
		? error.message
		: null;
}

export default function AccountBlockedPage() {
	const api = useApi();
	const { signOut } = useAuth();
	const [signingOut, setSigningOut] = useState(false);
	// The API answers 403 with the block reason while the account is blocked.
	const me = api.useQuery("get", "/user/me", {}, { retry: 0 });

	if (me.isLoading) {
		return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
	}

	if (me.data) {
		return (
			<AuthHeader
				icon={<ShieldCheck />}
				tone="success"
				title="Your account is active"
				description={
					<Link href="/dashboard" className={authLinkClass}>
						Go to your dashboard
					</Link>
				}
			/>
		);
	}

	const message = errorMessage(me.error);
	if (message === "Unauthorized") {
		return (
			<AuthHeader
				title="You're signed out"
				description={
					<Link href="/login" className={authLinkClass}>
						Sign in
					</Link>
				}
			/>
		);
	}

	const signOutAndLeave = async () => {
		setSigningOut(true);
		await signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = "/login";
				},
			},
		});
		setSigningOut(false);
	};

	return (
		<div>
			<AuthHeader
				icon={<ShieldAlert />}
				tone="destructive"
				title="Your account has been blocked"
				description={
					message ??
					"Your account has been deactivated. Please contact support."
				}
			/>
			<p className="mt-6 text-sm text-muted-foreground">
				Think this is a mistake?{" "}
				<a href={CONTACT_URL} className={authLinkClass}>
					Contact us
				</a>{" "}
				and include the email address you signed in with.
			</p>
			<div className="mt-8 flex justify-end">
				<Button
					variant="outline"
					onClick={() => void signOutAndLeave()}
					disabled={signingOut}
				>
					Sign out
				</Button>
			</div>
		</div>
	);
}
