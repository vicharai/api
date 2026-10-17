import Link from "next/link";

import { LogoLockup } from "@/lib/icons/Logo";

export function LegalHeader() {
	return (
		<header className="fixed inset-x-0 top-0 z-50 border-b border-divider bg-background">
			<div className="container mx-auto flex h-14 items-center justify-between px-4">
				<Link href="/" aria-label="Vichar">
					<LogoLockup className="h-6" />
				</Link>
				<Link
					href="/dashboard"
					className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-brand transition-colors hover:bg-brand-soft"
				>
					Dashboard
				</Link>
			</div>
		</header>
	);
}

export function LegalFooter() {
	return (
		<footer className="border-t border-divider">
			<div className="container mx-auto flex flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
				<span>© 2025 Vichar</span>
				<a
					href="mailto:contact@vichar.io"
					className="transition-colors hover:text-foreground"
				>
					contact@vichar.io
				</a>
			</div>
		</footer>
	);
}
