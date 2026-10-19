import { AuthShell } from "@/components/auth/auth-shell";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Connect CLI",
	description: "Authorize a coding CLI to access your Vichar account.",
	robots: { index: false, follow: false },
};

export default function ConnectCliLayout({
	children,
}: {
	children: ReactNode;
}) {
	return <AuthShell>{children}</AuthShell>;
}
