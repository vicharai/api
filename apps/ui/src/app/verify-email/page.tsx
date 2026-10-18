"use client";

import { CircleCheck, LinkIcon, MailCheck, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { AuthHeader, authLinkClass } from "@/components/auth/auth-shell";
import { useSessionStatus } from "@/hooks/useUser";
import { useAuth } from "@/lib/auth-client";
import { getAuthRedirect } from "@/lib/auth-redirect";
import { Button } from "@/lib/components/button";
import { getMailProvider } from "@/lib/mail-provider";

import type { Route } from "next";

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyEmailContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const email = searchParams.get("email")?.trim() ?? "";
	const next = getAuthRedirect(searchParams.get("next") ?? "/onboarding");
	const linkError = searchParams.get("error");
	const { session, isLoading: sessionLoading } = useSessionStatus();
	const { sendVerificationEmail } = useAuth();

	const [cooldown, setCooldown] = useState(
		searchParams.get("sent") === "1" ? RESEND_COOLDOWN_SECONDS : 0,
	);
	const [resendStatus, setResendStatus] = useState<{
		kind: "sent" | "error";
		message: string;
	} | null>(null);
	const [resending, setResending] = useState(false);

	useEffect(() => {
		if (cooldown <= 0) {
			return;
		}
		const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
		return () => clearInterval(timer);
	}, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

	const mailProvider = useMemo(() => getMailProvider(email), [email]);

	const verified = session?.user?.emailVerified === true;
	const expired = !verified && Boolean(linkError);
	const pending = !verified && !expired && Boolean(email);

	// Auto-forward once verified.
	useEffect(() => {
		if (!verified) {
			return;
		}
		const timeout = setTimeout(() => router.replace(next as Route), 1200);
		return () => clearTimeout(timeout);
	}, [verified, next, router]);

	const resend = async () => {
		if (!email || resending || cooldown > 0) {
			return;
		}
		setResending(true);
		setResendStatus(null);
		const { error } = await sendVerificationEmail({
			email,
			callbackURL: new URL(
				`/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`,
				window.location.origin,
			).toString(),
		});
		setResending(false);
		if (error) {
			setResendStatus({
				kind: "error",
				message: error.message ?? "Could not send the verification email.",
			});
			return;
		}
		setCooldown(RESEND_COOLDOWN_SECONDS);
		setResendStatus({
			kind: "sent",
			message: "Sent. It can take a minute to arrive.",
		});
	};

	const resendButton =
		pending || expired ? (
			<Button
				variant="outline"
				className="w-full"
				disabled={resending || cooldown > 0}
				onClick={() => void resend()}
			>
				{cooldown > 0 ? (
					`Resend in ${cooldown}s`
				) : resending ? (
					<>
						<RotateCw className="mr-2 h-4 w-4 animate-spin" />
						Sending…
					</>
				) : expired ? (
					"Send a new link"
				) : (
					"Resend email"
				)}
			</Button>
		) : null;

	const statusMessage = resendStatus && (
		<p
			className={
				resendStatus.kind === "sent"
					? "text-xs text-muted-foreground"
					: "text-xs text-destructive"
			}
			aria-live="polite"
		>
			{resendStatus.message}
		</p>
	);

	const openMailButton = mailProvider && (
		<Button className="w-full" asChild>
			<a href={mailProvider.url} target="_blank" rel="noopener noreferrer">
				<MailCheck className="mr-2 h-4 w-4" />
				Open {mailProvider.name}
			</a>
		</Button>
	);

	return (
		<div className="w-full animate-in fade-in-0 duration-300">
			{verified ? (
				<>
					<AuthHeader
						icon={<CircleCheck />}
						tone="success"
						title="Email verified"
						description={
							<span aria-live="polite">
								You&apos;re all set. Taking you to your dashboard…
							</span>
						}
					/>
					<Button
						className="mt-8 w-full"
						onClick={() => router.replace(next as Route)}
					>
						Continue
					</Button>
				</>
			) : expired ? (
				<>
					<AuthHeader
						icon={<LinkIcon />}
						tone="destructive"
						title="This link has expired"
						description={
							<>
								Verification links are single-use and expire for your security.
								{email
									? " Send a fresh one below."
									: " Sign in and we'll send you a new verification link."}
							</>
						}
					/>
					<div className="mt-8 space-y-3">
						{openMailButton}
						{email ? (
							resendButton
						) : (
							<Button className="w-full" asChild>
								<Link href="/login">Sign in to get a new link</Link>
							</Button>
						)}
						{statusMessage}
					</div>
					<VerifyFooter email={email} next={next} />
				</>
			) : pending ? (
				<>
					<AuthHeader
						icon={<MailCheck />}
						tone={sessionLoading ? "neutral" : "brand"}
						title="Check your inbox"
						description={
							<>
								We sent a verification link to{" "}
								<span className="font-medium text-foreground">{email}</span>.
								Click it to activate your account.
							</>
						}
					/>
					<div className="mt-8 space-y-3">
						{openMailButton}
						{resendButton}
						{statusMessage}
					</div>
					<VerifyFooter email={email} next={next} />
				</>
			) : (
				<>
					<AuthHeader
						icon={<MailCheck />}
						tone={sessionLoading ? "neutral" : "brand"}
						title="Verify your email"
						description="Sign in and we'll send you a new verification link."
					/>
					<Button className="mt-8 w-full" asChild>
						<Link href="/login">Sign in</Link>
					</Button>
					<VerifyFooter email={email} next={next} />
				</>
			)}
		</div>
	);
}

function VerifyFooter({ email, next }: { email: string; next: string }) {
	return (
		<div className="mt-8 space-y-3 border-t border-divider pt-6 text-sm text-muted-foreground">
			<p>Can&apos;t find it? Check spam or promotions.</p>
			<div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
				<p>
					{email ? (
						<>
							Wrong email?{" "}
							<Link href="/signup" className={authLinkClass}>
								Start over
							</Link>
						</>
					) : (
						<>
							No account yet?{" "}
							<Link href="/signup" className={authLinkClass}>
								Sign up
							</Link>
						</>
					)}
				</p>
				<p>
					Already verified?{" "}
					<Link
						href={
							(next === "/dashboard"
								? "/login"
								: `/login?redirect=${encodeURIComponent(next)}`) as Route
						}
						className={authLinkClass}
					>
						Sign in
					</Link>
				</p>
			</div>
		</div>
	);
}

export default function VerifyEmailPage() {
	return (
		<Suspense>
			<VerifyEmailContent />
		</Suspense>
	);
}
