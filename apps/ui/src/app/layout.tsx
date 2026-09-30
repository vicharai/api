import { Inter, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";

import { Providers } from "@/components/providers";
import { getConfig } from "@/lib/config-server";
import { fetchSystemBanner } from "@/lib/system-banner";
import { getTimeZonePreference } from "@/lib/timezone-server";

import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

const geistMono = Geist_Mono({
	// globals.css maps the Tailwind token: --font-mono: var(--font-geist-mono).
	// Registering the font under --font-mono directly would leave that theme
	// mapping dangling and every `font-mono` element falls back to sans.
	variable: "--font-geist-mono",
	subsets: ["latin"],
	display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
	variable: "--font-display",
	subsets: ["latin"],
	weight: ["500", "600", "700", "800"],
	display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	metadataBase: new URL("https://app.vichar.io"),
	title: {
		default: "Vichar - Unified API for Multiple LLM Providers",
		template: "%s | Vichar",
	},
	description:
		"Route, manage, and analyze LLM requests across multiple providers through one unified, OpenAI-compatible API.",
	authors: [{ name: "Vichar" }],
	creator: "Vichar",
	publisher: "Vichar",
	icons: {
		icon: [
			{ url: "/favicon/favicon.ico?v=2", sizes: "any" },
			{
				url: "/favicon/favicon-16x16.png?v=2",
				sizes: "16x16",
				type: "image/png",
			},
			{
				url: "/favicon/favicon-32x32.png?v=2",
				sizes: "32x32",
				type: "image/png",
			},
		],
		apple: [{ url: "/favicon/apple-touch-icon.png?v=2", sizes: "180x180" }],
	},
	manifest: "/favicon/site.webmanifest?v=2",
	alternates: {
		canonical: "./",
	},
	openGraph: {
		title: "Vichar - Unified API for Multiple LLM Providers",
		description:
			"Route, manage, and analyze LLM requests across multiple providers through one unified, OpenAI-compatible API.",
		images: ["/opengraph.png?v=2"],
		type: "website",
		url: "https://app.vichar.io",
		siteName: "Vichar",
		locale: "en_US",
	},
	twitter: {
		card: "summary_large_image",
		title: "Vichar - Unified API for Multiple LLM Providers",
		description:
			"Route, manage, and analyze LLM requests across multiple providers through one unified API.",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
};

const organizationSchema = {
	"@context": "https://schema.org",
	"@type": "Organization",
	"@id": "https://app.vichar.io/#organization",
	name: "Vichar",
	url: "https://app.vichar.io",
	logo: {
		"@type": "ImageObject",
		url: "https://app.vichar.io/favicon/android-chrome-512x512.png",
		width: 512,
		height: 512,
	},
	description:
		"Route, manage, and analyze your LLM requests across multiple providers with a unified API interface.",
};

const websiteSchema = {
	"@context": "https://schema.org",
	"@type": "WebSite",
	"@id": "https://app.vichar.io/#website",
	publisher: { "@id": "https://app.vichar.io/#organization" },
	name: "Vichar",
	alternateName: ["Vichar", "vichar.io"],
	url: "https://app.vichar.io",
};

export default async function RootLayout({
	children,
}: {
	children: ReactNode;
}) {
	const config = getConfig();
	const [timeZone, systemBanner] = await Promise.all([
		getTimeZonePreference(),
		fetchSystemBanner(),
	]);

	return (
		<html
			lang="en"
			className={`${inter.variable} ${geistMono.variable} ${plusJakarta.variable}`}
			suppressHydrationWarning
		>
			<head>
				<link
					rel="service-desc"
					type="application/vnd.oai.openapi+json"
					href="/openapi.json"
				/>
				<link rel="service-doc" href="/developers" />
				<link rel="preconnect" href="https://api.vichar.io" />
				<script
					type="application/ld+json"
					// eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
					dangerouslySetInnerHTML={{
						__html: JSON.stringify(organizationSchema),
					}}
				/>
				<script
					type="application/ld+json"
					// eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
					dangerouslySetInnerHTML={{
						__html: JSON.stringify(websiteSchema),
					}}
				/>
			</head>
			<body className="min-h-screen antialiased">
				<Providers
					config={config}
					timeZone={timeZone}
					systemBanner={systemBanner}
				>
					{children}
				</Providers>
			</body>
		</html>
	);
}
