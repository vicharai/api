import { AuthShell } from "@/components/auth/auth-shell";

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
	return <AuthShell>{children}</AuthShell>;
}
