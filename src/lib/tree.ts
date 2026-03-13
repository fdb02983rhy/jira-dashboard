import type { IssueMapEntry, TreeNode } from "@/types";

// ─── Build Epic > Task > Subtask Tree ───────────────

export function buildTree(issueMap: Record<string, IssueMapEntry>): TreeNode[] {
	const issues = Object.values(issueMap).filter((i) => i.changes.length > 0);
	const childrenMap: Record<string, IssueMapEntry[]> = {};

	// Group by parent
	issues.forEach((i) => {
		if (i.parentKey && issueMap[i.parentKey]) {
			if (!childrenMap[i.parentKey]) childrenMap[i.parentKey] = [];
			childrenMap[i.parentKey]?.push(i);
		}
	});

	// Find roots (issues without parents in our set, or epics)
	const roots: IssueMapEntry[] = [];
	issues.forEach((i) => {
		const isChildOfSomeone = issues.some((other) => {
			const kids = childrenMap[other.key] || [];
			return kids.includes(i);
		});
		if (!isChildOfSomeone) roots.push(i);
	});

	function toTreeNode(entry: IssueMapEntry): TreeNode {
		const children = (childrenMap[entry.key] || [])
			.filter((c) => c.changes.length > 0)
			.map(toTreeNode);

		return {
			key: entry.key,
			summary: entry.summary,
			type: normalizeType(entry.type),
			status: entry.status,
			changes: entry.changes,
			children,
		};
	}

	return roots.map(toTreeNode);
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

// ─── Filter Tree by Member ──────────────────────────

export function filterTreeByMember(
	nodes: TreeNode[],
	member: string,
): TreeNode[] {
	return nodes
		.map((node) => filterNode(node, member))
		.filter((n): n is TreeNode => n !== null);
}

function filterNode(node: TreeNode, member: string): TreeNode | null {
	const memberChanges = node.changes.filter((c) => c.author === member);
	const filteredChildren = (node.children || [])
		.map((c) => filterNode(c, member))
		.filter((n): n is TreeNode => n !== null);

	if (memberChanges.length === 0 && filteredChildren.length === 0) return null;

	return { ...node, changes: memberChanges, children: filteredChildren };
}

// ─── Filter Tree by Categories ─────────────────────

export function filterTreeByCategories(
	nodes: TreeNode[],
	categories: Set<string>,
): TreeNode[] {
	return nodes
		.map((node) => filterNodeByCategories(node, categories))
		.filter((n): n is TreeNode => n !== null);
}

function filterNodeByCategories(
	node: TreeNode,
	categories: Set<string>,
): TreeNode | null {
	const catChanges = node.changes.filter((c) =>
		categories.has(c.fieldCategory),
	);
	const filteredChildren = (node.children || [])
		.map((c) => filterNodeByCategories(c, categories))
		.filter((n): n is TreeNode => n !== null);

	if (catChanges.length === 0 && filteredChildren.length === 0) return null;

	return { ...node, changes: catChanges, children: filteredChildren };
}

// ─── Count Tree Nodes ───────────────────────────────

export function countTreeNodes(nodes: TreeNode[]): number {
	return nodes.reduce(
		(sum, n) => sum + 1 + countTreeNodes(n.children || []),
		0,
	);
}
