import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Forgot Password",
	description:
		"Reset your Vichar password. We'll email you a secure link to set a new one.",
	robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-screen bg-background">
			<AuthBrandPanel variant="login" />
			<div className="flex w-full flex-col justify-start bg-background px-6 pt-16 pb-10 sm:justify-center sm:px-12 sm:py-10 lg:w-1/2 lg:px-16 xl:px-24">
				{children}
			</div>
		</div>
	);
}
