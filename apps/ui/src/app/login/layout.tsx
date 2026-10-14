import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Log In",
	description:
		"Log in to your Vichar account to manage API keys, monitor usage, and access leading AI models through one unified API.",
	robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-screen bg-background">
			<AuthBrandPanel variant="login" />
			<main className="flex w-full flex-col justify-start bg-background px-6 pt-16 pb-10 sm:justify-center sm:px-12 sm:py-10 lg:w-1/2 lg:px-16 xl:px-24">
				{children}
			</main>
		</div>
	);
}
