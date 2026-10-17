import { useEffect, useSyncExternalStore } from "react";

export interface RecentItem {
	type: "organization" | "user";
	id: string;
	label: string;
	viewedAt: number;
}

const STORAGE_KEY = "admin:recently-viewed";
const CHANGE_EVENT = "admin:recently-viewed-change";
const MAX_ITEMS = 10;
const EMPTY: RecentItem[] = [];

let cachedRaw: string | null = null;
let cachedItems: RecentItem[] = EMPTY;

function isRecentItem(value: unknown): value is RecentItem {
	if (!value || typeof value !== "object") {
		return false;
	}
	const item = value as Record<string, unknown>;
	return (
		(item.type === "organization" || item.type === "user") &&
		typeof item.id === "string" &&
		typeof item.label === "string" &&
		typeof item.viewedAt === "number"
	);
}

function readItems(): RecentItem[] {
	let raw: string | null = null;
	try {
		raw = window.localStorage.getItem(STORAGE_KEY);
	} catch {
		return EMPTY;
	}
	if (raw === cachedRaw) {
		return cachedItems;
	}
	cachedRaw = raw;
	try {
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		cachedItems = Array.isArray(parsed) ? parsed.filter(isRecentItem) : EMPTY;
	} catch {
		cachedItems = EMPTY;
	}
	return cachedItems;
}

function subscribe(onChange: () => void) {
	window.addEventListener("storage", onChange);
	window.addEventListener(CHANGE_EVENT, onChange);
	return () => {
		window.removeEventListener("storage", onChange);
		window.removeEventListener(CHANGE_EVENT, onChange);
	};
}

export function recordRecentlyViewed(item: Omit<RecentItem, "viewedAt">) {
	const next = [
		{ ...item, viewedAt: Date.now() },
		...readItems().filter((i) => !(i.type === item.type && i.id === item.id)),
	].slice(0, MAX_ITEMS);
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		return;
	}
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearRecentlyViewed() {
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		return;
	}
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Organizations and users this browser opened last, newest first. */
export function useRecentlyViewed(): RecentItem[] {
	return useSyncExternalStore(subscribe, readItems, () => EMPTY);
}

/** Records a detail-page visit. Renders nothing. */
export function RecordRecentlyViewed({
	type,
	id,
	label,
}: Omit<RecentItem, "viewedAt">) {
	useEffect(() => {
		recordRecentlyViewed({ type, id, label });
	}, [type, id, label]);
	return null;
}
