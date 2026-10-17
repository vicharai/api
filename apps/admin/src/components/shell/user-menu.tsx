"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAuthClient } from "@/lib/auth-client";
import { ROLE_LABELS } from "@/lib/permissions";

import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@llmgateway/shared/components";

import { useAdminSession } from "./admin-session";

export function UserMenu() {
	const { email, name, role } = useAdminSession();
	const authClient = useAuthClient();
	const queryClient = useQueryClient();
	const router = useRouter();

	async function signOut() {
		await authClient.signOut();
		queryClient.clear();
		router.replace("/login");
		router.refresh();
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Account">
					<User />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuLabel className="space-y-0.5">
					<div className="truncate text-sm font-medium">{name ?? email}</div>
					<div className="truncate text-xs font-normal text-muted-foreground">
						{email} · {ROLE_LABELS[role]}
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={signOut}>
					<LogOut className="mr-2 size-4" /> Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
