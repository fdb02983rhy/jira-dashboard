import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
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
	if (!name.trim()) return "?";
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => w[0] ?? "")
		.filter(Boolean)
		.join("")
		.substring(0, 2)
		.toUpperCase();
}
