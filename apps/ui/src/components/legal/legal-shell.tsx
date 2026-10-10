import Link from "next/link";

import { LogoLockup } from "@/lib/icons/Logo";

export function LegalHeader() {
	return (
		<header className="fixed inset-x-0 top-0 z-50 border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/80">
			<div className="container mx-auto flex h-14 items-center justify-between px-4">
				<Link href="/" aria-label="Vichar">
					<LogoLockup className="h-6" />
				</Link>
				<Link
					href="/dashboard"
					className="text-sm font-medium text-black/70 transition-colors hover:text-black dark:text-white/70 dark:hover:text-white"
				>
					Dashboard
				</Link>
			</div>
		</header>
	);
}

export function LegalFooter() {
	return (
		<footer className="border-t border-black/10 dark:border-white/10">
			<div className="container mx-auto flex flex-col gap-2 px-4 py-8 text-sm text-black/60 dark:text-white/60 sm:flex-row sm:items-center sm:justify-between">
				<span>© 2025 Vichar</span>
				<a
					href="mailto:contact@vichar.io"
					className="transition-colors hover:text-black dark:hover:text-white"
				>
					contact@vichar.io
				</a>
			</div>
		</footer>
	);
}
