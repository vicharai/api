"use client";

import { Menu, Moon, Sun, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { site } from "@/lib/site";
import { VicharMark } from "@/lib/vichar-logo";

const NAV_LINKS = [
	{ label: "Models", href: "/models/" },
	{ label: "Pricing", href: "/pricing/" },
	{ label: "Docs", href: site.urls.docs, external: true },
	{ label: "About", href: "/about/" },
	{ label: "Contact", href: "/contact/" },
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
			className="inline-flex size-10 items-center justify-center rounded-full text-body transition-colors hover:bg-surface-2 hover:text-foreground"
		>
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={dark ? "sun" : "moon"}
					initial={{ rotate: -90, opacity: 0 }}
					animate={{ rotate: 0, opacity: 1 }}
					exit={{ rotate: 90, opacity: 0 }}
					transition={{ duration: 0.2 }}
				>
					{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
				</motion.span>
			</AnimatePresence>
		</button>
	);
}

export function SiteHeader() {
	const [open, setOpen] = useState(false);
	const [scrolled, setScrolled] = useState(false);
	const pathname = usePathname();

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<header
			className={`sticky top-0 z-40 bg-background transition-shadow duration-300 ${
				scrolled || open
					? "shadow-[0_1px_2px_rgb(60_64_67/0.3),0_1px_3px_1px_rgb(60_64_67/0.15)]"
					: ""
			}`}
		>
			<div className="mx-auto flex h-16 max-w-[1240px] items-center px-5 sm:px-8">
				<Link
					href="/"
					className="flex items-center gap-2"
					aria-label="Vichar home"
				>
					<VicharMark className="size-7 text-g-blue" />
					<span className="text-[22px] font-normal tracking-tight text-body">
						Vichar
					</span>
				</Link>
				<nav
					className="ml-6 hidden items-center gap-1 text-sm md:flex"
					aria-label="Main"
				>
					{NAV_LINKS.map((l) => {
						const active = !l.external && pathname.startsWith(l.href);
						const cls = `relative rounded-full px-4 py-2 font-medium transition-colors ${
							active
								? "bg-g-blue-soft text-g-blue-deep"
								: "text-body hover:bg-surface-2 hover:text-foreground"
						}`;
						const inner = <>{l.label}</>;
						return l.external ? (
							<a key={l.label} href={l.href} className={cls}>
								{inner}
							</a>
						) : (
							<Link key={l.label} href={l.href} className={cls}>
								{inner}
							</Link>
						);
					})}
				</nav>
				<div className="ml-auto flex items-center gap-1 sm:gap-2">
					<ThemeToggle />
					<a
						href={site.urls.login}
						className="hidden h-10 items-center rounded-full px-4 text-sm font-medium text-g-blue transition-colors hover:bg-g-blue-soft sm:inline-flex"
					>
						Sign in
					</a>
					<a
						href={site.urls.signup}
						className="hidden h-10 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-[background-color,box-shadow] hover:bg-brand-strong hover:shadow-[0_1px_3px_1px_rgb(60_64_67/0.15)] sm:inline-flex"
					>
						Get started
					</a>
					<button
						type="button"
						className="inline-flex size-10 items-center justify-center rounded-full text-body hover:bg-surface-2 md:hidden"
						aria-label={open ? "Close menu" : "Open menu"}
						aria-expanded={open}
						onClick={() => setOpen((v) => !v)}
					>
						{open ? <X className="size-4" /> : <Menu className="size-4" />}
					</button>
				</div>
			</div>
			<AnimatePresence>
				{open && (
					<motion.nav
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
						className="overflow-hidden bg-background md:hidden"
						aria-label="Mobile"
					>
						<ul className="flex flex-col gap-1 px-5 py-4 text-sm">
							{NAV_LINKS.map((l) => (
								<li key={l.label}>
									{l.external ? (
										<a
											href={l.href}
											className="block rounded-full px-4 py-2.5 font-medium text-body hover:bg-surface-2 hover:text-foreground"
											onClick={() => setOpen(false)}
										>
											{l.label}
										</a>
									) : (
										<Link
											href={l.href}
											className="block rounded-full px-4 py-2.5 font-medium text-body hover:bg-surface-2 hover:text-foreground"
											onClick={() => setOpen(false)}
										>
											{l.label}
										</Link>
									)}
								</li>
							))}
							<li className="mt-2 grid grid-cols-2 gap-2">
								<a
									href={site.urls.login}
									className="flex h-10 items-center justify-center rounded-full border border-border font-medium text-g-blue"
								>
									Sign in
								</a>
								<a
									href={site.urls.signup}
									className="flex h-10 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground"
								>
									Get started
								</a>
							</li>
						</ul>
					</motion.nav>
				)}
			</AnimatePresence>
		</header>
	);
}
