import { Clock, Loader2, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
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

function ChartTooltipContent({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: { value: number }[];
	label?: string;
}) {
	if (!active || !payload?.length) return null;
	return (
		<div className="rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md">
			<p className="font-medium">{label}</p>
			<p className="tabular-nums text-muted-foreground">
				{payload[0]?.value} changes
			</p>
		</div>
	);
}

function ActivityByDayChart({ activities }: { activities: Activity[] }) {
	const state = useAppState();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const dailyCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const a of activities) {
			const dateStr = a.timestamp.toISOString().split("T")[0] as string;
			counts.set(dateStr, (counts.get(dateStr) || 0) + 1);
		}

		const range = getDateRange(state.period, state.currentDate);
		const result: { date: string; count: number; day: string }[] = [];
		const d = new Date(range.start);
		while (d <= range.end) {
			const dateStr = d.toISOString().split("T")[0] as string;
			result.push({
				date: dateStr,
				count: counts.get(dateStr) || 0,
				day: `${d.getMonth() + 1}/${d.getDate()}`,
			});
			d.setDate(d.getDate() + 1);
		}
		return result;
	}, [activities, state.period, state.currentDate]);

	const totalCount = dailyCounts.reduce((sum, d) => sum + d.count, 0);
	const isSingleDay = dailyCounts.length <= 1;

	// Show tick every 7 days for monthly, every day for weekly
	const tickInterval =
		dailyCounts.length > 14 ? 6 : dailyCounts.length > 7 ? 2 : 0;

	return (
		<Card className="flex flex-col">
			<CardContent className="flex flex-1 flex-col">
				<div className="mb-3 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<TrendingUp className="size-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold">Activity by Day</h3>
					</div>
					<span className="text-xs tabular-nums text-muted-foreground">
						{totalCount} total
					</span>
				</div>

				{!mounted ? (
					<div className="h-[240px]" />
				) : isSingleDay ? (
					<div className="flex flex-1 flex-col items-center justify-center py-6">
						<span className="text-4xl font-bold tracking-tight">
							{dailyCounts[0]?.count ?? 0}
						</span>
						<span className="text-xs text-muted-foreground">changes today</span>
					</div>
				) : (
					<div>
						<ResponsiveContainer width="100%" height={240}>
							<BarChart
								data={dailyCounts}
								margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									vertical={false}
									stroke="var(--color-muted)"
									strokeOpacity={0.5}
								/>
								<XAxis
									dataKey="day"
									tick={{
										fontSize: 10,
										fill: "var(--color-muted-foreground)",
									}}
									tickLine={false}
									axisLine={false}
									interval={tickInterval}
								/>
								<YAxis
									tick={{
										fontSize: 10,
										fill: "var(--color-muted-foreground)",
									}}
									tickLine={false}
									axisLine={false}
									allowDecimals={false}
								/>
								<Tooltip
									content={<ChartTooltipContent />}
									cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
								/>
								<Bar
									dataKey="count"
									fill="var(--color-primary)"
									opacity={0.8}
									radius={[3, 3, 0, 0]}
								/>
							</BarChart>
						</ResponsiveContainer>
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
	const [error, setError] = useState<string | null>(null);

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
		setError(null);

		fetchStaleCounts(state.selectedProject, beforeDate)
			.then((result) => {
				if (!cancelled) setCounts(result);
			})
			.catch((e: unknown) => {
				console.warn("[StaleCounts] fetch failed:", e);
				if (!cancelled) {
					setCounts([]);
					setError(
						e instanceof Error ? e.message : "Failed to load stale counts",
					);
				}
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
			) : error ? (
				<div className="flex flex-col items-center justify-center py-6 text-center text-destructive">
					<p className="text-xs">{error}</p>
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
