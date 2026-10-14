import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Sign Up",
	description:
		"Create your free Vichar account. Get instant access to leading AI models from OpenAI, Anthropic, DeepSeek and more through one API key.",
	robots: { index: false, follow: false },
};

export default function SignupLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-screen bg-background">
			<AuthBrandPanel variant="signup" />
			<main className="flex w-full flex-col justify-start bg-background px-6 pt-16 pb-10 sm:justify-center sm:px-12 sm:py-10 lg:w-1/2 lg:px-16 xl:px-24">
				{children}
			</main>
		</div>
	);
}
