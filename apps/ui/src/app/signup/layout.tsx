import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { AuthShell } from "@/components/auth/auth-shell";

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
		<AuthShell aside={<AuthBrandPanel variant="signup" />}>
			{children}
		</AuthShell>
	);
}
