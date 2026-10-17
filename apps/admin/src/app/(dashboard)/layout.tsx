import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminSessionProvider } from "@/components/shell/admin-session";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { KeyboardShortcuts } from "@/components/shell/keyboard-shortcuts";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { getUserMe } from "@/lib/server-api";

import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@llmgateway/shared/components";

import type { ReactNode } from "react";

export default async function DashboardLayout({
	children,
}: {
	children: ReactNode;
}) {
	const user = await getUserMe();
	if (!user?.isAdmin || !user.adminRole) {
		redirect("/login");
	}

	const cookieStore = await cookies();
	const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

	return (
		<AdminSessionProvider
			session={{
				userId: user.id,
				email: user.email,
				name: user.name,
				role: user.adminRole,
			}}
		>
			<SidebarProvider defaultOpen={sidebarOpen}>
				<AppSidebar />
				<SidebarInset>
					<header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
						<SidebarTrigger className="-ml-1" />
						<div className="flex flex-1 justify-center">
							<CommandPalette />
						</div>
						<ThemeToggle />
						<UserMenu />
					</header>
					<main className="flex-1 p-4 md:p-6">{children}</main>
					<KeyboardShortcuts />
				</SidebarInset>
			</SidebarProvider>
		</AdminSessionProvider>
	);
}
