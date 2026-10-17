"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavActive, NAV_GROUPS } from "@/lib/nav";
import { roleAllows } from "@/lib/permissions";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@llmgateway/shared/components";

import { useAdminSession } from "./admin-session";

export function AppSidebar() {
	const pathname = usePathname();
	const { role, email } = useAdminSession();

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="shrink-0">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link href="/">
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
									<ShieldCheck className="size-4" />
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">Vichar Admin</span>
									<span className="truncate text-xs text-muted-foreground capitalize">
										{role}
									</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent className="min-h-0 overflow-y-auto">
				{NAV_GROUPS.map((group) => {
					const items = group.items.filter(
						(item) => !item.requires || roleAllows(role, "GET", item.requires),
					);
					if (items.length === 0) {
						return null;
					}
					return (
						<SidebarGroup key={group.label} className="shrink-0">
							<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{items.map((item) => (
										<SidebarMenuItem key={item.href}>
											<SidebarMenuButton
												asChild
												isActive={isNavActive(pathname, item.href)}
												tooltip={item.title}
											>
												<Link href={item.href}>
													<item.icon />
													<span>{item.title}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					);
				})}
			</SidebarContent>
			<SidebarFooter className="shrink-0 border-t">
				<p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
					{email}
				</p>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
