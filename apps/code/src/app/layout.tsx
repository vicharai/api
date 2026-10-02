import { Bricolage_Grotesque, Inter, Geist_Mono } from "next/font/google";

import { GoogleTag } from "@/components/google-tag";
import { Providers } from "@/components/providers";
import { getConfig } from "@/lib/config-server";
import { fetchSystemBanner } from "@/lib/system-banner";
import { getTimeZonePreference } from "@/lib/timezone-server";

import { SystemBannerBar } from "@llmgateway/shared/system-banner";

import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

const geistMono = Geist_Mono({
	variable: "--font-mono",
	subsets: ["latin"],
	display: "swap",
});

const bricolage = Bricolage_Grotesque({
	variable: "--font-bricolage",
	subsets: ["latin"],
	display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	metadataBase: new URL("https://devpass.vichar.io"),
	title: {
		default: "DevPass by Vichar - All-Access Dev Plans for AI Coding",
		template: "%s | DevPass by Vichar",
	},
	description:
		"One subscription, every coding model. Fixed-price dev plans for Claude Code, Cursor, Cline, and any OpenAI-compatible tool. 200+ models, one API key.",
	icons: {
		icon: "/favicon/favicon.ico?v=3",
		apple: "/favicon/apple-touch-icon.png?v=3",
	},
	manifest: "/favicon/site.webmanifest",
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
	openGraph: {
		title: "DevPass by Vichar - All-Access Dev Plans for AI Coding",
		description:
			"One subscription, every coding model. Fixed-price dev plans for Claude Code, Cursor, Cline, and any OpenAI-compatible tool.",
		images: ["/opengraph.png?v=2"],
		type: "website",
		url: "https://devpass.vichar.io",
		siteName: "DevPass by Vichar",
		locale: "en_US",
	},
	twitter: {
		card: "summary_large_image",
		title: "DevPass by Vichar - All-Access Dev Plans for AI Coding",
		description:
			"One subscription, every coding model. Fixed-price dev plans for Claude Code, Cursor, and 200+ models.",
		creator: "@vichar",
	},
};

const webSiteSchema = {
	"@context": "https://schema.org",
	"@type": "WebSite",
	name: "DevPass by Vichar",
	url: "https://devpass.vichar.io",
	description:
		"Fixed-price dev plans for AI-powered coding with Claude Code, Cursor, Cline, and any OpenAI-compatible tool. One subscription, every model.",
	publisher: {
		"@type": "Organization",
		name: "Vichar",
		url: "https://app.vichar.io",
	},
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
			className={`${inter.variable} ${geistMono.variable} ${bricolage.variable}`}
			suppressHydrationWarning
		>
			<head>
				<script
					type="application/ld+json"
					// eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
					dangerouslySetInnerHTML={{
						__html: JSON.stringify(webSiteSchema),
					}}
				/>
			</head>
			<body className="antialiased">
				<SystemBannerBar banner={systemBanner} />
				<GoogleTag
					googleTagId={config.googleTagId}
					googleAdsSignupConversion={config.googleAdsSignupConversion}
					googleAdsPurchaseConversion={config.googleAdsPurchaseConversion}
				/>
				<Providers config={config} timeZone={timeZone}>
					{children}
				</Providers>
			</body>
		</html>
	);
}
