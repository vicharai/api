import { VicharMark } from "@/lib/icons/vichar-logo";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

/** Four-colour mark plus the "Vichar" wordmark, as on the auth card. */
export function AuthLogo({ className }: { className?: string }) {
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<VicharMark className="size-9 text-brand" />
			<span className="text-[20px] font-medium leading-none text-muted-foreground">
				Vichar
			</span>
		</div>
	);
}

/**
 * Google-account-style card centred on the canvas, shared by every signed-out
 * page. `aside` turns it into the wide two-column card used by login/signup.
 */
export function AuthShell({
	aside,
	width = "default",
	children,
}: {
	aside?: ReactNode;
	width?: "default" | "wide";
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-start bg-background px-4 py-10 sm:justify-center sm:bg-app-canvas sm:px-6">
			<div
				className={cn(
					"w-full rounded-[28px] bg-background sm:border sm:border-border sm:bg-card sm:p-10",
					width === "wide" ? "max-w-[720px]" : "max-w-[448px]",
					aside && "lg:grid lg:max-w-[1040px] lg:grid-cols-2 lg:gap-12 lg:p-12",
				)}
			>
				{aside}
				<main
					className={cn(
						"flex w-full min-w-0 flex-col justify-start",
						aside && "lg:pt-2",
					)}
				>
					<AuthLogo className={cn("mb-6", aside && "lg:hidden")} />
					{children}
				</main>
			</div>
		</div>
	);
}

const TONES = {
	brand: "bg-google-blue-soft text-google-blue",
	success: "bg-success-soft text-success",
	warning: "bg-warning-soft text-warning",
	destructive: "bg-destructive-soft text-destructive",
	neutral: "bg-muted text-muted-foreground",
} as const;

export type AuthTone = keyof typeof TONES;

/** Round tinted icon badge used above status headings. */
export function AuthStatusIcon({
	tone = "brand",
	className,
	children,
}: {
	tone?: AuthTone;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex size-12 shrink-0 items-center justify-center rounded-full [&_svg]:size-6",
				TONES[tone],
				className,
			)}
		>
			{children}
		</div>
	);
}

/** Heading block for an auth card: optional status icon, title and supporting copy. */
export function AuthHeader({
	icon,
	tone,
	title,
	description,
	className,
}: {
	icon?: ReactNode;
	tone?: AuthTone;
	title: ReactNode;
	description?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col", className)}>
			{icon && (
				<AuthStatusIcon tone={tone} className="mb-5">
					{icon}
				</AuthStatusIcon>
			)}
			<h1 className="text-[28px] font-normal leading-9 text-heading">
				{title}
			</h1>
			{description && (
				<p className="mt-2 text-sm text-muted-foreground">{description}</p>
			)}
		</div>
	);
}

/** Brand-coloured text link used for secondary auth actions. */
export const authLinkClass =
	"font-medium text-brand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none";

/**
 * Standalone status card (no canvas or logo) for empty, error and access
 * states rendered inside the dashboard chrome.
 */
export function StatusCard({
	icon,
	tone,
	title,
	description,
	children,
}: {
	icon: ReactNode;
	tone?: AuthTone;
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex min-h-[70svh] w-full flex-1 items-center justify-center px-4 py-10">
			<div className="w-full max-w-[448px] rounded-[28px] border border-border bg-card p-8 sm:p-10">
				<AuthHeader
					icon={icon}
					tone={tone}
					title={title}
					description={description}
				/>
				{children && <div className="mt-8">{children}</div>}
			</div>
		</div>
	);
}
