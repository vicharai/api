import { Google_Sans, Google_Sans_Code } from "next/font/google";

import { JsonLd } from "@/components/json-ld";
import { MotionProvider } from "@/components/motion";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/lib/site";

import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const googleSans = Google_Sans({
	variable: "--font-google-sans",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	display: "swap",
});

const googleSansCode = Google_Sans_Code({
	variable: "--font-google-sans-code",
	subsets: ["latin"],
	weight: ["400", "500"],
	display: "swap",
});

export const metadata: Metadata = {
	metadataBase: new URL(site.domain),
	title: {
		default: "Vichar - One API for every AI model | LLM API gateway",
		template: "%s | Vichar",
	},
	description: site.description,
	applicationName: "Vichar",
	keywords: [
		"LLM API",
		"AI API",
		"LLM gateway",
		"OpenAI-compatible API",
		"unified AI API",
		"model router",
		"AI model pricing",
		"LLM failover",
		"Claude API",
		"GPT API",
		"Gemini API",
		"DeepSeek API",
	],
	alternates: { canonical: "/" },
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	category: "technology",
	authors: [{ name: "Vichar" }],
	creator: "Vichar",
	publisher: "Vichar",
	icons: {
		icon: [
			{ url: "/favicon/favicon.ico?v=3", sizes: "any" },
			{
				url: "/favicon/favicon-16x16.png?v=3",
				sizes: "16x16",
				type: "image/png",
			},
			{
				url: "/favicon/favicon-32x32.png?v=3",
				sizes: "32x32",
				type: "image/png",
			},
		],
		apple: [{ url: "/favicon/apple-touch-icon.png?v=3", sizes: "180x180" }],
	},
	manifest: "/favicon/site.webmanifest?v=3",
	openGraph: {
		type: "website",
		siteName: "Vichar",
		locale: "en_US",
		url: "/",
		title: "Vichar - One API for every AI model",
		description: site.description,
		images: [
			{
				url: "/opengraph.png",
				width: 1200,
				height: 630,
				alt: "Vichar - One API for every model",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Vichar - One API for every AI model",
		description: site.description,
		images: ["/opengraph.png"],
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#131314" },
	],
};

const ORG_LD = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Organization",
			"@id": `${site.domain}/#org`,
			name: "Vichar",
			url: site.domain,
			logo: `${site.domain}/favicon/android-chrome-512x512.png`,
			email: site.emails.support,
			contactPoint: [
				{
					"@type": "ContactPoint",
					contactType: "customer support",
					email: site.emails.support,
				},
				{
					"@type": "ContactPoint",
					contactType: "sales",
					email: site.emails.sales,
				},
			],
		},
		{
			"@type": "WebSite",
			"@id": `${site.domain}/#website`,
			url: site.domain,
			name: "Vichar",
			description: site.description,
			publisher: { "@id": `${site.domain}/#org` },
			inLanguage: "en",
		},
	],
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${googleSans.variable} ${googleSansCode.variable}`}
		>
			<head>
				{/* must run pre-hydration to avoid a theme flash */}
				<script
					// eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
					dangerouslySetInnerHTML={{
						__html: `try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.classList.add("js")}catch(e){}`,
					}}
				/>
			</head>
			<body className="font-sans">
				<a
					href="#main"
					className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
				>
					Skip to content
				</a>
				<JsonLd data={ORG_LD} />
				<MotionProvider>
					<SiteHeader />
					<div id="main">{children}</div>
					<SiteFooter />
				</MotionProvider>
			</body>
		</html>
	);
}
