"use client";

import { createContext, use, type ReactNode } from "react";

import { SystemBannerBar } from "@llmgateway/shared/system-banner";

import type { SystemBanner } from "@llmgateway/shared";

const SystemBannerContext = createContext<SystemBanner[]>([]);

export function SystemBannerProvider({
	banners,
	children,
}: {
	banners: SystemBanner[];
	children: ReactNode;
}) {
	return <SystemBannerContext value={banners}>{children}</SystemBannerContext>;
}

export function useSystemBanners(): SystemBanner[] {
	return use(SystemBannerContext);
}

/** The announcement and maintenance bars, stacked full-width. */
export function SystemBanners() {
	const banners = useSystemBanners();
	return banners.map((banner) => (
		<SystemBannerBar key={banner.message} banner={banner} />
	));
}
