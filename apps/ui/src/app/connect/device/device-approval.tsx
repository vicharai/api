"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAuthClient } from "@/lib/auth-client";
import { Button } from "@/lib/components/button";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { SquircleSurface } from "@/lib/components/squircle";
import { useAppConfig } from "@/lib/config";

export function DeviceApproval({ initialCode }: { initialCode: string }) {
	const auth = useAuthClient();
	const { data: session, isPending } = auth.useSession();
	const { ssoEnabled } = useAppConfig();
	const [code, setCode] = useState(initialCode.slice(0, 12));
	const [confirmed, setConfirmed] = useState(false);
	const userCode = code.replace(/[-\s]/g, "").toUpperCase();
	const returnTo = `/connect/device?user_code=${encodeURIComponent(userCode)}`;
	const decision = useMutation({
		mutationFn: async (approve: boolean) => {
			const verified = await auth.device({ query: { user_code: userCode } });
			if (verified.error) {
				throw new Error(
					verified.error.error_description ??
						"This code is invalid or expired.",
				);
			}
			const result = approve
				? await auth.device.approve({ userCode })
				: await auth.device.deny({ userCode });
			if (result.error) {
				throw new Error(
					result.error.error_description ?? "Could not complete authorization.",
				);
			}
			return approve;
		},
	});

	if (isPending) {
		return (
			<SquircleSurface className="border border-border p-6 shadow-sm sm:p-8">
				<div className="flex justify-center py-10">
					<Loader2
						className="size-5 animate-spin text-muted-foreground"
						aria-label="Checking your session"
					/>
				</div>
			</SquircleSurface>
		);
	}
	if (decision.isSuccess) {
		return (
			<SquircleSurface className="border border-border p-6 shadow-sm sm:p-8">
				<CheckCircle2 className="mb-4 size-8 text-primary" />
				<h1 className="font-display text-xl font-semibold tracking-tight">
					{decision.data ? "Device authorized" : "Request denied"}
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					You can close this tab and return to the app on your device.
				</p>
			</SquircleSurface>
		);
	}

	return (
		<SquircleSurface className="border border-border p-6 shadow-sm sm:p-8">
			<MonitorSmartphone className="mb-4 size-8 text-primary" />
			<h1 className="font-display text-xl font-semibold tracking-tight">
				Authorize your device
			</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Sign in to the Vichar app or CLI on your device.
			</p>
			<div className="mt-6 space-y-4">
				<div className="space-y-2">
					<Label htmlFor="device-code">Code from your device</Label>
					<Input
						id="device-code"
						value={code}
						maxLength={12}
						autoComplete="off"
						spellCheck={false}
						className="font-mono text-lg uppercase tracking-widest"
						disabled={decision.isPending}
						onChange={(event) => {
							setCode(event.target.value);
							setConfirmed(false);
							decision.reset();
						}}
					/>
				</div>
				{session?.user ? (
					<>
						<p className="text-sm">
							Signed in as <strong>{session.user.email}</strong>.
						</p>
						<p className="text-sm text-muted-foreground">
							The app on your device can access your account, workspaces,
							projects, API keys, conversations, skills, and usage with your
							existing permissions. You can sign out in the app at any time.
						</p>
						<label className="flex items-start gap-2 text-sm">
							<input
								type="checkbox"
								checked={confirmed}
								disabled={decision.isPending}
								className="mt-1"
								onChange={(event) => setConfirmed(event.target.checked)}
							/>
							The code above matches the code on my device.
						</label>
					</>
				) : (
					<p className="text-sm text-muted-foreground">
						Sign in to review and approve this request.
					</p>
				)}
				<p className="text-xs text-muted-foreground">
					Only approve a request you started on your own device. Do not approve
					a code sent by someone else.
				</p>
				{decision.error && (
					<p role="alert" className="text-sm text-destructive">
						{decision.error.message}
					</p>
				)}
			</div>
			<div className="mt-6 flex flex-col gap-2">
				{session?.user ? (
					<>
						<Button
							className="w-full"
							disabled={
								!confirmed || userCode.length !== 8 || decision.isPending
							}
							onClick={() => decision.mutate(true)}
						>
							{decision.isPending && (
								<Loader2 className="mr-2 size-4 animate-spin" />
							)}
							Authorize device
						</Button>
						<Button
							variant="outline"
							className="w-full"
							disabled={userCode.length !== 8 || decision.isPending}
							onClick={() => decision.mutate(false)}
						>
							Deny
						</Button>
					</>
				) : (
					<>
						<Button asChild className="w-full">
							<Link href={`/login?redirect=${encodeURIComponent(returnTo)}`}>
								Sign in
							</Link>
						</Button>
						{ssoEnabled && (
							<Button asChild variant="outline" className="w-full">
								<Link href={`/sso?redirect=${encodeURIComponent(returnTo)}`}>
									Sign in with SSO
								</Link>
							</Button>
						)}
					</>
				)}
			</div>
		</SquircleSurface>
	);
}
