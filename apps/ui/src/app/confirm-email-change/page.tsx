"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, MailCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthHeader } from "@/components/auth/auth-shell";
import { Button } from "@/lib/components/button";
import { useApi } from "@/lib/fetch-client";

export default function ConfirmEmailChangePage() {
	const api = useApi();
	const queryClient = useQueryClient();
	const [token, setToken] = useState<string | null>(null);
	const mutation = api.useMutation("post", "/user/email/confirm", {
		onSuccess: () => queryClient.clear(),
	});

	useEffect(() => {
		const fragment = window.location.hash.slice(1);
		setToken((current) => current ?? fragment);
		window.history.replaceState(null, "", window.location.pathname);
	}, []);

	const validToken = token !== null && /^[a-f0-9]{64}$/.test(token);

	return (
		<div className="w-full">
			<AuthHeader
				icon={mutation.isSuccess ? <CircleCheck /> : <MailCheck />}
				tone={mutation.isSuccess ? "success" : "brand"}
				title={mutation.isSuccess ? "Email updated" : "Confirm your new email"}
				description={
					mutation.isSuccess
						? "Sign in with your new email address and existing password."
						: "Confirm to use this address for sign-in and password recovery. You will be signed out on all devices."
				}
			/>
			<div className="mt-8 space-y-4">
				{mutation.isSuccess ? (
					<Button asChild className="w-full">
						<Link href="/login">Sign in</Link>
					</Button>
				) : (
					<>
						{token !== null && !validToken && (
							<p role="alert" className="text-sm text-destructive">
								This link is invalid. Request a new email change from your
								account settings.
							</p>
						)}
						{mutation.isError && (
							<p role="alert" className="text-sm text-destructive">
								This change could not be confirmed. The link may have expired or
								the address may already be in use. Request a new link from your
								account settings.
							</p>
						)}
						<Button
							className="w-full"
							disabled={!validToken || mutation.isPending}
							onClick={() => {
								if (token) {
									mutation.mutate({ body: { token } });
								}
							}}
						>
							{mutation.isPending ? "Confirming…" : "Confirm email change"}
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
