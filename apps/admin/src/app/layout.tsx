import { Providers } from "@/components/providers";
import { getConfig } from "@/lib/config-server";

import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: {
		default: "Vichar Admin",
		template: "%s | Vichar Admin",
	},
	robots: { index: false, follow: false },
	icons: {
		icon: [
			{ url: "/favicon/favicon.ico", sizes: "any" },
			{ url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
		],
		apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
	},
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className="min-h-screen font-sans antialiased">
				<Providers config={getConfig()}>{children}</Providers>
			</body>
		</html>
	);
}
