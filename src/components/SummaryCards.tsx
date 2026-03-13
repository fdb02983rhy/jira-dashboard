import {
	Activity,
	Calendar,
	GitCommit,
	type LucideIcon,
	MessageSquare,
	UserCheck,
	Users,
} from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { Activity as ActivityType } from "@/types";

interface StatCard {
	icon: LucideIcon;
	label: string;
	value: number;
}

interface SummaryCardsProps {
	activities: ActivityType[];
}

export function SummaryCards({ activities }: SummaryCardsProps) {
	const stats = useMemo<StatCard[]>(() => {
		const statusCount = activities.filter(
			(a) => a.fieldCategory === "status",
		).length;
		const commentCount = activities.filter(
			(a) => a.fieldCategory === "comment",
		).length;
		const assigneeCount = activities.filter(
			(a) => a.fieldCategory === "assignee",
		).length;
		const dateCount = activities.filter(
			(a) => a.fieldCategory === "date",
		).length;
		const uniqueMembers = new Set(activities.map((a) => a.author)).size;

		return [
			{ icon: Activity, label: "Total Changes", value: activities.length },
			{ icon: GitCommit, label: "Status Changes", value: statusCount },
			{ icon: MessageSquare, label: "Comments", value: commentCount },
			{ icon: UserCheck, label: "Assignee Changes", value: assigneeCount },
			{ icon: Calendar, label: "Date Changes", value: dateCount },
			{ icon: Users, label: "Active Members", value: uniqueMembers },
		];
	}, [activities]);

	return (
		<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
			{stats.map((stat) => (
				<Card key={stat.label}>
					<CardContent className="flex flex-col items-center gap-1 text-center">
						<stat.icon className="h-5 w-5 text-muted-foreground" />
						<span className="text-2xl font-bold tracking-tight">
							{stat.value}
						</span>
						<span className="text-xs text-muted-foreground">{stat.label}</span>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
