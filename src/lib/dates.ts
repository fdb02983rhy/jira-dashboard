import type { DateRange } from "@/types";

// ─── Format Date for Display ────────────────────────

const SHORT_MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

export function formatDate(d: Date): string {
	return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ─── Get Date Range from Period ─────────────────────

export function getDateRange(
	period: "daily" | "weekly" | "monthly",
	currentDate: Date,
): DateRange {
	const d = new Date(currentDate);
	let start: Date;
	let end: Date;

	if (period === "daily") {
		start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
	} else if (period === "weekly") {
		const day = d.getDay();
		start = new Date(d);
		start.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
		start.setHours(0, 0, 0, 0);
		end = new Date(start);
		end.setDate(start.getDate() + 6);
		end.setHours(23, 59, 59, 999);
	} else {
		// monthly
		start = new Date(d.getFullYear(), d.getMonth(), 1);
		end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
	}

	return { start, end };
}

// ─── Human-Readable Date from Jira Formats ──────────

export function humanDate(str: string | null | undefined): string {
	if (!str || str === "(none)") return "unset";

	// Handle "2026-03-12 00:00:00.0" or "1/Mar/25" or ISO formats
	try {
		const d = new Date(
			str.replace(
				/(\d+)\/(\w+)\/(\d+)/,
				(_, day, mon, y) => `${mon} ${day}, ${y.length === 2 ? `20${y}` : y}`,
			),
		);
		if (!Number.isNaN(d.getTime())) {
			return d.toLocaleDateString([], {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		}
	} catch {
		// fall through
	}

	// Strip time portion from "2026-03-12 00:00:00.0"
	const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
	if (m) {
		const d = new Date(`${m[1]}T00:00:00`);
		if (!Number.isNaN(d.getTime())) {
			return d.toLocaleDateString([], {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		}
	}

	return str;
}

// ─── Navigate Date by Delta Periods ─────────────────

export function navigateDate(
	currentDate: Date,
	period: "daily" | "weekly" | "monthly",
	delta: number,
): Date {
	const d = new Date(currentDate);
	if (period === "daily") {
		d.setDate(d.getDate() + delta);
	} else if (period === "weekly") {
		d.setDate(d.getDate() + 7 * delta);
	} else {
		d.setMonth(d.getMonth() + delta);
	}
	return d;
}
