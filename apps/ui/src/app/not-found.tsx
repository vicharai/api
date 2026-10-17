import { Compass } from "lucide-react";
import Link from "next/link";

import {
	AuthHeader,
	AuthShell,
	authLinkClass,
} from "@/components/auth/auth-shell";
import { Button } from "@/lib/components/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Page Not Found",
};

export default function NotFound() {
	return (
		<AuthShell>
			<AuthHeader
				icon={<Compass />}
				title="Page not found"
				description="The page you're looking for doesn't exist or has moved."
			/>
			<Button asChild className="mt-8 w-full">
				<Link href="/dashboard">Go to dashboard</Link>
			</Button>
			<nav aria-label="Suggested pages" className="mt-6">
				<ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
					<li>
						<Link href="/" className={authLinkClass}>
							Homepage
						</Link>
					</li>
					<li>
						<Link href="/legal" className={authLinkClass}>
							Legal
						</Link>
					</li>
				</ul>
			</nav>
		</AuthShell>
	);
}
