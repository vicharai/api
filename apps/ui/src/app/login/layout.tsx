import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { AuthShell } from "@/components/auth/auth-shell";

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
		<AuthShell aside={<AuthBrandPanel variant="login" />}>{children}</AuthShell>
	);
}
