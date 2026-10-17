import { AuthShell } from "@/components/auth/auth-shell";

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
	return <AuthShell>{children}</AuthShell>;
}
