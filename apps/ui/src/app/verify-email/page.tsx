"use client";

import { CircleCheck, LinkIcon, MailCheck, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { useSessionStatus } from "@/hooks/useUser";
import { useAuth } from "@/lib/auth-client";
import { getAuthRedirect } from "@/lib/auth-redirect";
import { Button } from "@/lib/components/button";
import { VicharMark } from "@/lib/icons/vichar-logo";
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

	const iconTile = (icon: React.ReactNode) => (
		<div className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-muted/40">
			{icon}
		</div>
	);

	return (
		<div className="mx-auto w-full max-w-[360px] animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
			{/* Mobile brand header */}
			<div className="mb-6 flex items-center gap-2.5 lg:hidden">
				<VicharMark className="size-7 text-brand" />
				<span className="text-base font-medium tracking-tight">Vichar</span>
			</div>

			{verified ? (
				<>
					{iconTile(<CircleCheck className="size-5 text-success" />)}
					<h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
						Email verified
					</h1>
					<p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
						You&apos;re all set. Taking you to your dashboard…
					</p>
					<Button
						className="mt-8 w-full"
						onClick={() => router.replace(next as Route)}
					>
						Continue
					</Button>
				</>
			) : expired ? (
				<>
					{iconTile(<LinkIcon className="size-5 text-destructive" />)}
					<h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
						This link has expired
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Verification links are single-use and expire for your security.
						{email
							? " Send a fresh one below."
							: " Sign in and we'll send you a new verification link."}
					</p>
					<div className="mt-8 space-y-3">
						{mailProvider && (
							<Button className="w-full" asChild>
								<a
									href={mailProvider.url}
									target="_blank"
									rel="noopener noreferrer"
								>
									<MailCheck className="mr-2 h-4 w-4" />
									Open {mailProvider.name}
								</a>
							</Button>
						)}
						{email ? (
							resendButton
						) : (
							<Button className="w-full" asChild>
								<Link href="/login">Sign in to get a new link</Link>
							</Button>
						)}
						{resendStatus && (
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
						)}
					</div>
					<VerifyFooter email={email} next={next} />
				</>
			) : (
				<>
					{iconTile(
						sessionLoading ? (
							<MailCheck className="size-5 text-muted-foreground" />
						) : (
							<MailCheck className="size-5" />
						),
					)}
					{pending ? (
						<>
							<h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
								Check your inbox
							</h1>
							<p className="mt-2 text-sm text-muted-foreground">
								We sent a verification link to{" "}
								<span className="font-medium text-foreground">{email}</span>.
								Click it to activate your account.
							</p>
							<div className="mt-8 space-y-3">
								{mailProvider && (
									<Button className="w-full" asChild>
										<a
											href={mailProvider.url}
											target="_blank"
											rel="noopener noreferrer"
										>
											<MailCheck className="mr-2 h-4 w-4" />
											Open {mailProvider.name}
										</a>
									</Button>
								)}
								{resendButton}
								{resendStatus && (
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
								)}
							</div>
						</>
					) : (
						<>
							<h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
								Verify your email
							</h1>
							<p className="mt-2 text-sm text-muted-foreground">
								Sign in and we&apos;ll send you a new verification link.
							</p>
							<Button className="mt-8 w-full" asChild>
								<Link href="/login">Sign in</Link>
							</Button>
						</>
					)}
					<VerifyFooter email={email} next={next} />
				</>
			)}
		</div>
	);
}

function VerifyFooter({ email, next }: { email: string; next: string }) {
	return (
		<div className="mt-8 space-y-3 border-t border-border pt-6 text-sm text-muted-foreground">
			<p>Can&apos;t find it? Check spam or promotions.</p>
			<div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
				<p>
					{email ? (
						<>
							Wrong email?{" "}
							<Link
								href="/signup"
								className="text-foreground underline underline-offset-4"
							>
								Start over
							</Link>
						</>
					) : (
						<>
							No account yet?{" "}
							<Link
								href="/signup"
								className="text-foreground underline underline-offset-4"
							>
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
						className="text-foreground underline underline-offset-4"
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
