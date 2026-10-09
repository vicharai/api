import {
	ChevronsUpDown,
	Check,
	MoreHorizontal,
	PlusCircle,
	Settings2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/lib/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/lib/components/dropdown-menu";

import { NewOrganizationDialog } from "./new-organization-dialog";
import { OrganizationAvatar } from "./organization-avatar";

import type { Organization } from "@/lib/types";

interface OrganizationSwitcherProps {
	organizations: Organization[];
	selectedOrganization: Organization | null;
	onSelectOrganization: (org: Organization | null) => void;
	onOrganizationCreated: (org: Organization) => void;
}

export function OrganizationSwitcher({
	organizations,
	selectedOrganization,
	onSelectOrganization,
	onOrganizationCreated,
}: OrganizationSwitcherProps) {
	const [isNewOrgDialogOpen, setIsNewOrgDialogOpen] = useState(false);

	// A solo user has nothing to switch between — show the workspace name with
	// an overflow menu instead of a picker.
	const singleWorkspace = organizations.length <= 1;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="flex h-8 min-w-0 max-w-44 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring justify-start"
					>
						{selectedOrganization && (
							<OrganizationAvatar
								organization={selectedOrganization}
								className="flex-shrink-0"
							/>
						)}
						<span className="hidden truncate sm:block">
							{selectedOrganization
								? selectedOrganization.name
								: "Select Workspace"}
						</span>
						{singleWorkspace ? (
							<MoreHorizontal className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
						) : (
							<ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-60 border-border bg-background text-foreground shadow-xl">
					{singleWorkspace ? (
						<>
							{selectedOrganization && (
								<DropdownMenuItem
									asChild
									className="cursor-pointer px-2 py-1.5 text-sm hover:bg-accent focus:bg-accent data-[highlighted]:bg-accent"
								>
									<Link
										href={`/dashboard/${selectedOrganization.id}/org/preferences`}
									>
										<Settings2 className="mr-2 h-4 w-4" />
										Workspace settings
									</Link>
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator className="bg-border" />
						</>
					) : (
						<>
							<DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
								Workspaces
							</DropdownMenuLabel>
							<DropdownMenuSeparator className="bg-border" />
							{organizations.map((org) => (
								<DropdownMenuItem
									key={org.id}
									onSelect={() => onSelectOrganization(org)}
									className="cursor-pointer gap-2 px-2 py-1.5 text-sm hover:bg-accent focus:bg-accent data-[highlighted]:bg-accent"
								>
									<OrganizationAvatar
										organization={org}
										className="flex-shrink-0"
									/>
									<span className="truncate">{org.name}</span>
									{selectedOrganization?.id === org.id && (
										<Check className="ml-auto h-4 w-4 flex-shrink-0" />
									)}
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator className="bg-border" />
						</>
					)}
					<DropdownMenuItem
						onSelect={() => setIsNewOrgDialogOpen(true)}
						className="cursor-pointer px-2 py-1.5 text-sm hover:bg-accent focus:bg-accent data-[highlighted]:bg-accent"
					>
						<PlusCircle className="mr-2 h-4 w-4" />
						New Workspace
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<NewOrganizationDialog
				isOpen={isNewOrgDialogOpen}
				setIsOpen={setIsNewOrgDialogOpen}
				onOrganizationCreated={onOrganizationCreated}
			/>
		</>
	);
}
