import Link from "next/link";

import { VicharMark } from "@/lib/vichar-logo";

export default function NotFound() {
	return (
		<main className="mx-auto flex max-w-[720px] flex-col items-center px-5 py-32 text-center sm:px-8">
			<VicharMark className="size-8 text-brand" />
			<h1 className="mt-6 font-display text-4xl font-semibold tracking-tight">
				Page not found
			</h1>
			<p className="mt-3 text-sm text-muted-foreground">
				The page you're looking for doesn't exist or has moved.
			</p>
			<Link
				href="/"
				className="mt-8 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
			>
				Back home
			</Link>
		</main>
	);
}
