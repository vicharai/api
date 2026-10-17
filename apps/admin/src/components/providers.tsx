"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";

import { AppConfigProvider } from "@/lib/config";
import { errorMessage } from "@/lib/utils";

import { Toaster, TooltipProvider } from "@llmgateway/shared/components";

import type { AppConfig } from "@/lib/config-server";
import type { ReactNode } from "react";

export function Providers({
	children,
	config,
}: {
	children: ReactNode;
	config: AppConfig;
}) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						refetchOnWindowFocus: false,
						staleTime: 30 * 1000,
						retry: false,
					},
					mutations: {
						onError: (error) => {
							toast.error(errorMessage(error));
						},
					},
				},
			}),
	);

	return (
		<AppConfigProvider config={config}>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				storageKey="admin-theme"
			>
				<QueryClientProvider client={queryClient}>
					<TooltipProvider delayDuration={200}>{children}</TooltipProvider>
				</QueryClientProvider>
				<Toaster richColors position="bottom-right" />
			</ThemeProvider>
		</AppConfigProvider>
	);
}
