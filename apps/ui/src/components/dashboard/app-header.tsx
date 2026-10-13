"use client";

import { BookOpen, MoonIcon, Plus, SunIcon } from "lucide-react";
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
			className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
					className="flex cursor-pointer items-center rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Avatar className="size-7">
						<AvatarFallback className="bg-brand text-[11px] font-medium text-white">
							{initials}
						</AvatarFallback>
					</Avatar>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="min-w-56 rounded-xl"
				side="bottom"
				align="end"
				sideOffset={8}
			>
				<div className="px-3 py-2">
					<p className="truncate text-sm font-medium">{user.name}</p>
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

/**
 * The app shell's fixed header: logo, context switchers, and account chrome
 * over a progressive backdrop blur — the blur itself fades instead of a
 * tinted band, so nothing hard-draws a line under the header.
 */
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
		<header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background">
			<div className="relative flex h-[52px] w-full items-center justify-between gap-2 px-3 sm:px-4">
				<div className="flex min-w-0 items-center gap-1">
					<SidebarTrigger className="-ml-1 md:hidden" />
					<Link
						href="/dashboard"
						aria-label="Vichar dashboard"
						className="flex items-center gap-2 rounded-lg p-1 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
					>
						<VicharMark className="size-6 shrink-0 text-brand" />
						<span className="hidden text-[15px] font-medium tracking-tight sm:block">
							Vichar
						</span>
					</Link>
					{selectedOrganization && (
						<>
							<span
								aria-hidden="true"
								className="mx-1 h-4 w-px rotate-12 bg-border"
							/>
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
							<span
								aria-hidden="true"
								className="mx-1 h-4 w-px rotate-12 bg-border"
							/>
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
						<Link
							href={
								`/dashboard/${selectedOrganization?.id}/org/billing` as Route
							}
							className="group flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[13px] font-medium tabular-nums transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							title="Balance — click to top up"
						>
							{lowCredits && (
								<span
									aria-label="Low balance"
									className="size-1.5 rounded-full bg-warning"
								/>
							)}
							<Plus className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
							${credits.toFixed(2)}
						</Link>
					)}
					<CommandMenu />
					<a
						href={config.docsUrl}
						target="_blank"
						rel="noreferrer"
						className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
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
