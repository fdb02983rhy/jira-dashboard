import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { humanDate } from "@/lib/dates";
import type { Activity } from "@/types";

interface ActivityFeedProps {
	activities: Activity[];
}

const CATEGORY_COLORS: Record<Activity["fieldCategory"], string> = {
	status: "bg-blue-500",
	assignee: "bg-purple-500",
	date: "bg-orange-500",
	comment: "bg-green-500",
	other: "bg-gray-400",
};

const CATEGORY_BADGE_CLASSES: Record<Activity["fieldCategory"], string> = {
	status: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
	assignee:
		"bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
	date: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
	comment: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
	other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;

	return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function buildChangeDescription(a: Activity): string {
	if (a.fieldCategory === "comment") {
		return "commented";
	}

	if (a.fieldCategory === "status") {
		const from = a.from && a.from !== "(none)" ? a.from : null;
		const to = a.to || "unknown";
		return from
			? `${a.field}: ${from} \u2192 ${to}`
			: `${a.field}: \u2192 ${to}`;
	}

	if (a.fieldCategory === "date") {
		const val = humanDate(a.to);
		return `${a.field}: ${val}`;
	}

	if (a.fieldCategory === "assignee") {
		const to = a.to && a.to !== "(none)" ? a.to : "Unassigned";
		return `${a.field}: \u2192 ${to}`;
	}

	// other
	const from = a.from || "unset";
	const to = a.to || "unset";
	return `${a.field}: ${from} \u2192 ${to}`;
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
	const sorted = useMemo(
		() =>
			[...activities]
				.sort(
					(a, b) =>
						new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
				)
				.slice(0, 100),
		[activities],
	);

	return (
		<div className="flex flex-col rounded-xl bg-card ring-1 ring-foreground/10">
			<div className="flex items-center justify-between px-4 py-3 border-b">
				<h3 className="text-sm font-medium">Activity Feed</h3>
				<span className="text-xs text-muted-foreground">
					{activities.length} {activities.length === 1 ? "item" : "items"}
				</span>
			</div>

			{sorted.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<span className="text-3xl mb-2">&#9729;</span>
					<p className="text-sm font-medium">No activity</p>
					<p className="text-xs">No tracked changes found for this period</p>
				</div>
			) : (
				<div className="overflow-y-auto max-h-[600px] scrollbar-thin">
					{sorted.map((a) => (
						<div
							key={a.id}
							className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors"
						>
							<div className="mt-1.5 shrink-0">
								<div
									className={`h-2.5 w-2.5 rounded-full ${CATEGORY_COLORS[a.fieldCategory]}`}
								/>
							</div>

							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-sm font-medium truncate">
										{a.issueKey}
									</span>
									<span className="text-xs text-muted-foreground truncate">
										{a.issueSummary}
									</span>
								</div>

								<p className="text-xs text-foreground/80 mt-0.5">
									{buildChangeDescription(a)}
								</p>

								<div className="flex items-center gap-2 mt-1.5 flex-wrap">
									<Badge
										className={`border-0 ${CATEGORY_BADGE_CLASSES[a.fieldCategory]}`}
									>
										{a.fieldCategory}
									</Badge>
									<span className="text-xs text-muted-foreground">
										{a.author}
									</span>
									<span className="text-xs text-muted-foreground">
										{formatRelativeTime(new Date(a.timestamp))}
									</span>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
