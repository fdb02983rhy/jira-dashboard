import { AlertCircle, ChevronRight, Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getDateRange } from "@/lib/dates";
import { fetchStaleIssues } from "@/lib/jira";
import { useAppState } from "@/state/store";
import type { StaleIssue, StaleTreeNode, TreeNode } from "@/types";

// ── Helpers ──────────────────────────────────────────────────

function formatTimeAgo(updatedMs: number): string {
	const diffMs = Date.now() - updatedMs;
	const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	if (days === 0) return "today";
	if (days === 1) return "1 day ago";
	if (days < 30) return `${days} days ago`;
	const months = Math.floor(days / 30);
	if (months === 1) return "1 month ago";
	if (months < 12) return `${months} months ago`;
	const years = Math.floor(months / 12);
	return years === 1 ? "1 year ago" : `${years} years ago`;
}

function normalizeType(
	type: string,
): "epic" | "task" | "subtask" | "story" | "bug" {
	const t = type.toLowerCase();
	if (t.includes("epic")) return "epic";
	if (t.includes("sub")) return "subtask";
	if (t.includes("story")) return "story";
	if (t.includes("bug")) return "bug";
	return "task";
}

function buildStaleTree(issues: StaleIssue[]): StaleTreeNode[] {
	const issueMap = new Map<string, StaleIssue>();
	for (const issue of issues) {
		issueMap.set(issue.key, issue);
	}

	const childrenMap = new Map<string, StaleIssue[]>();
	for (const issue of issues) {
		if (issue.parent_key && issueMap.has(issue.parent_key)) {
			const children = childrenMap.get(issue.parent_key) || [];
			children.push(issue);
			childrenMap.set(issue.parent_key, children);
		}
	}

	const childKeySet = new Set(
		[...childrenMap.values()].flat().map((i) => i.key),
	);
	const roots = issues.filter((i) => !childKeySet.has(i.key));

	function toNode(issue: StaleIssue): StaleTreeNode {
		const children = (childrenMap.get(issue.key) || []).map(toNode);
		const isContext = !!issue.is_context;
		// For stale issues, use the oldest updated time among children for sorting
		const oldestChild = children.reduce(
			(min, c) => Math.min(min, c.updated),
			issue.updated,
		);
		return {
			key: issue.key,
			summary: issue.summary,
			type: normalizeType(issue.type),
			status: issue.status,
			updated: isContext ? oldestChild : issue.updated,
			isContext,
			children,
		};
	}

	return roots.map(toNode).sort((a, b) => a.updated - b.updated);
}

function countNodes(nodes: StaleTreeNode[]): number {
	return nodes.reduce(
		(sum, n) => sum + (n.isContext ? 0 : 1) + countNodes(n.children),
		0,
	);
}

// ── Badge classes ────────────────────────────────────────────

const typeBadgeClasses: Record<string, string> = {
	epic: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
	task: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
	subtask: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
	story: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
	bug: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

// ── Collect keys from changed issues tree ────────────────────

function collectTreeKeys(nodes: TreeNode[], out: Set<string>): Set<string> {
	for (const n of nodes) {
		out.add(n.key);
		if (n.children.length > 0) collectTreeKeys(n.children, out);
	}
	return out;
}

// ── Component ────────────────────────────────────────────────

interface StaleIssuesProps {
	activeIssueKeys: TreeNode[];
}

export function StaleIssues({ activeIssueKeys }: StaleIssuesProps) {
	const state = useAppState();
	const [issues, setIssues] = useState<StaleIssue[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { selectedProject, selectedMember, period, currentDate } = state;

	const activeKeys = useMemo(
		() => collectTreeKeys(activeIssueKeys, new Set<string>()),
		[activeIssueKeys],
	);

	const beforeDate = useMemo(() => {
		const range = getDateRange(period, currentDate);
		return range.start.toISOString().split("T")[0] as string;
	}, [period, currentDate]);

	useEffect(() => {
		if (!selectedProject || !selectedMember) {
			setIssues([]);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		fetchStaleIssues(selectedProject, selectedMember, beforeDate)
			.then((result) => {
				if (!cancelled) setIssues(result);
			})
			.catch((e: unknown) => {
				console.warn("[StaleIssues] fetch failed:", e);
				if (!cancelled) {
					setIssues([]);
					setError(
						e instanceof Error ? e.message : "Failed to load stale issues",
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [selectedProject, selectedMember, beforeDate]);

	// Filter out issues that have activity in the current range
	const filteredIssues = useMemo(
		() => issues.filter((i) => !activeKeys.has(i.key) || i.is_context),
		[issues, activeKeys],
	);

	const tree = useMemo(() => buildStaleTree(filteredIssues), [filteredIssues]);
	const nodeCount = useMemo(() => countNodes(tree), [tree]);

	if (!selectedMember) return null;

	return (
		<div className="rounded-xl border bg-card p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Clock className="size-4 text-muted-foreground" />
					<h2 className="text-sm font-semibold">Stale Issues</h2>
				</div>
				<Badge variant="secondary" className="tabular-nums">
					{nodeCount}
				</Badge>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-8 text-muted-foreground">
					<span className="text-xs">Loading stale issues...</span>
				</div>
			) : error ? (
				<div className="flex flex-col items-center justify-center py-8 text-center text-destructive">
					<p className="text-xs">{error}</p>
				</div>
			) : tree.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
					<span className="mb-2 text-2xl">&#10003;</span>
					<h3 className="text-sm font-medium">No stale issues</h3>
					<p className="text-xs">All assigned issues have recent activity</p>
				</div>
			) : (
				<div className="space-y-0.5">
					{tree.map((node) => (
						<StaleNodeRow key={node.key} node={node} depth={0} />
					))}
				</div>
			)}
		</div>
	);
}

// ── Recursive tree node ──────────────────────────────────────

function StaleNodeRow({ node, depth }: { node: StaleTreeNode; depth: number }) {
	// Context parents start expanded so you can see their stale children
	const [open, setOpen] = useState(node.isContext);
	const hasChildren = node.children.length > 0;

	const days = Math.floor((Date.now() - node.updated) / (1000 * 60 * 60 * 24));
	const isUrgent = !node.isContext && days > 14;
	const timeAgo = formatTimeAgo(node.updated);
	const typeClass = typeBadgeClasses[node.type] || typeBadgeClasses.task;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div style={{ paddingLeft: `${depth * 20}px` }}>
				<CollapsibleTrigger
					className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 ${
						node.isContext ? "opacity-60" : ""
					}`}
					disabled={!hasChildren}
				>
					{/* Chevron */}
					<ChevronRight
						className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${
							hasChildren ? "" : "invisible"
						} ${open ? "rotate-90" : ""}`}
					/>

					{/* Urgent icon */}
					{isUrgent && (
						<AlertCircle className="size-3.5 shrink-0 text-orange-500" />
					)}

					{/* Type badge */}
					<span
						className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${typeClass}`}
					>
						{node.type === "subtask" ? "sub" : node.type}
					</span>

					{/* Key */}
					<span className="shrink-0 text-xs font-medium text-muted-foreground">
						{node.key}
					</span>

					{/* Summary */}
					<span className="min-w-0 flex-1 truncate text-xs">
						{node.summary}
					</span>

					{/* Status */}
					{node.status && (
						<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
							{node.status}
						</span>
					)}

					{/* Time ago — only show for actual stale issues */}
					{!node.isContext && (
						<span
							className={`shrink-0 text-[10px] ${
								isUrgent
									? "font-medium text-orange-600 dark:text-orange-400"
									: "text-muted-foreground"
							}`}
						>
							{timeAgo}
						</span>
					)}
				</CollapsibleTrigger>

				{hasChildren && (
					<CollapsibleContent>
						<div className="space-y-0.5">
							{node.children.map((child) => (
								<StaleNodeRow key={child.key} node={child} depth={depth + 1} />
							))}
						</div>
					</CollapsibleContent>
				)}
			</div>
		</Collapsible>
	);
}
