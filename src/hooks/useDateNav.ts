import { useCallback } from "react";
import { formatDate, getDateRange, navigateDate } from "@/lib/dates";
import { savePeriod, useAppDispatch, useAppState } from "@/state/store";

type Period = "daily" | "weekly" | "monthly";

export function useDateNav() {
	const state = useAppState();
	const dispatch = useAppDispatch();

	const setPeriod = useCallback(
		(period: Period) => {
			dispatch({ type: "SET_PERIOD", payload: period });
			savePeriod(period);
		},
		[dispatch],
	);

	const navigate = useCallback(
		(delta: number) => {
			const newDate = navigateDate(state.currentDate, state.period, delta);
			dispatch({ type: "SET_CURRENT_DATE", payload: newDate });
		},
		[state.currentDate, state.period, dispatch],
	);

	const goToday = useCallback(() => {
		dispatch({ type: "SET_CURRENT_DATE", payload: new Date() });
	}, [dispatch]);

	const dateRange = getDateRange(state.period, state.currentDate);

	const dateLabel =
		state.period === "daily"
			? formatDate(state.currentDate)
			: `${formatDate(dateRange.start)} — ${formatDate(dateRange.end)}`;

	return {
		period: state.period,
		currentDate: state.currentDate,
		dateLabel,
		setPeriod,
		navigate,
		goToday,
	};
}
