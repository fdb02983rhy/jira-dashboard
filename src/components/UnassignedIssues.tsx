import { ChevronRight, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { fetchUnassignedIssues } from "@/lib/jira";
import { useAppState } from "@/state/store";
import type { UnassignedIssue, UnassignedTreeNode } from "@/types";

// ── Helpers ──────────────────────────────────────────────────

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

function buildUnassignedTree(issues: UnassignedIssue[]): UnassignedTreeNode[] {
	const issueMap = new Map<string, UnassignedIssue>();
	for (const issue of issues) {
		issueMap.set(issue.key, issue);
	}

	const childrenMap = new Map<string, UnassignedIssue[]>();
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

	function toNode(issue: UnassignedIssue): UnassignedTreeNode {
		const children = (childrenMap.get(issue.key) || []).map(toNode);
		return {
			key: issue.key,
			summary: issue.summary,
			type: normalizeType(issue.type),
			status: issue.status,
			isContext: !!issue.is_context,
			children,
		};
	}

	return roots.map(toNode);
}

function countNodes(nodes: UnassignedTreeNode[]): number {
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

// ── Component ────────────────────────────────────────────────

export function UnassignedIssues() {
	const { selectedProject } = useAppState();
	const [issues, setIssues] = useState<UnassignedIssue[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!selectedProject) {
			setIssues([]);
			return;
		}

		let cancelled = false;
		setLoading(true);

		fetchUnassignedIssues(selectedProject)
			.then((result) => {
				if (!cancelled) setIssues(result);
			})
			.catch((e: unknown) => {
				console.warn("[UnassignedIssues] fetch failed:", e);
				if (!cancelled) setIssues([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [selectedProject]);

	const tree = useMemo(() => buildUnassignedTree(issues), [issues]);
	const nodeCount = useMemo(() => countNodes(tree), [tree]);

	return (
		<div className="rounded-xl border bg-card p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<UserX className="size-4 text-muted-foreground" />
					<h2 className="text-sm font-semibold">Unassigned Issues</h2>
				</div>
				<Badge variant="secondary" className="tabular-nums">
					{nodeCount}
				</Badge>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-8 text-muted-foreground">
					<span className="text-xs">Loading unassigned issues...</span>
				</div>
			) : tree.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
					<span className="mb-2 text-2xl">&#10003;</span>
					<h3 className="text-sm font-medium">No unassigned issues</h3>
					<p className="text-xs">All open issues have an assignee</p>
				</div>
			) : (
				<div className="space-y-0.5">
					{tree.map((node) => (
						<UnassignedNodeRow key={node.key} node={node} depth={0} />
					))}
				</div>
			)}
		</div>
	);
}

// ── Recursive tree node ──────────────────────────────────────

function UnassignedNodeRow({
	node,
	depth,
}: {
	node: UnassignedTreeNode;
	depth: number;
}) {
	const [open, setOpen] = useState(node.isContext);
	const hasChildren = node.children.length > 0;
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
					<ChevronRight
						className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${
							hasChildren ? "" : "invisible"
						} ${open ? "rotate-90" : ""}`}
					/>

					<span
						className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${typeClass}`}
					>
						{node.type === "subtask" ? "sub" : node.type}
					</span>

					<span className="shrink-0 text-xs font-medium text-muted-foreground">
						{node.key}
					</span>

					<span className="min-w-0 flex-1 truncate text-xs">
						{node.summary}
					</span>

					{node.status && (
						<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
							{node.status}
						</span>
					)}
				</CollapsibleTrigger>

				{hasChildren && (
					<CollapsibleContent>
						<div className="space-y-0.5">
							{node.children.map((child) => (
								<UnassignedNodeRow
									key={child.key}
									node={child}
									depth={depth + 1}
								/>
							))}
						</div>
					</CollapsibleContent>
				)}
			</div>
		</Collapsible>
	);
}
