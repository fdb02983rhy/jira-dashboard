import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { DashboardSummary } from "@/components/DashboardSummary";
import { EpicTree } from "@/components/EpicTree";
import { Sidebar } from "@/components/Sidebar";
import { StaleIssues } from "@/components/StaleIssues";
import { SummaryCards } from "@/components/SummaryCards";
import { Topbar } from "@/components/Topbar";
import { Toaster } from "@/components/ui/sonner";
import { useActivities } from "@/hooks/useActivities";
import { useJiraApi } from "@/hooks/useJiraApi";
import { useAppState } from "@/state/store";

export default function App() {
	const state = useAppState();
	const { connect } = useJiraApi();
	const { refresh, filteredActivities, filteredIssueTree, filteredMembers } =
		useActivities();
	const initialized = useRef(false);
	const initialLoadDone = useRef(false);

	// Init: connect then fetch activity data
	useEffect(() => {
		if (initialized.current) return;
		initialized.current = true;
		(async () => {
			const result = await connect();
			if (result) await refresh(result.members);
			initialLoadDone.current = true;
		})();
	}, [connect, refresh]);

	// Refresh when project/period/date changes after initial load
	// period & currentDate are intentional deps — refresh reads them via refs
	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger refresh on period/date change
	useEffect(() => {
		if (!initialLoadDone.current) return;
		if (!state.connected || !state.selectedProject) return;
		refresh();
	}, [
		state.selectedProject,
		state.period,
		state.currentDate,
		state.connected,
		refresh,
	]);

	const handleRefresh = useCallback(() => {
		if (state.connected) refresh(undefined, { force: true });
	}, [state.connected, refresh]);

	// Show full-screen loader before initial connection
	const showInitLoader = !state.connected && state.loading;

	return (
		<>
			<div className="grid h-screen grid-cols-[280px_1fr] grid-rows-[56px_1fr]">
				{/* Sidebar spans both rows */}
				<div className="row-span-2">
					<Sidebar members={filteredMembers} />
				</div>

				{/* Topbar */}
				<Topbar onRefresh={handleRefresh} loading={state.loading} />

				{/* Main content */}
				<main className="scrollbar-thin relative overflow-y-auto bg-background p-6">
					{showInitLoader ? (
						<div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
							<Loader2 className="size-8 animate-spin" />
							<p className="text-sm font-medium">Connecting to Jira...</p>
						</div>
					) : (
						<>
							{/* Loading overlay */}
							{state.loading && (
								<div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
									<div className="flex flex-col items-center gap-2">
										<Loader2 className="size-6 animate-spin text-primary" />
										<span className="text-xs font-medium text-muted-foreground">
											Loading...
										</span>
									</div>
								</div>
							)}

							{/* Summary cards */}
							<SummaryCards activities={filteredActivities} />

							{/* Content — summary dashboard or member detail */}
							{state.selectedMember ? (
								<>
									<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
										<ActivityFeed activities={filteredActivities} />
										<EpicTree issueTree={filteredIssueTree} />
									</div>
									<div className="mt-6">
										<StaleIssues activeIssueKeys={filteredIssueTree} />
									</div>
								</>
							) : (
								<div className="mt-6">
									<DashboardSummary
										activities={filteredActivities}
										members={filteredMembers}
									/>
								</div>
							)}
						</>
					)}
				</main>
			</div>

			<Toaster richColors position="bottom-right" />
		</>
	);
}
