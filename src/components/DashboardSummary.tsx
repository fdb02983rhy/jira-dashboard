import { Clock, Loader2, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { UnassignedIssues } from "@/components/UnassignedIssues";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getDateRange } from "@/lib/dates";
import { fetchStaleCounts } from "@/lib/jira";
import { useAppDispatch, useAppState } from "@/state/store";
import type { Activity, MemberCount } from "@/types";

// ── Props ───────────────────────────────────────────────────

interface DashboardSummaryProps {
	activities: Activity[];
	members: MemberCount[];
}

export function DashboardSummary({
	activities,
	members,
}: DashboardSummaryProps) {
	return (
		<div className="space-y-6">
			{/* Charts row */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<MemberActivityChart members={members} />
				<ActivityByDayChart activities={activities} />
			</div>

			{/* Stale counts */}
			<StaleCountsPanel />

			{/* Unassigned issues */}
			<UnassignedIssues />
		</div>
	);
}

// ── Member Activity Chart ───────────────────────────────────

function MemberActivityChart({ members }: { members: MemberCount[] }) {
	const dispatch = useAppDispatch();
	const maxCount = Math.max(...members.map((m) => m.count), 1);

	// Only show members with activity, plus up to 5 without
	const activeMembers = members.filter((m) => m.count > 0);
	const inactiveMembers = members.filter((m) => m.count === 0).slice(0, 5);
	const displayMembers = [...activeMembers, ...inactiveMembers];

	return (
		<Card>
			<CardContent>
				<div className="mb-3 flex items-center gap-2">
					<Users className="size-4 text-muted-foreground" />
					<h3 className="text-sm font-semibold">Member Activity</h3>
				</div>

				{displayMembers.length === 0 ? (
					<p className="py-4 text-center text-xs text-muted-foreground">
						No activity data
					</p>
				) : (
					<div className="space-y-1.5">
						{displayMembers.map((m) => (
							<button
								key={m.name}
								type="button"
								className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-muted/60"
								onClick={() =>
									dispatch({
										type: "SET_SELECTED_MEMBER",
										payload: m.name,
									})
								}
							>
								<span className="w-28 shrink-0 truncate text-xs">{m.name}</span>
								<div className="flex-1">
									<div
										className="h-4 rounded-sm bg-primary/70 transition-all"
										style={{
											width: `${(m.count / maxCount) * 100}%`,
											minWidth: m.count > 0 ? "4px" : "0px",
										}}
									/>
								</div>
								<span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
									{m.count}
								</span>
							</button>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ── Activity By Day Chart ───────────────────────────────────

function ActivityByDayChart({ activities }: { activities: Activity[] }) {
	const state = useAppState();

	const dailyCounts = useMemo(() => {
		// Group activities by date
		const counts = new Map<string, number>();
		for (const a of activities) {
			const dateStr = a.timestamp.toISOString().split("T")[0] as string;
			counts.set(dateStr, (counts.get(dateStr) || 0) + 1);
		}

		// Fill in all dates in the range
		const range = getDateRange(state.period, state.currentDate);
		const result: { date: string; count: number }[] = [];
		const d = new Date(range.start);
		while (d <= range.end) {
			const dateStr = d.toISOString().split("T")[0] as string;
			result.push({ date: dateStr, count: counts.get(dateStr) || 0 });
			d.setDate(d.getDate() + 1);
		}
		return result;
	}, [activities, state.period, state.currentDate]);

	const maxCount = Math.max(...dailyCounts.map((d) => d.count), 1);
	const isSingleDay = dailyCounts.length <= 1;

	return (
		<Card>
			<CardContent>
				<div className="mb-3 flex items-center gap-2">
					<TrendingUp className="size-4 text-muted-foreground" />
					<h3 className="text-sm font-semibold">Activity by Day</h3>
				</div>

				{isSingleDay ? (
					<div className="flex flex-col items-center justify-center py-6">
						<span className="text-4xl font-bold tracking-tight">
							{dailyCounts[0]?.count ?? 0}
						</span>
						<span className="text-xs text-muted-foreground">changes today</span>
					</div>
				) : (
					<div className="flex h-[150px] items-end gap-0.5">
						{dailyCounts.map((d) => (
							<div
								key={d.date}
								className="group relative flex flex-1 flex-col items-center justify-end"
							>
								{/* Count tooltip on hover */}
								<span className="mb-1 text-[9px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
									{d.count}
								</span>
								<div
									className="w-full rounded-t-sm bg-primary/50 transition-all group-hover:bg-primary/70"
									style={{
										height: `${(d.count / maxCount) * 100}%`,
										minHeight: d.count > 0 ? "2px" : "0px",
									}}
								/>
								{/* Date label — show for first, last, and every 7th */}
								{dailyCounts.length <= 7 ||
								d === dailyCounts[0] ||
								d === dailyCounts[dailyCounts.length - 1] ? (
									<span className="mt-1 text-[8px] text-muted-foreground">
										{d.date.slice(5)}
									</span>
								) : null}
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ── Stale Counts Panel ──────────────────────────────────────

function StaleCountsPanel() {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const [counts, setCounts] = useState<{ member: string; count: number }[]>([]);
	const [loading, setLoading] = useState(false);

	const beforeDate = useMemo(() => {
		const range = getDateRange(state.period, state.currentDate);
		return range.start.toISOString().split("T")[0] as string;
	}, [state.period, state.currentDate]);

	useEffect(() => {
		if (!state.selectedProject) {
			setCounts([]);
			return;
		}

		let cancelled = false;
		setLoading(true);

		fetchStaleCounts(state.selectedProject, beforeDate)
			.then((result) => {
				if (!cancelled) setCounts(result);
			})
			.catch((e: unknown) => {
				console.warn("[StaleCounts] fetch failed:", e);
				if (!cancelled) setCounts([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [state.selectedProject, beforeDate]);

	const totalStale = counts.reduce((sum, c) => sum + c.count, 0);

	return (
		<div className="rounded-xl border bg-card p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Clock className="size-4 text-muted-foreground" />
					<h2 className="text-sm font-semibold">Stale Issues by Member</h2>
				</div>
				<Badge variant="secondary" className="tabular-nums">
					{totalStale}
				</Badge>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-6 text-muted-foreground">
					<Loader2 className="mr-2 size-4 animate-spin" />
					<span className="text-xs">Loading stale counts...</span>
				</div>
			) : counts.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
					<span className="mb-2 text-2xl">&#10003;</span>
					<h3 className="text-sm font-medium">No stale issues</h3>
					<p className="text-xs">
						All assigned issues have been updated recently
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
					{counts.map((c) => (
						<button
							key={c.member}
							type="button"
							className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted/60"
							onClick={() =>
								dispatch({
									type: "SET_SELECTED_MEMBER",
									payload: c.member,
								})
							}
						>
							<span className="truncate text-xs">{c.member}</span>
							<Badge
								variant="secondary"
								className={`ml-2 tabular-nums ${
									c.count > 5
										? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
										: ""
								}`}
							>
								{c.count}
							</Badge>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
