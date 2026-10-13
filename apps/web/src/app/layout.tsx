import { Inter, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/lib/site";

import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
	display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
	variable: "--font-plus-jakarta",
	subsets: ["latin"],
	weight: ["500", "600", "700", "800"],
	display: "swap",
});

export const metadata: Metadata = {
	metadataBase: new URL(site.domain),
	title: {
		default: "Vichar - One API for every model",
		template: "%s | Vichar",
	},
	description: site.description,
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
		title: "Vichar - One API for every model",
		description: site.description,
		images: [{ url: "/opengraph.png", width: 1200, height: 630 }],
	},
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${inter.variable} ${geistMono.variable} ${plusJakarta.variable}`}
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
				<SiteHeader />
				{children}
				<SiteFooter />
			</body>
		</html>
	);
}
