import type { IssueMapEntry, TreeNode } from "@/types";

// ─── Build Epic > Task > Subtask Tree ───────────────

export function buildTree(issueMap: Record<string, IssueMapEntry>): TreeNode[] {
	const issues = Object.values(issueMap).filter((i) => i.changes.length > 0);
	const childrenMap: Record<string, IssueMapEntry[]> = {};

	// Group by parent — link to any parent in issueMap (including ones without changes)
	issues.forEach((i) => {
		if (i.parentKey && issueMap[i.parentKey]) {
			if (!childrenMap[i.parentKey]) childrenMap[i.parentKey] = [];
			childrenMap[i.parentKey]?.push(i);
		}
	});

	// Walk up from each active issue to its top ancestor in issueMap
	// Include ancestors as context nodes even if they have no changes
	const includedKeys = new Set(issues.map((i) => i.key));
	for (const issue of issues) {
		let current = issue;
		while (current.parentKey && issueMap[current.parentKey]) {
			const parent = issueMap[current.parentKey];
			if (!parent) break;
			if (!includedKeys.has(parent.key)) {
				includedKeys.add(parent.key);
				// Ensure parent appears in childrenMap if it has active descendants
				if (parent.parentKey && issueMap[parent.parentKey]) {
					if (!childrenMap[parent.parentKey])
						childrenMap[parent.parentKey] = [];
					if (
						!childrenMap[parent.parentKey]?.some((c) => c.key === parent.key)
					) {
						childrenMap[parent.parentKey]?.push(parent);
					}
				}
			}
			current = parent;
		}
	}

	// Find roots — included issues that aren't a child of another included issue
	const childKeySet = new Set(
		Object.values(childrenMap)
			.flat()
			.map((i) => i.key),
	);
	const allIncluded = [...includedKeys]
		.map((k) => issueMap[k])
		.filter((i): i is IssueMapEntry => !!i);
	const roots = allIncluded.filter((i) => !childKeySet.has(i.key));

	function toTreeNode(entry: IssueMapEntry): TreeNode {
		const children = (childrenMap[entry.key] || [])
			.filter((c) => includedKeys.has(c.key))
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
