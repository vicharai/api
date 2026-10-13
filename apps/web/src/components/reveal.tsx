"use client";

import { useEffect } from "react";

/**
 * Adds `.is-visible` to every `.reveal` element as it scrolls into view.
 * No-op when the user prefers reduced motion (CSS keeps them visible then).
 */
export function Reveal() {
	useEffect(() => {
		const els = document.querySelectorAll<HTMLElement>(".reveal");
		if (!("IntersectionObserver" in window)) {
			els.forEach((el) => el.classList.add("is-visible"));
			return;
		}
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.classList.add("is-visible");
						io.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0.08 },
		);
		els.forEach((el) => io.observe(el));
		return () => io.disconnect();
	}, []);
	return null;
}
