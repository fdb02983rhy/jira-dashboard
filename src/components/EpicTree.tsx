import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { countTreeNodes } from "@/lib/tree";
import type { TreeNode } from "@/types";

// ── Badge color map ─────────────────────────────────────────

const typeBadgeClasses: Record<TreeNode["type"], string> = {
	epic: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
	task: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
	subtask: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
	story: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
	bug: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const changeDotClasses: Record<string, string> = {
	status: "bg-blue-500",
	assignee: "bg-purple-500",
	date: "bg-orange-500",
	comment: "bg-green-500",
	other: "bg-gray-400",
};

// ── Props ───────────────────────────────────────────────────

interface EpicTreeProps {
	issueTree: TreeNode[];
}

// ── Component ───────────────────────────────────────────────

export function EpicTree({ issueTree }: EpicTreeProps) {
	const nodeCount = useMemo(() => countTreeNodes(issueTree), [issueTree]);

	return (
		<div className="rounded-xl border bg-card p-4">
			<div className="mb-3 flex items-center justify-between">
				<h2 className="text-sm font-semibold">Changed Issues</h2>
				<Badge variant="secondary" className="tabular-nums">
					{nodeCount}
				</Badge>
			</div>

			{issueTree.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
					<span className="mb-2 text-3xl">&#9776;</span>
					<h3 className="text-sm font-medium">No changed issues</h3>
					<p className="text-xs">
						Issues with changes in this period will appear here
					</p>
				</div>
			) : (
				<div className="space-y-0.5">
					{issueTree.map((node) => (
						<TreeNodeRow key={node.key} node={node} depth={0} />
					))}
				</div>
			)}
		</div>
	);
}

// ── Recursive tree node ─────────────────────────────────────

function TreeNodeRow({ node, depth }: { node: TreeNode; depth: number }) {
	const [open, setOpen] = useState(false);
	const hasChildren = node.children.length > 0;
	const hasChanges = node.changes.length > 0;
	const expandable = hasChildren || hasChanges;

	const changeCategories = useMemo(
		() => [...new Set(node.changes.map((c) => c.fieldCategory))],
		[node.changes],
	);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div style={{ paddingLeft: `${depth * 20}px` }}>
				<CollapsibleTrigger
					className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
					disabled={!expandable}
				>
					{/* Chevron */}
					<ChevronRight
						className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${
							expandable ? "" : "invisible"
						} ${open ? "rotate-90" : ""}`}
					/>

					{/* Type badge */}
					<span
						className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${typeBadgeClasses[node.type]}`}
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

					{/* Change category dots */}
					<span className="flex shrink-0 items-center gap-0.5">
						{changeCategories.map((cat) => (
							<span
								key={cat}
								className={`size-1.5 rounded-full ${changeDotClasses[cat] || changeDotClasses.other}`}
								title={cat}
							/>
						))}
					</span>
				</CollapsibleTrigger>

				<CollapsibleContent>
					{/* Change detail rows */}
					{hasChanges && (
						<div className="ml-5 mt-0.5 space-y-0.5 border-l border-border pl-4 pb-1">
							{node.changes.map((c) => {
								let text: string;
								if (c.fieldCategory === "comment") {
									const t =
										c.to && c.to !== "Comment added" ? c.to : "Added a comment";
									text = `"${t}"`;
								} else if (c.fieldCategory === "status") {
									text = `${c.from || "unset"} \u2192 ${c.to || "unset"}`;
								} else if (c.fieldCategory === "assignee") {
									text = `\u2192 ${c.to && c.to !== "(none)" ? c.to : "Unassigned"}`;
								} else if (c.fieldCategory === "date") {
									const fieldName = c.field === "Due Date" ? "Due" : "Start";
									text = `${fieldName}: ${c.to}`;
								} else {
									text = `${c.from || "unset"} \u2192 ${c.to || "unset"}`;
								}

								const timeStr = new Date(c.timestamp).toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
								});

								return (
									<div key={c.id} className="flex items-baseline gap-2 text-xs">
										<span
											className={`inline-flex shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${changeDotClasses[c.fieldCategory] ? `${changeDotClasses[c.fieldCategory]}/15 text-foreground` : "bg-muted text-muted-foreground"}`}
										>
											{c.fieldCategory}
										</span>
										<span
											className={`min-w-0 flex-1 text-muted-foreground ${c.fieldCategory === "comment" ? "break-words" : "truncate"}`}
										>
											{text}
										</span>
										<span className="shrink-0 text-[10px] text-muted-foreground/70">
											{c.author} &middot; {timeStr}
										</span>
									</div>
								);
							})}
						</div>
					)}

					{/* Recursive children */}
					{hasChildren && (
						<div className="space-y-0.5">
							{node.children.map((child) => (
								<TreeNodeRow key={child.key} node={child} depth={depth + 1} />
							))}
						</div>
					)}
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}
