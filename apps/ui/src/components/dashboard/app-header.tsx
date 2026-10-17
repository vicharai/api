"use client";

import { BookOpen, MoonIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";

import { UsageNotifications } from "@/components/dashboard/usage-notifications";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { useUser } from "@/hooks/useUser";
import { useAuth } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/lib/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/lib/components/dropdown-menu";
import { SidebarTrigger } from "@/lib/components/sidebar";
import { useAppConfig } from "@/lib/config";
import { VicharMark } from "@/lib/icons/vichar-logo";

import { CommandMenu } from "./command-menu";
import { OrganizationSwitcher } from "./organization-switcher";
import { ProjectSwitcher } from "./project-switcher";

import type { Organization, Project } from "@/lib/types";
import type { Route } from "next";

function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);
	const isDark = mounted && resolvedTheme === "dark";
	return (
		<button
			type="button"
			aria-label="Toggle theme"
			onClick={() => setTheme(isDark ? "light" : "dark")}
			className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring"
		>
			{isDark ? (
				<SunIcon className="size-4" />
			) : (
				<MoonIcon className="size-4" />
			)}
		</button>
	);
}

function UserMenu() {
	const posthog = usePostHog();
	const { signOut } = useAuth();
	const { user } = useUser({
		redirectTo: "/login",
		redirectWhen: "unauthenticated",
	});
	const { buildUrl } = useDashboardNavigation();

	if (!user) {
		return null;
	}

	const initials = (user.name ?? "U")
		.split(" ")
		.map((n: string) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	const logout = async () => {
		posthog.reset();
		await signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = "/login";
				},
			},
		});
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Account menu"
					className="flex cursor-pointer items-center rounded-full outline-none focus-ring"
				>
					<Avatar className="size-7">
						<AvatarFallback className="bg-brand-soft text-[11px] font-semibold text-brand">
							{initials}
						</AvatarFallback>
					</Avatar>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="min-w-56 rounded-lg"
				side="bottom"
				align="end"
				sideOffset={8}
			>
				<div className="px-3 py-2.5">
					<p className="truncate text-sm font-semibold">{user.name}</p>
					<p className="truncate text-xs text-muted-foreground">{user.email}</p>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href={buildUrl("settings/account") as Route} prefetch={true}>
						Account settings
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => void logout()}>
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** The app shell's fixed header: logo, context switchers, and account chrome. */
export function AppHeader({
	projects,
	selectedProject,
	onSelectProject,
	selectedOrganization,
	organizations,
	onSelectOrganization,
	onProjectCreated,
	onOrganizationCreated,
}: {
	projects: Project[];
	selectedProject: Project | null;
	onSelectProject: (project: Project | null) => void;
	selectedOrganization: Organization | null;
	organizations: Organization[];
	onSelectOrganization: (org: Organization | null) => void;
	onProjectCreated: (project: Project) => void;
	onOrganizationCreated: (org: Organization) => void;
}) {
	const pathname = usePathname();
	const config = useAppConfig();
	const isOrgOnlyPage = pathname.includes("/org/");
	const isDeveloper = selectedOrganization?.role === "developer";
	const credits = selectedOrganization
		? Number(selectedOrganization.credits ?? 0)
		: null;
	const lowCredits = credits !== null && credits <= 5;

	return (
		<header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-card">
			<div className="relative flex h-[56px] w-full items-center justify-between gap-2 px-3 sm:px-4">
				<div className="flex min-w-0 items-center gap-1">
					<SidebarTrigger className="-ml-1 md:hidden" />
					<Link
						href="/dashboard"
						aria-label="Vichar dashboard"
						className="flex items-center gap-2 rounded-md p-1 pr-1.5 outline-none focus-ring"
					>
						<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-white">
							<VicharMark className="size-4" />
						</span>
						<span className="hidden text-[15px] font-semibold text-heading sm:block">
							Vichar
						</span>
					</Link>
					{selectedOrganization && (
						<>
							<span aria-hidden="true" className="mx-2 h-5 w-px bg-border" />
							<OrganizationSwitcher
								organizations={organizations}
								selectedOrganization={selectedOrganization}
								onSelectOrganization={onSelectOrganization}
								onOrganizationCreated={onOrganizationCreated}
							/>
						</>
					)}
					{selectedOrganization && !isOrgOnlyPage && (
						<span className="hidden items-center sm:flex">
							<span aria-hidden="true" className="mx-2 h-5 w-px bg-border" />
							<ProjectSwitcher
								projects={projects}
								selectedProject={selectedProject}
								onSelectProject={onSelectProject}
								currentOrganization={selectedOrganization}
								onProjectCreated={onProjectCreated}
							/>
						</span>
					)}
				</div>
				<div className="flex items-center gap-1.5">
					{credits !== null && !isDeveloper && (
						<div className="flex items-center gap-2 pr-1 text-[13px]">
							<span className="hidden text-muted-foreground lg:inline">
								Balance
							</span>
							<span
								className={
									"font-semibold tabular-nums " +
									(lowCredits ? "text-warning" : "text-foreground")
								}
								title={lowCredits ? "Low balance" : undefined}
							>
								${credits.toFixed(2)}
							</span>
							<Link
								href={
									`/dashboard/${selectedOrganization?.id}/org/billing` as Route
								}
								className="inline-flex h-7 items-center rounded-md px-2 font-medium text-brand transition-colors hover:bg-brand-soft focus-ring"
							>
								Add credits
							</Link>
						</div>
					)}
					<CommandMenu />
					<a
						href={config.docsUrl}
						target="_blank"
						rel="noreferrer"
						className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring md:flex"
					>
						<BookOpen className="size-3.5" />
						Docs
					</a>
					<ThemeToggle />
					<UsageNotifications />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
