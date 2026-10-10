import Link from "next/link";

import { NotFoundPage } from "@llmgateway/shared/not-found";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Page Not Found",
};

const linkClass =
	"inline-flex min-h-11 items-center text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-current focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

export default function NotFound() {
	return (
		<NotFoundPage>
			<nav aria-label="Suggested pages">
				<ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
					<li>
						<Link href="/" className={linkClass}>
							Homepage
						</Link>
					</li>
					<li>
						<Link href="/dashboard" className={linkClass}>
							Dashboard
						</Link>
					</li>
					<li>
						<Link href="/legal" className={linkClass}>
							Legal
						</Link>
					</li>
				</ul>
			</nav>
		</NotFoundPage>
	);
}
