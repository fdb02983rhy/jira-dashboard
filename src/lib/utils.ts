import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { AdfNode } from "@/types";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// ─── HTML Entity Escape ─────────────────────────────

export function escHtml(str: string | null | undefined): string {
	if (!str) return "";
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// ─── Atlassian Document Format → Plain Text ─────────

export function extractAdfText(
	node: AdfNode | string | null | undefined,
): string {
	if (!node) return "";
	if (typeof node === "string") return node;
	if (node.type === "text") return node.text || "";
	if (node.type === "date" && node.attrs?.timestamp) {
		const d = new Date(Number(node.attrs.timestamp));
		return Number.isNaN(d.getTime())
			? ""
			: d.toLocaleDateString([], {
					month: "short",
					day: "numeric",
					year: "numeric",
				});
	}
	if (node.type === "mention") return `@${node.attrs?.text || "someone"}`;
	if (node.type === "hardBreak") return " ";
	if (Array.isArray(node.content)) {
		return node.content.map(extractAdfText).join("");
	}
	return "";
}

// ─── Avatar Helpers ─────────────────────────────────

const avatarColors = [
	"#6366f1",
	"#ec4899",
	"#f59e0b",
	"#10b981",
	"#3b82f6",
	"#8b5cf6",
	"#ef4444",
	"#14b8a6",
	"#f97316",
	"#06b6d4",
];

export function getAvatarColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	// biome-ignore lint/style/noNonNullAssertion: array index is always in bounds
	return avatarColors[Math.abs(hash) % avatarColors.length]!;
}

export function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.map((w) => w[0])
		.join("")
		.substring(0, 2)
		.toUpperCase();
}
