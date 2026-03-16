import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useJiraApi } from "@/hooks/useJiraApi";
import { getAvatarColor, getInitials } from "@/lib/utils";
import { useAppDispatch, useAppState } from "@/state/store";
import type { MemberCount } from "@/types";

interface SidebarProps {
	members: MemberCount[];
}

export function Sidebar({ members }: SidebarProps) {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const { selectProject } = useJiraApi();

	const {
		projects,
		selectedProject,
		allMembers,
		selectedMember,
		connected,
		loading,
	} = state;

	// Use filtered members from props; fall back to allMembers before data loads
	const displayMembers =
		members.length > 0
			? members
			: Object.values(allMembers).sort((a, b) => a.name.localeCompare(b.name));

	function handleProjectChange(value: string | null) {
		if (!value || value === selectedProject) return;
		selectProject(value);
	}

	function handleMemberClick(name: string) {
		dispatch({
			type: "SET_SELECTED_MEMBER",
			payload: selectedMember === name ? null : name,
		});
	}

	return (
		<aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-muted/40">
			{/* Brand */}
			<button
				type="button"
				className="flex h-14 shrink-0 cursor-pointer items-center gap-2.5 border-b border-border px-5 hover:bg-muted/60"
				onClick={() => dispatch({ type: "SET_SELECTED_MEMBER", payload: null })}
			>
				<div className="grid size-7 place-items-center rounded-md bg-primary font-mono text-[13px] font-extrabold leading-none text-primary-foreground">
					JD
				</div>
				<h1 className="text-[15px] font-bold uppercase tracking-[3px] text-foreground">
					Jira Dashboard
				</h1>
			</button>

			{/* Subtitle */}
			<div className="px-5 pt-3">
				<span className="text-[10px] font-medium uppercase tracking-[1.5px] text-muted-foreground">
					Activity Dashboard
				</span>
			</div>

			{/* Project selector */}
			<div className="px-4 pt-4 pb-2">
				<div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[1.8px] text-muted-foreground">
					Project
				</div>
				<Select value={selectedProject} onValueChange={handleProjectChange}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select a project...">
							{projects.find((p) => p.key === selectedProject)?.name ??
								selectedProject}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{projects.map((p) => (
							<SelectItem key={p.key} value={p.key}>
								{p.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Team members */}
			<div className="px-4 pt-4 pb-2">
				<div className="px-1 text-[10px] font-semibold uppercase tracking-[1.8px] text-muted-foreground">
					Team Members
				</div>
			</div>

			<div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
				{displayMembers.map((member) => {
					const isActive = selectedMember === member.name;
					const bgColor = getAvatarColor(member.name);
					const initials = getInitials(member.name);

					return (
						<button
							type="button"
							key={member.name}
							onClick={() => handleMemberClick(member.name)}
							className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
								isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
							}`}
						>
							<Avatar>
								<AvatarFallback
									className="text-xs font-bold text-white"
									style={{ backgroundColor: bgColor }}
								>
									{initials}
								</AvatarFallback>
							</Avatar>

							<span
								className={`flex-1 truncate text-[13px] font-medium ${
									isActive ? "text-primary" : "text-foreground"
								}`}
							>
								{member.name}
							</span>

							<span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
								{member.count}
							</span>
						</button>
					);
				})}
			</div>

			{/* Footer / connection status */}
			<div className="shrink-0 border-t border-border px-4 py-3">
				<div className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-muted-foreground">
					<span
						className={`inline-block size-[7px] shrink-0 rounded-full ${
							connected
								? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
								: loading
									? "animate-pulse bg-yellow-500"
									: "bg-muted-foreground"
						}`}
					/>
					<span>
						{connected
							? "Connected"
							: loading
								? "Connecting..."
								: "Not connected"}
					</span>
				</div>
			</div>
		</aside>
	);
}
