import { AuthShell } from "@/components/auth/auth-shell";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Reset Password",
	description: "Set a new password for your Vichar account.",
	robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({
	children,
}: {
	children: ReactNode;
}) {
	return <AuthShell>{children}</AuthShell>;
}
