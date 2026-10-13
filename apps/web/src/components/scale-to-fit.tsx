"use client";

import { useEffect, useRef, useState } from "react";

import type { ReactNode } from "react";

/** Renders children on a fixed-size canvas, scaled down to the container width. */
export function ScaleToFit({
	width,
	height,
	children,
	className = "",
}: {
	width: number;
	height: number;
	children: ReactNode;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		const ro = new ResizeObserver(([entry]) =>
			setScale(Math.min(1, entry.contentRect.width / width)),
		);
		ro.observe(el);
		return () => ro.disconnect();
	}, [width]);

	return (
		<div
			ref={ref}
			className={`relative w-full overflow-hidden ${className}`}
			style={{ aspectRatio: `${width} / ${height}` }}
		>
			<div
				className="absolute left-0 top-0 origin-top-left"
				style={{ width, transform: `scale(${scale})` }}
			>
				{children}
			</div>
		</div>
	);
}
