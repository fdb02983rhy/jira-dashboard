import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { getDateRange } from "@/lib/dates";
import { fetchActivityData } from "@/lib/jira";
import { filterTreeByCategories, filterTreeByMember } from "@/lib/tree";
import { useAppDispatch, useAppState } from "@/state/store";
import type { MemberCount } from "@/types";

export function useActivities() {
	const state = useAppState();
	const dispatch = useAppDispatch();

	// Refs so refresh() always reads latest values without changing identity
	const projectRef = useRef(state.selectedProject);
	const periodRef = useRef(state.period);
	const dateRef = useRef(state.currentDate);
	const allMembersRef = useRef(state.allMembers);
	projectRef.current = state.selectedProject;
	periodRef.current = state.period;
	dateRef.current = state.currentDate;
	allMembersRef.current = state.allMembers;

	const refresh = useCallback(
		async (
			membersOverride?: Record<string, MemberCount>,
			options?: { force?: boolean },
		) => {
			if (!projectRef.current) return;

			dispatch({ type: "SET_LOADING", payload: true });
			try {
				const dateRange = getDateRange(periodRef.current, dateRef.current);
				const result = await fetchActivityData(
					projectRef.current,
					dateRange,
					membersOverride ?? allMembersRef.current,
					options,
				);

				dispatch({ type: "SET_ACTIVITIES", payload: result.activities });
				dispatch({ type: "SET_ISSUE_TREE", payload: result.issueTree });
				dispatch({ type: "SET_MEMBERS", payload: result.memberCounts });
				dispatch({ type: "SET_ALL_MEMBERS", payload: result.allMembers });
				toast.success(`Loaded ${result.activities.length} activities`);
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : "Failed to fetch data";
				toast.error(msg);
			} finally {
				dispatch({ type: "SET_LOADING", payload: false });
			}
		},
		[dispatch],
	);

	// Filter by member and category
	const filteredActivities = state.activities.filter((a) => {
		if (state.selectedMember && a.author !== state.selectedMember) return false;
		if (!state.categoryFilters.has(a.fieldCategory)) return false;
		return true;
	});

	// Recompute member counts based on category filters
	const filteredMembers = useMemo(() => {
		const map: Record<string, MemberCount> = {};
		for (const m of Object.values(state.allMembers)) {
			map[m.name] = { name: m.name, count: 0 };
		}
		for (const a of state.activities) {
			if (!state.categoryFilters.has(a.fieldCategory)) continue;
			if (!map[a.author]) {
				map[a.author] = { name: a.author, count: 0 };
			}
			const member = map[a.author];
			if (member) member.count++;
		}
		return Object.values(map).sort((a, b) => {
			if (a.count > 0 && b.count === 0) return -1;
			if (a.count === 0 && b.count > 0) return 1;
			if (a.count !== b.count) return b.count - a.count;
			return a.name.localeCompare(b.name);
		});
	}, [state.activities, state.allMembers, state.categoryFilters]);

	// Filter issue tree by member and category
	const filteredIssueTree = useMemo(() => {
		let tree = state.issueTree;
		if (state.selectedMember) {
			tree = filterTreeByMember(tree, state.selectedMember);
		}
		tree = filterTreeByCategories(tree, state.categoryFilters);
		return tree;
	}, [state.issueTree, state.selectedMember, state.categoryFilters]);

	return {
		refresh,
		filteredActivities,
		filteredIssueTree,
		filteredMembers,
		activities: state.activities,
		issueTree: state.issueTree,
	};
}
