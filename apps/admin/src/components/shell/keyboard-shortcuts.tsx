"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@llmgateway/shared/components";

import { openCommandPalette } from "./command-palette";

import type { Route } from "next";

/** `g` then a key navigates; listed in the `?` help dialog. */
const GO_TO: { key: string; href: Route; label: string }[] = [
	{ key: "h", href: "/", label: "Overview" },
	{ key: "o", href: "/organizations", label: "Organizations" },
	{ key: "u", href: "/users", label: "Users" },
	{ key: "i", href: "/issues", label: "Issues" },
	{ key: "s", href: "/support", label: "Support" },
	{ key: "a", href: "/activity", label: "Activity" },
	{ key: "k", href: "/routing/kill-switches", label: "Kill switches" },
	{ key: "l", href: "/load", label: "Load" },
	{ key: "y", href: "/system/health", label: "System health" },
];

const OTHER: { keys: string[]; label: string }[] = [
	{ keys: ["⌘", "K"], label: "Command palette (search, actions, recent)" },
	{ keys: ["/"], label: "Focus the page search, or open the palette" },
	{ keys: ["?"], label: "Show this help" },
];

/** Attribute that marks an input as the page's primary search field. */
export const PAGE_SEARCH_ATTRIBUTE = "data-page-search";

const CHORD_TIMEOUT_MS = 1200;

function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	return (
		target.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
		target.closest("[role=dialog]") !== null
	);
}

function focusPageSearch(): boolean {
	const input =
		document.querySelector<HTMLInputElement>(`[${PAGE_SEARCH_ATTRIBUTE}]`) ??
		document.querySelector<HTMLInputElement>(
			'main input[type="search"], main input[placeholder*="earch"]',
		);
	if (!input) {
		return false;
	}
	input.focus();
	input.select();
	return true;
}

function Keys({ keys }: { keys: string[] }) {
	return (
		<span className="flex gap-1">
			{keys.map((k) => (
				<kbd
					key={k}
					className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-xs"
				>
					{k}
				</kbd>
			))}
		</span>
	);
}

/** Global keyboard shortcuts plus the `?` help dialog. Mount once. */
export function KeyboardShortcuts() {
	const router = useRouter();
	const [helpOpen, setHelpOpen] = useState(false);
	const pendingG = useRef<number | null>(null);

	useEffect(() => {
		function clearChord() {
			if (pendingG.current !== null) {
				window.clearTimeout(pendingG.current);
				pendingG.current = null;
			}
		}

		function onKeyDown(event: KeyboardEvent) {
			if (
				event.defaultPrevented ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				isTyping(event.target)
			) {
				return;
			}
			if (pendingG.current !== null) {
				clearChord();
				const target = GO_TO.find((g) => g.key === event.key.toLowerCase());
				if (target) {
					event.preventDefault();
					router.push(target.href);
				}
				return;
			}
			if (event.key === "g") {
				pendingG.current = window.setTimeout(clearChord, CHORD_TIMEOUT_MS);
				return;
			}
			if (event.key === "/") {
				event.preventDefault();
				if (!focusPageSearch()) {
					openCommandPalette();
				}
				return;
			}
			if (event.key === "?") {
				event.preventDefault();
				setHelpOpen(true);
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			clearChord();
		};
	}, [router]);

	return (
		<Dialog open={helpOpen} onOpenChange={setHelpOpen}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
					<DialogDescription>
						Shortcuts are ignored while typing in a field.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 text-sm">
					<ul className="space-y-2">
						{OTHER.map((s) => (
							<li
								key={s.label}
								className="flex items-center justify-between gap-3"
							>
								<span>{s.label}</span>
								<Keys keys={s.keys} />
							</li>
						))}
					</ul>
					<div className="space-y-2">
						<p className="text-xs font-medium text-muted-foreground uppercase">
							Go to
						</p>
						<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{GO_TO.map((g) => (
								<li
									key={g.key}
									className="flex items-center justify-between gap-3"
								>
									<span>{g.label}</span>
									<Keys keys={["g", g.key]} />
								</li>
							))}
						</ul>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
