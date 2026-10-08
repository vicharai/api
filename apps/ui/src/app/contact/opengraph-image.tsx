import { ogContentType, ogImage, ogSize } from "@/lib/og";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Contact the Vichar team";

export default function Image() {
	return ogImage({
		eyebrow: "Contact",
		title: "Talk to the Vichar Team",
		subtitle:
			"Email support, the Discord community, GitHub issues, and enterprise sales — pick the channel that fits.",
	});
}
