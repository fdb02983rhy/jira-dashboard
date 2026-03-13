import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { fetchProjectMembers, fetchProjects, testConnection } from "@/lib/jira";
import { saveProject, useAppDispatch, useAppState } from "@/state/store";
import type { MemberCount } from "@/types";

export interface ConnectResult {
	ok: true;
	members: Record<string, MemberCount>;
}

export function useJiraApi() {
	const state = useAppState();
	const dispatch = useAppDispatch();

	// Ref so connect() reads latest selectedProject without changing identity
	const projectRef = useRef(state.selectedProject);
	projectRef.current = state.selectedProject;

	const connect = useCallback(async (): Promise<ConnectResult | false> => {
		dispatch({ type: "SET_LOADING", payload: true });
		try {
			await testConnection();
			dispatch({ type: "SET_CONNECTED", payload: true });

			const projects = await fetchProjects();
			const mapped = projects.map((p) => ({ key: p.key, name: p.name }));
			dispatch({ type: "SET_PROJECTS", payload: mapped });

			// Validate existing selection exists in fetched projects
			const existsInNew = mapped.some((p) => p.key === projectRef.current);
			const selected =
				(existsInNew ? projectRef.current : mapped[0]?.key) || "";
			let members: Record<string, MemberCount> = {};
			if (selected) {
				dispatch({ type: "SET_SELECTED_PROJECT", payload: selected });
				saveProject(selected);

				members = await fetchProjectMembers(selected);
				dispatch({ type: "SET_ALL_MEMBERS", payload: members });
			}

			toast.success("Connected to Jira");
			return { ok: true, members };
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : "Connection failed";
			dispatch({ type: "SET_CONNECTED", payload: false });
			toast.error(msg);
			return false;
		} finally {
			dispatch({ type: "SET_LOADING", payload: false });
		}
	}, [dispatch]);

	const selectProject = useCallback(
		async (projectKey: string) => {
			dispatch({ type: "SET_SELECTED_PROJECT", payload: projectKey });
			dispatch({ type: "SET_SELECTED_MEMBER", payload: null });
			saveProject(projectKey);

			dispatch({ type: "SET_LOADING", payload: true });
			try {
				const members = await fetchProjectMembers(projectKey);
				dispatch({ type: "SET_ALL_MEMBERS", payload: members });
			} catch {
				// non-critical
			} finally {
				dispatch({ type: "SET_LOADING", payload: false });
			}
		},
		[dispatch],
	);

	return {
		connect,
		selectProject,
	};
}
