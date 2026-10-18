"use client";

import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useAuthClient } from "@/lib/auth-client";
import { useFetchClient } from "@/lib/fetch-client";

import {
	Alert,
	AlertDescription,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Input,
	Label,
} from "@llmgateway/shared/components";

export function LoginForm({ signedInAs }: { signedInAs: string | null }) {
	const authClient = useAuthClient();
	const fetchClient = useFetchClient();
	const queryClient = useQueryClient();
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState<"email" | "passkey" | null>(null);
	const [error, setError] = useState<string | null>(
		signedInAs
			? `${signedInAs} is signed in but has no admin access. Sign in with an admin account.`
			: null,
	);

	async function finishSignIn() {
		const { data } = await fetchClient.GET("/user/me");
		if (!data?.user?.isAdmin) {
			await authClient.signOut();
			setError(
				"This account is not authorized for the admin panel. Admin access needs a verified email and an admin role.",
			);
			setPending(null);
			return;
		}
		queryClient.clear();
		router.replace("/");
		router.refresh();
	}

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setPending("email");
		const { error: signInError } = await authClient.signIn.email({
			email,
			password,
		});
		if (signInError) {
			setError(signInError.message ?? "Sign in failed");
			setPending(null);
			return;
		}
		await finishSignIn();
	}

	async function onPasskey() {
		setError(null);
		setPending("passkey");
		const res = await authClient.signIn.passkey();
		if (res?.error) {
			setError(res.error.message ?? "Passkey sign in failed");
			setPending(null);
			return;
		}
		await finishSignIn();
	}

	return (
		<Card className="w-full max-w-sm">
			<CardHeader className="space-y-2 text-center">
				<div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
					<ShieldCheck className="size-5" />
				</div>
				<CardTitle className="text-xl">Vichar Admin</CardTitle>
				<CardDescription>Sign in with your staff account.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{error ? (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}
				<form className="space-y-3" onSubmit={onSubmit}>
					<div className="space-y-1.5">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							autoComplete="username webauthn"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							autoComplete="current-password"
							required
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</div>
					<Button type="submit" className="w-full" disabled={!!pending}>
						{pending === "email" ? <Loader2 className="animate-spin" /> : null}
						Sign in
					</Button>
				</form>
				<Button
					type="button"
					variant="outline"
					className="w-full"
					disabled={!!pending}
					onClick={onPasskey}
				>
					{pending === "passkey" ? (
						<Loader2 className="animate-spin" />
					) : (
						<KeyRound />
					)}
					Sign in with passkey
				</Button>
			</CardContent>
		</Card>
	);
}
