import Link from "next/link";

import { VicharMark } from "@/lib/vichar-logo";

export default function NotFound() {
	return (
		<main className="mx-auto flex max-w-[720px] flex-col items-center px-5 py-32 text-center sm:px-8">
			<VicharMark className="rise size-10 text-brand" />
			<p className="rise mt-8 font-mono text-sm text-muted-foreground">404</p>
			<h1 className="rise mt-2 text-[34px] font-semibold tracking-tight">
				Page not found
			</h1>
			<p className="rise mt-3 text-[15px] text-body">
				The page you're looking for doesn't exist or has moved.
			</p>
			<div className="rise mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3">
				<Link
					href="/"
					className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-brand-strong"
				>
					Back home
				</Link>
				<Link
					href="/models/"
					className="inline-flex h-11 items-center text-[15px] font-medium text-brand hover:underline"
				>
					Browse models →
				</Link>
			</div>
		</main>
	);
}
