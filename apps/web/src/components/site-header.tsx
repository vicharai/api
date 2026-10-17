"use client";

import { ArrowRight, Menu, Moon, Sun, X } from "lucide-react";
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
			className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
	const [hovered, setHovered] = useState<string | null>(null);
	const pathname = usePathname();

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<header
			className={`sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300 ${
				scrolled || open
					? "border-b border-border bg-background/85 shadow-[0_1px_0_rgb(11_27_51/0.02)] backdrop-blur-xl"
					: "border-b border-transparent bg-transparent"
			}`}
		>
			<div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-5 sm:px-8">
				<Link
					href="/"
					className="flex items-center gap-2 font-display text-[17px] font-bold tracking-tight"
					aria-label="Vichar home"
				>
					<span className="flex size-7 items-center justify-center rounded-lg bg-brand-gradient shadow-sm">
						<VicharMark className="size-4 text-white" />
					</span>
					<span>Vichar</span>
				</Link>
				<nav
					className="hidden items-center text-sm md:flex"
					aria-label="Main"
					onMouseLeave={() => setHovered(null)}
				>
					{NAV_LINKS.map((l) => {
						const active = !l.external && pathname.startsWith(l.href);
						const cls = `relative rounded-lg px-3 py-2 font-medium transition-colors ${
							active
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`;
						const inner = (
							<>
								{hovered === l.label && (
									<motion.span
										layoutId="nav-hover"
										className="absolute inset-0 -z-10 rounded-lg bg-accent"
										transition={{ type: "spring", stiffness: 400, damping: 32 }}
									/>
								)}
								{l.label}
								{active && (
									<span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-brand" />
								)}
							</>
						);
						return l.external ? (
							<a
								key={l.label}
								href={l.href}
								className={cls}
								onMouseEnter={() => setHovered(l.label)}
							>
								{inner}
							</a>
						) : (
							<Link
								key={l.label}
								href={l.href}
								className={cls}
								onMouseEnter={() => setHovered(l.label)}
							>
								{inner}
							</Link>
						);
					})}
				</nav>
				<div className="ml-auto flex items-center gap-2 sm:gap-3">
					<ThemeToggle />
					<a
						href={site.urls.login}
						className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
					>
						Sign in
					</a>
					<a
						href={site.urls.signup}
						className="group hidden h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_1px_2px_rgb(11_27_51/0.12),inset_0_1px_0_rgb(255_255_255/0.15)] transition-all hover:bg-brand-strong sm:inline-flex"
					>
						Get API key
						<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
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
			<AnimatePresence>
				{open && (
					<motion.nav
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
						className="overflow-hidden border-t border-border bg-background md:hidden"
						aria-label="Mobile"
					>
						<ul className="flex flex-col gap-1 px-5 py-4 text-sm">
							{NAV_LINKS.map((l) => (
								<li key={l.label}>
									{l.external ? (
										<a
											href={l.href}
											className="block rounded-lg px-3 py-2.5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
											onClick={() => setOpen(false)}
										>
											{l.label}
										</a>
									) : (
										<Link
											href={l.href}
											className="block rounded-lg px-3 py-2.5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
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
									className="flex h-10 items-center justify-center rounded-lg border border-border font-medium"
								>
									Sign in
								</a>
								<a
									href={site.urls.signup}
									className="flex h-10 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground"
								>
									Get API key
								</a>
							</li>
						</ul>
					</motion.nav>
				)}
			</AnimatePresence>
		</header>
	);
}
