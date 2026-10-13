"use client";

import { Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { site } from "@/lib/site";
import { VicharMark } from "@/lib/vichar-logo";

const NAV_LINKS = [
	{ label: "Models", href: "/models/" },
	{ label: "Pricing", href: "/pricing/" },
	{ label: "Docs", href: site.urls.docs, external: true },
	{ label: "About", href: "/about/" },
];

function ThemeToggle() {
	const [dark, setDark] = useState(false);
	useEffect(() => {
		setDark(document.documentElement.classList.contains("dark"));
	}, []);
	return (
		<button
			type="button"
			aria-label="Toggle dark mode"
			onClick={() => {
				const next = !dark;
				setDark(next);
				document.documentElement.classList.toggle("dark", next);
				try {
					localStorage.setItem("theme", next ? "dark" : "light");
				} catch {
					// private mode
				}
			}}
			className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
		</button>
	);
}

export function SiteHeader() {
	const [open, setOpen] = useState(false);
	return (
		<header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-sm">
			<div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-5 sm:px-8">
				<Link
					href="/"
					className="flex items-center gap-2 font-medium tracking-tight"
					aria-label="Vichar home"
				>
					<VicharMark className="size-5 text-brand" />
					<span>Vichar</span>
				</Link>
				<nav
					className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
					aria-label="Main"
				>
					{NAV_LINKS.map((l) =>
						l.external ? (
							<a
								key={l.label}
								href={l.href}
								className="transition-colors hover:text-foreground"
							>
								{l.label}
							</a>
						) : (
							<Link
								key={l.label}
								href={l.href}
								className="transition-colors hover:text-foreground"
							>
								{l.label}
							</Link>
						),
					)}
				</nav>
				<div className="ml-auto flex items-center gap-2 sm:gap-3">
					<ThemeToggle />
					<a
						href={site.urls.login}
						className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
					>
						Sign in
					</a>
					<a
						href={site.urls.signup}
						className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
					>
						Get API key
					</a>
					<button
						type="button"
						className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent md:hidden"
						aria-label={open ? "Close menu" : "Open menu"}
						aria-expanded={open}
						onClick={() => setOpen((v) => !v)}
					>
						{open ? <X className="size-4" /> : <Menu className="size-4" />}
					</button>
				</div>
			</div>
			{open && (
				<nav
					className="border-t border-border/60 bg-background px-5 py-4 md:hidden"
					aria-label="Mobile"
				>
					<ul className="flex flex-col gap-1 text-sm">
						{NAV_LINKS.map((l) => (
							<li key={l.label}>
								{l.external ? (
									<a
										href={l.href}
										className="block rounded-lg px-2 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
										onClick={() => setOpen(false)}
									>
										{l.label}
									</a>
								) : (
									<Link
										href={l.href}
										className="block rounded-lg px-2 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
										onClick={() => setOpen(false)}
									>
										{l.label}
									</Link>
								)}
							</li>
						))}
						<li>
							<a
								href={site.urls.login}
								className="block rounded-lg px-2 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								Sign in
							</a>
						</li>
					</ul>
				</nav>
			)}
		</header>
	);
}
