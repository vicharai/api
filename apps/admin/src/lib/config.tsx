"use client";

import { createContext, use, type ReactNode } from "react";

import type { AppConfig } from "./config-server";

const AppConfigContext = createContext<AppConfig | null>(null);

export function AppConfigProvider({
	children,
	config,
}: {
	children: ReactNode;
	config: AppConfig;
}) {
	return <AppConfigContext value={config}>{children}</AppConfigContext>;
}

export function useAppConfig(): AppConfig {
	const config = use(AppConfigContext);
	if (!config) {
		throw new Error("useAppConfig must be used within an AppConfigProvider");
	}
	return config;
}
