import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Verify your email",
	description: "Confirm your email address to activate your Vichar account.",
	robots: { index: false, follow: false },
};

export default function VerifyEmailLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-screen bg-background">
			<AuthBrandPanel variant="signup" />
			<main className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
				{children}
			</main>
		</div>
	);
}
