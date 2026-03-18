import {
	AArrowDown,
	AArrowUp,
	ChevronLeft,
	ChevronRight,
	RefreshCw,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, getDateRange, navigateDate } from "@/lib/dates";
import { savePeriod, useAppDispatch, useAppState } from "@/state/store";

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20] as const;
const DEFAULT_FONT_SIZE = 14;
const LS_KEY = "jira-dash-font-size";

function getInitialFontSize(): number {
	try {
		const stored = localStorage.getItem(LS_KEY);
		if (stored) {
			const n = Number(stored);
			if (FONT_SIZES.includes(n as (typeof FONT_SIZES)[number])) return n;
		}
	} catch {
		/* ignore */
	}
	return DEFAULT_FONT_SIZE;
}

function applyFontSize(size: number) {
	document.documentElement.style.fontSize = `${size}px`;
	try {
		localStorage.setItem(LS_KEY, String(size));
	} catch {
		/* ignore */
	}
}

const CATEGORY_CHIPS = [
	{ key: "status", label: "Status", color: "bg-blue-500" },
	{ key: "assignee", label: "Assignee", color: "bg-purple-500" },
	{ key: "date", label: "Date", color: "bg-orange-500" },
	{ key: "comment", label: "Comment", color: "bg-green-500" },
] as const;

interface TopbarProps {
	onRefresh?: () => void;
	loading?: boolean;
}

export function Topbar({ onRefresh, loading }: TopbarProps) {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const [fontSize, setFontSize] = useState(() => {
		const size = getInitialFontSize();
		applyFontSize(size);
		return size;
	});

	const changeFontSize = useCallback((delta: number) => {
		setFontSize((prev) => {
			const idx = FONT_SIZES.indexOf(prev as (typeof FONT_SIZES)[number]);
			const nextIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, idx + delta));
			const next = FONT_SIZES[nextIdx] ?? prev;
			applyFontSize(next);
			return next;
		});
	}, []);

	const { period, currentDate, categoryFilters } = state;
	const range = getDateRange(period, currentDate);

	function handlePeriodChange(value: string | number | null) {
		if (!value) return;
		const p = value as "daily" | "weekly" | "monthly";
		dispatch({ type: "SET_PERIOD", payload: p });
		savePeriod(p);
	}

	function handleNavigate(delta: number) {
		const next = navigateDate(currentDate, period, delta);
		dispatch({ type: "SET_CURRENT_DATE", payload: next });
	}

	function handleToday() {
		dispatch({ type: "SET_CURRENT_DATE", payload: new Date() });
	}

	function handleToggleCategory(key: string) {
		dispatch({ type: "TOGGLE_CATEGORY_FILTER", payload: key });
	}

	// Format the date label based on period
	const dateLabel =
		period === "daily"
			? formatDate(currentDate)
			: `${formatDate(range.start)} — ${formatDate(range.end)}`;

	return (
		<header className="flex h-14 items-center gap-4 border-b border-border bg-muted/40 px-6">
			{/* Period tabs */}
			<Tabs value={period} onValueChange={handlePeriodChange}>
				<TabsList>
					<TabsTrigger value="daily">Daily</TabsTrigger>
					<TabsTrigger value="weekly">Weekly</TabsTrigger>
					<TabsTrigger value="monthly">Monthly</TabsTrigger>
				</TabsList>
			</Tabs>

			{/* Date navigation */}
			<div className="ml-2 flex items-center gap-2">
				<Button
					variant="outline"
					size="icon"
					className="size-[30px]"
					onClick={() => handleNavigate(-1)}
				>
					<ChevronLeft className="size-4" />
				</Button>

				<span className="min-w-[160px] text-center font-mono text-[13px] font-semibold tracking-wide text-foreground">
					{dateLabel}
				</span>

				<Button
					variant="outline"
					size="icon"
					className="size-[30px]"
					onClick={() => handleNavigate(1)}
				>
					<ChevronRight className="size-4" />
				</Button>

				<Button
					variant="outline"
					size="sm"
					className="text-[11px] font-semibold uppercase tracking-wide"
					onClick={handleToday}
				>
					Today
				</Button>
			</div>

			{/* Category filter chips */}
			<div className="ml-4 flex items-center gap-1.5">
				{CATEGORY_CHIPS.map((chip) => {
					const active = categoryFilters.has(chip.key);
					return (
						<button
							type="button"
							key={chip.key}
							onClick={() => handleToggleCategory(chip.key)}
							className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
								active
									? "border-border bg-background text-foreground"
									: "border-transparent bg-muted/60 text-muted-foreground line-through"
							}`}
							title={`${active ? "Hide" : "Show"} ${chip.label.toLowerCase()} changes`}
						>
							<span
								className={`inline-block size-[7px] rounded-full ${active ? chip.color : "bg-muted-foreground/40"}`}
							/>
							{chip.label}
						</button>
					);
				})}
			</div>

			{/* Font size + Refresh */}
			<div className="ml-auto flex items-center gap-1">
				<Button
					variant="outline"
					size="icon"
					className="size-[30px]"
					onClick={() => changeFontSize(-1)}
					disabled={fontSize <= FONT_SIZES[0]}
					title="Decrease font size"
				>
					<AArrowDown className="size-4" />
				</Button>
				<span className="w-7 text-center text-[10px] tabular-nums text-muted-foreground">
					{fontSize}
				</span>
				<Button
					variant="outline"
					size="icon"
					className="size-[30px]"
					onClick={() => changeFontSize(1)}
					disabled={fontSize >= (FONT_SIZES[FONT_SIZES.length - 1] ?? 20)}
					title="Increase font size"
				>
					<AArrowUp className="size-4" />
				</Button>

				<div className="mx-1 h-5 w-px bg-border" />

				<Button
					variant="outline"
					size="icon"
					onClick={onRefresh}
					disabled={loading}
					aria-label="Refresh data"
					title="Refresh data"
				>
					<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
				</Button>
			</div>
		</header>
	);
}
