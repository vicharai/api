import type { ReactNode } from "react";

// Section navigation lives in the sidebar's settings mode; this only keeps
// forms at a comfortable reading width.
export default function SettingsLayout({ children }: { children: ReactNode }) {
	return <div className="w-full max-w-3xl">{children}</div>;
}
