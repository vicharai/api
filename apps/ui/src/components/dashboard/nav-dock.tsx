"use client";

import {
	Activity,
	BarChart3,
	BotMessageSquare,
	Ellipsis,
	Key,
	LayoutDashboard,
	Settings,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { useDashboardContext } from "@/lib/dashboard-context";
import {
	buildDashboardUrl,
	buildOrgUrl as buildOrganizationUrl,
	extractOrgAndProjectFromPath,
} from "@/lib/navigation-utils";
import { cn } from "@/lib/utils";

import type { Route } from "next";

const SPRING = { type: "spring", stiffness: 550, damping: 40 } as const;
const TOOLTIP_SPRING = { type: "spring", stiffness: 600, damping: 34 } as const;

type DockIcon = React.ComponentType<{ className?: string }>;

interface DockItem {
	/** Path segment relative to the project root; "" is the overview. */
	segment: string;
	label: string;
	icon: DockIcon;
	/** True when the link lives under /dashboard/{org}/org/ rather than the project. */
	orgScoped?: boolean;
}

const PROJECT_ITEMS: DockItem[] = [
	{ segment: "", label: "Overview", icon: LayoutDashboard },
	{ segment: "activity", label: "Activity", icon: Activity },
	{ segment: "analytics", label: "Analytics", icon: BarChart3 },
	{ segment: "agents", label: "Agents", icon: BotMessageSquare },
	{ segment: "api-keys", label: "API Keys", icon: Key },
	{ segment: "settings/preferences", label: "Settings", icon: Settings },
];

const DEVELOPER_ITEMS: DockItem[] = [
	{ segment: "me", label: "Dashboard", icon: LayoutDashboard },
	{ segment: "me/api-keys", label: "API Keys", icon: Key },
];

const MORE_ITEMS_PROJECT: {
	segment: string;
	label: string;
	orgScoped?: boolean;
}[] = [
	{ segment: "sessions", label: "Sessions" },
	{ segment: "org/billing", label: "Billing", orgScoped: true },
	{ segment: "org/transactions", label: "Transactions", orgScoped: true },
	{ segment: "org/team", label: "Team", orgScoped: true },
	{ segment: "org/provider-keys", label: "Provider Keys", orgScoped: true },
	{ segment: "org/models", label: "Models", orgScoped: true },
	{ segment: "org/referrals", label: "Referrals", orgScoped: true },
	{ segment: "org/preferences", label: "Org Settings", orgScoped: true },
];

const MORE_ITEMS_DEVELOPER: {
	segment: string;
	label: string;
	orgScoped?: boolean;
}[] = [{ segment: "org/models", label: "Models", orgScoped: true }];

function DockTooltip({ label }: { label: string }) {
	return (
		<motion.span
			aria-hidden="true"
			role="tooltip"
			initial={{ opacity: 0, y: 4, scale: 0.9, x: "-50%" }}
			animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
			exit={{ opacity: 0, y: 4, scale: 0.9, x: "-50%" }}
			transition={TOOLTIP_SPRING}
			className="pointer-events-none absolute bottom-full left-1/2 mb-2 block whitespace-nowrap rounded-xl bg-[#1c1c1f] px-3 py-[7px] text-[13px] font-medium text-white shadow-[0_1px_1px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-white/10"
		>
			{label}
		</motion.span>
	);
}

function DockButton({
	item,
	active,
	href,
}: {
	item: DockItem;
	active: boolean;
	href: Route;
}) {
	const [hovered, setHovered] = React.useState(false);
	const Icon = item.icon;

	return (
		<span
			className="relative flex"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<AnimatePresence>
				{hovered && <DockTooltip label={item.label} />}
			</AnimatePresence>
			<Link
				href={href}
				aria-label={item.label}
				aria-current={active ? "page" : undefined}
				className={cn(
					"relative flex items-center rounded-full p-[9px] outline-none transition-colors duration-200 ease-out active:scale-95 focus-visible:ring-2 focus-visible:ring-white/40",
					active
						? "text-white"
						: "text-white/55 hover:bg-white/5 hover:text-white",
				)}
			>
				{active && (
					<motion.span
						layoutId="nav-dock-active"
						transition={SPRING}
						className="absolute inset-0 rounded-full bg-white/12 shadow-sm"
						aria-hidden="true"
					/>
				)}
				<Icon
					className={cn(
						"relative z-10 size-[19px] shrink-0 transition-transform duration-200",
						active && "scale-105",
					)}
				/>
			</Link>
		</span>
	);
}

function MoreButton({
	items,
	active,
	hrefFor,
}: {
	items: { segment: string; label: string }[];
	active: boolean;
	hrefFor: (item: { segment: string; label: string }) => Route;
}) {
	const [open, setOpen] = React.useState(false);
	const [hovered, setHovered] = React.useState(false);
	const rootRef = React.useRef<HTMLSpanElement>(null);

	React.useEffect(() => {
		if (!open) {
			return;
		}
		const onDown = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<span
			ref={rootRef}
			className="relative flex"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<AnimatePresence>
				{hovered && !open && <DockTooltip label="More" />}
			</AnimatePresence>
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: 6, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 6, scale: 0.96 }}
						transition={SPRING}
						style={{ transformOrigin: "bottom right" }}
						className="absolute bottom-full right-0 mb-3 flex min-w-44 flex-col gap-0.5 rounded-2xl bg-[#1c1c1f] p-1.5 shadow-[0_1px_1px_rgba(0,0,0,0.3),0_12px_32px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
					>
						{items.map((item) => (
							<Link
								key={item.segment}
								href={hrefFor(item)}
								onClick={() => setOpen(false)}
								className="flex cursor-pointer items-center whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-medium text-white/75 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
							>
								{item.label}
							</Link>
						))}
					</motion.div>
				)}
			</AnimatePresence>
			<button
				type="button"
				aria-label="More"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"relative flex cursor-pointer items-center rounded-full p-[9px] outline-none transition-colors duration-200 ease-out active:scale-95 focus-visible:ring-2 focus-visible:ring-white/40",
					open || active
						? "bg-white/10 text-white"
						: "text-white/55 hover:bg-white/5 hover:text-white",
				)}
			>
				<Ellipsis className="size-[19px] shrink-0" />
				{active && (
					<span
						aria-hidden="true"
						className="absolute right-1 top-1 size-1.5 rounded-full bg-[#c084fc]"
					/>
				)}
			</button>
		</span>
	);
}

/**
 * The floating dock: one dark glass pill centered at the bottom edge carrying
 * the whole dashboard's navigation. Replaces the left rail — the page owns
 * its full width and the dock floats over the content's deep bottom padding.
 */
export function NavDock() {
	const pathname = usePathname();
	const { selectedOrganization, selectedProject } = useDashboardContext();

	const { orgId, projectId } = React.useMemo(
		() => extractOrgAndProjectFromPath(pathname),
		[pathname],
	);
	const currentOrgId = orgId ?? selectedOrganization?.id;
	const currentProjectId = projectId ?? selectedProject?.id;

	const isDeveloper = selectedOrganization?.role === "developer";
	const items = isDeveloper ? DEVELOPER_ITEMS : PROJECT_ITEMS;
	const moreItems = isDeveloper ? MORE_ITEMS_DEVELOPER : MORE_ITEMS_PROJECT;

	const hrefFor = (item: { segment: string; orgScoped?: boolean }): Route =>
		item.orgScoped
			? (buildOrganizationUrl(currentOrgId, item.segment) as Route)
			: buildDashboardUrl(currentOrgId, currentProjectId, item.segment);

	const isActive = (item: { segment: string; orgScoped?: boolean }) => {
		const target = hrefFor(item).split("?")[0];
		if (!item.orgScoped && item.segment === "") {
			// Overview matches only the bare project root.
			return pathname === target;
		}
		if (item.segment.startsWith("settings")) {
			return pathname.includes("/settings/");
		}
		if (item.segment === "me") {
			return pathname === target;
		}
		if (item.orgScoped) {
			return pathname.startsWith(
				`/dashboard/${currentOrgId}/org/${item.segment}`,
			);
		}
		return (
			pathname === target ||
			pathname.startsWith(`${target}/`) ||
			// merged views: analytics owns the old usage/model-usage URLs
			(item.segment === "analytics" &&
				(pathname.endsWith("/usage") || pathname.endsWith("/model-usage")))
		);
	};

	const moreActive = moreItems.some((item) => isActive(item));

	if (!currentOrgId) {
		return null;
	}

	return (
		<nav
			aria-label="Dashboard"
			className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
		>
			<div className="pointer-events-auto flex items-center gap-1 rounded-3xl border border-white/15 bg-[#242428]/90 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.28),0_1px_2px_rgba(0,0,0,0.3)] backdrop-blur-xl">
				{items.map((item) => (
					<DockButton
						key={item.segment || "overview"}
						item={item}
						active={isActive(item)}
						href={hrefFor(item)}
					/>
				))}
				<span
					aria-hidden="true"
					className="mx-0.5 h-5 w-px shrink-0 bg-white/12"
				/>
				<MoreButton items={moreItems} active={moreActive} hrefFor={hrefFor} />
			</div>
		</nav>
	);
}
