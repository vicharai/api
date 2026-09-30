"use client";

import { ComputerIcon, CreditCard, MoonIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { usePostHog } from "posthog-js/react";

import { TopUpCreditsDialog } from "@/components/credits/top-up-credits-dialog";
import { ChangelogNotifications } from "@/components/dashboard/changelog-notifications";
import { UsageNotifications } from "@/components/dashboard/usage-notifications";
import { ThemeToggle } from "@/components/landing/theme-toggle";
import { ModelSearch } from "@/components/shared/model-search";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/lib/components/select";
import { VicharMark } from "@/lib/icons/vichar-logo";

import { OrganizationSwitcher } from "./organization-switcher";
import { ProjectSwitcher } from "./project-switcher";

import type { AnnouncementEntry } from "@/components/dashboard/changelog-notifications";
import type { Organization, Project } from "@/lib/types";
import type { Route } from "next";

const USER_MENU_ITEMS: {
	segment: string;
	label: string;
	orgScoped?: boolean;
}[] = [
	{ segment: "settings/account", label: "Account" },
	{ segment: "org/billing", label: "Billing", orgScoped: true },
	{ segment: "settings/security", label: "Security" },
];

function ThemeSelect() {
	const { theme, setTheme } = useTheme();
	return (
		<Select value={theme} onValueChange={setTheme}>
			<SelectTrigger className="w-full">
				<SelectValue placeholder="Select theme" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="light">
					<div className="flex items-center">
						<SunIcon className="mr-2 h-4 w-4" />
						Light
					</div>
				</SelectItem>
				<SelectItem value="dark">
					<div className="flex items-center">
						<MoonIcon className="mr-2 h-4 w-4" />
						Dark
					</div>
				</SelectItem>
				<SelectItem value="system">
					<div className="flex items-center">
						<ComputerIcon className="mr-2 h-4 w-4" />
						System
					</div>
				</SelectItem>
			</SelectContent>
		</Select>
	);
}

function UserMenu() {
	const posthog = usePostHog();
	const { signOut } = useAuth();
	const { user } = useUser({
		redirectTo: "/login",
		redirectWhen: "unauthenticated",
	});
	const { buildUrl, buildOrgUrl } = useDashboardNavigation();

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
				<div className="p-2">
					<ThemeSelect />
				</div>
				<DropdownMenuSeparator />
				{USER_MENU_ITEMS.map((item) => {
					const urlBuilder = item.orgScoped ? buildOrgUrl : buildUrl;
					return (
						<DropdownMenuItem key={item.segment} asChild>
							<Link href={urlBuilder(item.segment) as Route} prefetch={true}>
								{item.label}
							</Link>
						</DropdownMenuItem>
					);
				})}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => void logout()}>
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function CreditsChip({
	selectedOrganization,
}: {
	selectedOrganization: Organization | null;
}) {
	if (!selectedOrganization) {
		return null;
	}
	const balance = Number(selectedOrganization.credits).toFixed(2);
	return (
		<TopUpCreditsDialog>
			<button
				type="button"
				className="hidden h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium tabular-nums transition-colors hover:border-brand/30 hover:bg-brand-soft/40 sm:flex"
			>
				<CreditCard className="size-3.5 text-brand" />${balance}
			</button>
		</TopUpCreditsDialog>
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
	announcementEntries = [],
}: {
	projects: Project[];
	selectedProject: Project | null;
	onSelectProject: (project: Project | null) => void;
	selectedOrganization: Organization | null;
	organizations: Organization[];
	onSelectOrganization: (org: Organization | null) => void;
	onProjectCreated: (project: Project) => void;
	onOrganizationCreated: (org: Organization) => void;
	announcementEntries?: AnnouncementEntry[];
}) {
	const pathname = usePathname();
	const isOrgOnlyPage = pathname.includes("/org/");

	return (
		<header className="fixed inset-x-0 top-0 z-40">
			{/* Progressive blur: four stacked layers, each stronger and each
			    masked to die out earlier — sharpness fades, no color band. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-22"
			>
				<div className="absolute inset-0 backdrop-blur-[2px] [mask-image:linear-gradient(to_bottom,black_55%,transparent_84%)]" />
				<div className="absolute inset-0 backdrop-blur-[6px] [mask-image:linear-gradient(to_bottom,black_42%,transparent_70%)]" />
				<div className="absolute inset-0 backdrop-blur-[14px] [mask-image:linear-gradient(to_bottom,black_28%,transparent_56%)]" />
				<div className="absolute inset-0 backdrop-blur-[28px] [mask-image:linear-gradient(to_bottom,black_12%,transparent_42%)]" />
			</div>
			<div className="relative mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
				<div className="flex min-w-0 items-center gap-1">
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
				<div className="flex items-center gap-2">
					<div className="hidden w-[180px] md:block">
						<ModelSearch />
					</div>
					<CreditsChip selectedOrganization={selectedOrganization} />
					<ChangelogNotifications entries={announcementEntries} />
					<UsageNotifications />
					<ThemeToggle size="compact" className="hidden md:inline-flex" />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
