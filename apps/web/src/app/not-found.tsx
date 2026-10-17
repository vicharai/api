import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { VicharMark } from "@/lib/vichar-logo";

export default function NotFound() {
	return (
		<main className="relative -mt-16 overflow-hidden pt-16">
			<div
				aria-hidden="true"
				className="hero-aurora pointer-events-none absolute inset-0"
			/>
			<div className="relative mx-auto flex max-w-[720px] flex-col items-center px-5 py-32 text-center sm:px-8">
				<span className="rise flex size-14 items-center justify-center rounded-2xl bg-brand-gradient shadow-float">
					<VicharMark className="size-7 text-white" />
				</span>
				<p className="rise mt-8 font-mono text-sm font-semibold text-brand">
					404
				</p>
				<h1 className="rise mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
					Page not found
				</h1>
				<p className="rise mt-4 text-muted-foreground">
					The page you're looking for doesn't exist or has moved.
				</p>
				<div className="rise mt-9 flex flex-wrap justify-center gap-3">
					<Link
						href="/"
						className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-strong"
					>
						<ArrowLeft className="size-4" />
						Back home
					</Link>
					<Link
						href="/models/"
						className="inline-flex h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-semibold transition-colors hover:bg-accent"
					>
						Browse models
					</Link>
				</div>
			</div>
		</main>
	);
}
