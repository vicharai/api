import ipaddr from "ipaddr.js";
import { z } from "zod";

/** IP/CIDR rule matching shared by the api signup/login gates and the gateway. */

type IpRange = [ipaddr.IPv4 | ipaddr.IPv6, number];

function parseAddress(value: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
	if (ipaddr.IPv4.isValidFourPartDecimal(value)) {
		return ipaddr.IPv4.parse(value);
	}
	if (ipaddr.IPv6.isValid(value)) {
		return ipaddr.IPv6.parse(value);
	}
	return null;
}

function parseIpRule(rule: string): IpRange | null {
	const [address, bitsText, ...rest] = rule.trim().split("/");
	if (rest.length > 0 || !address) {
		return null;
	}
	const parsed = parseAddress(address);
	if (!parsed) {
		return null;
	}
	const maxBits = parsed.kind() === "ipv4" ? 32 : 128;
	if (bitsText === undefined) {
		return [parsed, maxBits];
	}
	if (!/^\d{1,3}$/.test(bitsText) || Number(bitsText) > maxBits) {
		return null;
	}
	return [parsed, Number(bitsText)];
}

export function isValidIpRule(rule: string): boolean {
	return parseIpRule(rule) !== null;
}

export const ipRuleSchema = z
	.string()
	.trim()
	.max(64)
	.refine(
		isValidIpRule,
		"Enter an IPv4/IPv6 address or CIDR range such as 203.0.113.0/24.",
	);

/** Canonical, deduped form of the given rules. Throws on an invalid rule. */
export function normalizeIpRules(rules: string[]): string[] {
	const normalized = rules.map((rule) => {
		const range = parseIpRule(rule);
		if (!range) {
			throw new Error(`Invalid IP rule: ${rule}`);
		}
		const [addr, bits] = range;
		const maxBits = addr.kind() === "ipv4" ? 32 : 128;
		return bits === maxBits ? addr.toString() : `${addr.toString()}/${bits}`;
	});
	return Array.from(new Set(normalized));
}

function rangeContains(range: IpRange, client: ipaddr.IPv4 | ipaddr.IPv6) {
	const [addr, bits] = range;
	if (addr.kind() === "ipv4" && client.kind() === "ipv4") {
		return (client as ipaddr.IPv4).match(addr as ipaddr.IPv4, bits);
	}
	if (addr.kind() === "ipv6" && client.kind() === "ipv6") {
		return (client as ipaddr.IPv6).match(addr as ipaddr.IPv6, bits);
	}
	return false;
}

/**
 * Whether `ip` falls in any rule. IPv4-mapped IPv6 clients are matched as
 * their IPv4 address; invalid rules never match.
 */
export function isIpBlocked(
	ip: string | null | undefined,
	rules: readonly string[],
): boolean {
	if (rules.length === 0) {
		return false;
	}
	const parsed = ip ? parseAddress(ip) : null;
	if (!parsed) {
		return false;
	}
	const client =
		parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()
			? (parsed as ipaddr.IPv6).toIPv4Address()
			: parsed;
	return rules.some((rule) => {
		const range = parseIpRule(rule);
		return range !== null && rangeContains(range, client);
	});
}
