"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
	ArrowRight,
	Boxes,
	ComputerIcon,
	CreditCard,
	KeyRound,
	MoonIcon,
	PanelLeft,
	Search,
	SunIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/lib/components/command";
import { DialogOverlay, DialogPortal } from "@/lib/components/dialog";
import { useSidebar } from "@/lib/components/sidebar";
import { useDashboardContext } from "@/lib/dashboard-context";
import {
	buildDashboardUrl,
	extractOrgAndProjectFromPath,
} from "@/lib/navigation-utils";

import { getNavGroups, navHref, type NavIds, type NavItem } from "./nav-config";

import type { Route } from "next";

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded-md border border-border bg-muted px-1 font-sans text-[10px] font-medium text-muted-foreground">
			{children}
		</kbd>
	);
}

const itemClass =
	"group/cmd h-9 gap-2.5 rounded-lg px-2.5 text-[13px] data-[selected=true]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground data-[selected=true]:[&_svg]:text-foreground";

/**
 * ⌘K: jump anywhere, run common actions. Navigation items come from the same
 * config as the sidebar, so the two can never drift apart.
 */
export function CommandMenu() {
	const [open, setOpen] = React.useState(false);
	const router = useRouter();
	const pathname = usePathname();
	const { setTheme } = useTheme();
	const { toggleSidebar } = useSidebar();
	const { selectedOrganization, selectedProject } = useDashboardContext();

	React.useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setOpen((v) => !v);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const fromPath = extractOrgAndProjectFromPath(pathname);
	const ids: NavIds = {
		orgId: fromPath.orgId ?? selectedOrganization?.id,
		projectId: fromPath.projectId ?? selectedProject?.id,
	};
	const { work, settings } = getNavGroups(selectedOrganization);
	const isDeveloper = selectedOrganization?.role === "developer";

	const run = (fn: () => void) => {
		setOpen(false);
		fn();
	};
	const go = (href: string) => run(() => router.push(href as Route));

	const renderNav = (item: NavItem, prefix?: string) => {
		const Icon = item.icon;
		const label = prefix ? `${prefix} › ${item.label}` : item.label;
		return (
			<CommandItem
				key={`${prefix ?? ""}${item.segment}`}
				value={label}
				keywords={item.keywords}
				onSelect={() => go(navHref(item, ids))}
				className={itemClass}
			>
				<Icon />
				<span className="truncate">
					{prefix && <span className="text-muted-foreground">{prefix} › </span>}
					{item.label}
				</span>
				<ArrowRight className="ml-auto size-3.5! opacity-0 transition-all duration-150 group-data-[selected=true]/cmd:translate-x-0.5 group-data-[selected=true]/cmd:opacity-100" />
			</CommandItem>
		);
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Search or jump to"
				className="group flex h-8 items-center gap-2 rounded-lg border border-border bg-muted/40 pl-2.5 pr-1.5 text-[13px] text-muted-foreground outline-none transition-all duration-150 hover:border-foreground/15 hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:w-64"
			>
				<Search className="size-3.5 shrink-0" />
				<span className="hidden flex-1 text-left md:block">
					Search or jump to…
				</span>
				<span className="hidden items-center gap-0.5 md:flex">
					<Kbd>⌘</Kbd>
					<Kbd>K</Kbd>
				</span>
			</button>
			<DialogPrimitive.Root open={open} onOpenChange={setOpen}>
				<DialogPortal>
					<DialogOverlay className="bg-black/25 backdrop-blur-[2px] dark:bg-black/50" />
					<DialogPrimitive.Content
						aria-describedby={undefined}
						className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=open]:slide-in-from-top-2 fixed left-1/2 top-[14vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl shadow-black/10 duration-200"
					>
						<DialogPrimitive.Title className="sr-only">
							Command menu
						</DialogPrimitive.Title>
						<Command
							loop
							className="rounded-none border-0 bg-transparent [&_[cmdk-input-wrapper]]:h-12 [&_[cmdk-input-wrapper]]:px-4"
						>
							<CommandInput
								placeholder="Search pages, settings, actions…"
								className="h-12 text-[14px]"
							/>
							<CommandList className="max-h-[min(60vh,420px)] p-2">
								<CommandEmpty className="py-10 text-[13px] text-muted-foreground">
									Nothing matches that.
								</CommandEmpty>
								{!isDeveloper && (
									<CommandGroup heading="Quick actions">
										<CommandItem
											value="Create API key"
											keywords={["new", "token"]}
											onSelect={() =>
												go(
													buildDashboardUrl(
														ids.orgId,
														ids.projectId,
														"api-keys",
													),
												)
											}
											className={itemClass}
										>
											<KeyRound />
											Create API key
										</CommandItem>
										<CommandItem
											value="Top up credits"
											keywords={["billing", "add funds", "pay"]}
											onSelect={() => go(`/dashboard/${ids.orgId}/org/billing`)}
											className={itemClass}
										>
											<CreditCard />
											Top up credits
										</CommandItem>
										<CommandItem
											value="Browse models"
											keywords={["catalog", "pricing"]}
											onSelect={() => go(`/dashboard/${ids.orgId}/org/models`)}
											className={itemClass}
										>
											<Boxes />
											Browse models
										</CommandItem>
									</CommandGroup>
								)}
								<CommandGroup heading="Go to">
									{work.flatMap((g) => g.items).map((i) => renderNav(i))}
								</CommandGroup>
								<CommandGroup heading="Settings">
									{settings.flatMap((g) =>
										g.items.map((i) => renderNav(i, g.label)),
									)}
								</CommandGroup>
								<CommandGroup heading="Preferences">
									<CommandItem
										value="Toggle sidebar"
										onSelect={() => run(toggleSidebar)}
										className={itemClass}
									>
										<PanelLeft />
										Toggle sidebar
										<span className="ml-auto flex gap-0.5">
											<Kbd>⌘</Kbd>
											<Kbd>B</Kbd>
										</span>
									</CommandItem>
									<CommandItem
										value="Theme: Light"
										onSelect={() => run(() => setTheme("light"))}
										className={itemClass}
									>
										<SunIcon />
										Light theme
									</CommandItem>
									<CommandItem
										value="Theme: Dark"
										onSelect={() => run(() => setTheme("dark"))}
										className={itemClass}
									>
										<MoonIcon />
										Dark theme
									</CommandItem>
									<CommandItem
										value="Theme: System"
										onSelect={() => run(() => setTheme("system"))}
										className={itemClass}
									>
										<ComputerIcon />
										System theme
									</CommandItem>
								</CommandGroup>
							</CommandList>
							<div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
								<span className="flex items-center gap-1">
									<Kbd>↑</Kbd>
									<Kbd>↓</Kbd>
									navigate
								</span>
								<span className="flex items-center gap-1">
									<Kbd>↵</Kbd>
									open
								</span>
								<span className="ml-auto flex items-center gap-1">
									<Kbd>esc</Kbd>
									close
								</span>
							</div>
						</Command>
					</DialogPrimitive.Content>
				</DialogPortal>
			</DialogPrimitive.Root>
		</>
	);
}
