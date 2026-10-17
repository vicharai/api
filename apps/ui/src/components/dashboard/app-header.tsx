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
import { VicharMarkColor } from "@/lib/icons/vichar-logo";

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
			className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring"
		>
			{isDark ? (
				<SunIcon className="size-5" />
			) : (
				<MoonIcon className="size-5" />
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
					className="ml-1 flex size-10 cursor-pointer items-center justify-center rounded-full outline-none transition-colors hover:bg-accent focus-ring"
				>
					<Avatar className="size-8">
						<AvatarFallback className="bg-brand text-[13px] font-medium text-primary-foreground">
							{initials}
						</AvatarFallback>
					</Avatar>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="min-w-64 rounded-3xl p-2"
				side="bottom"
				align="end"
				sideOffset={8}
			>
				<div className="flex flex-col items-center px-3 pb-3 pt-4 text-center">
					<Avatar className="mb-2 size-14">
						<AvatarFallback className="bg-brand text-xl font-medium text-primary-foreground">
							{initials}
						</AvatarFallback>
					</Avatar>
					<p className="truncate text-base font-medium">{user.name}</p>
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
		<header className="fixed inset-x-0 top-0 z-40 bg-background">
			<div className="relative flex h-16 w-full items-center justify-between gap-2 px-3 sm:px-4">
				<div className="flex min-w-0 items-center gap-1">
					<SidebarTrigger className="-ml-1 md:hidden" />
					<Link
						href="/dashboard"
						aria-label="Vichar dashboard"
						className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 outline-none focus-ring"
					>
						<VicharMarkColor className="size-8 shrink-0" />
						<span className="hidden text-[20px] font-medium leading-none tracking-normal text-muted-foreground sm:block">
							Vichar
						</span>
					</Link>
					{selectedOrganization && (
						<>
							<span aria-hidden="true" className="mx-1" />
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
							<span aria-hidden="true" className="mx-1" />
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
				<div className="flex items-center gap-1">
					{credits !== null && !isDeveloper && (
						<div
							className={
								"mr-1 flex h-8 items-center gap-1 rounded-full border pl-3 pr-1 text-[13px] " +
								(lowCredits
									? "border-transparent bg-warning-soft"
									: "border-border")
							}
						>
							<span className="hidden text-muted-foreground lg:inline">
								Balance
							</span>
							<span
								className={
									"font-medium tabular-nums " +
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
								className="ml-1 inline-flex h-6 items-center rounded-full px-2.5 font-medium text-brand transition-colors hover:bg-brand-soft focus-ring"
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
						className="hidden h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring md:flex"
					>
						<BookOpen className="size-[18px]" />
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
