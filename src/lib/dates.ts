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
	// Rolling windows: end = currentDate, start = currentDate - N days
	const end = new Date(
		currentDate.getFullYear(),
		currentDate.getMonth(),
		currentDate.getDate(),
		23,
		59,
		59,
		999,
	);

	let start: Date;
	if (period === "daily") {
		start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
	} else if (period === "weekly") {
		start = new Date(end);
		start.setDate(end.getDate() - 6);
		start.setHours(0, 0, 0, 0);
	} else {
		// monthly — last 30 days
		start = new Date(end);
		start.setDate(end.getDate() - 29);
		start.setHours(0, 0, 0, 0);
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
		d.setDate(d.getDate() + 30 * delta);
	}
	return d;
}
