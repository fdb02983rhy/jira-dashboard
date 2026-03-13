import {
	createContext,
	type Dispatch,
	type ReactNode,
	useContext,
	useReducer,
} from "react";
import type { Activity, MemberCount, TreeNode } from "@/types";

// ── State Shape ──────────────────────────────────────────────

export interface AppState {
	connected: boolean;

	// project data
	projects: { key: string; name: string }[];
	selectedProject: string;

	// filters
	selectedMember: string | null;
	period: "daily" | "weekly" | "monthly";
	currentDate: Date;
	categoryFilters: Set<string>;

	// fetched data
	members: MemberCount[];
	activities: Activity[];
	issueTree: TreeNode[];
	allMembers: Record<string, MemberCount>;

	// ui
	loading: boolean;
}

const initialState: AppState = {
	connected: false,
	projects: [],
	selectedProject: "",
	selectedMember: null,
	period: "daily",
	currentDate: new Date(),
	categoryFilters: new Set(["status", "assignee", "date", "comment"]),
	members: [],
	activities: [],
	issueTree: [],
	allMembers: {},
	loading: false,
};

// ── Actions ──────────────────────────────────────────────────

type Action =
	| { type: "SET_CONNECTED"; payload: boolean }
	| { type: "SET_PROJECTS"; payload: { key: string; name: string }[] }
	| { type: "SET_SELECTED_PROJECT"; payload: string }
	| { type: "SET_SELECTED_MEMBER"; payload: string | null }
	| { type: "SET_PERIOD"; payload: "daily" | "weekly" | "monthly" }
	| { type: "SET_CURRENT_DATE"; payload: Date }
	| { type: "SET_MEMBERS"; payload: MemberCount[] }
	| { type: "SET_ACTIVITIES"; payload: Activity[] }
	| { type: "SET_ISSUE_TREE"; payload: TreeNode[] }
	| { type: "SET_ALL_MEMBERS"; payload: Record<string, MemberCount> }
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "TOGGLE_CATEGORY_FILTER"; payload: string };

function reducer(state: AppState, action: Action): AppState {
	switch (action.type) {
		case "SET_CONNECTED":
			return { ...state, connected: action.payload };
		case "SET_PROJECTS":
			return { ...state, projects: action.payload };
		case "SET_SELECTED_PROJECT":
			return { ...state, selectedProject: action.payload };
		case "SET_SELECTED_MEMBER":
			return { ...state, selectedMember: action.payload };
		case "SET_PERIOD":
			return { ...state, period: action.payload };
		case "SET_CURRENT_DATE":
			return { ...state, currentDate: action.payload };
		case "SET_MEMBERS":
			return { ...state, members: action.payload };
		case "SET_ACTIVITIES":
			return { ...state, activities: action.payload };
		case "SET_ISSUE_TREE":
			return { ...state, issueTree: action.payload };
		case "SET_ALL_MEMBERS":
			return { ...state, allMembers: action.payload };
		case "SET_LOADING":
			return { ...state, loading: action.payload };
		case "TOGGLE_CATEGORY_FILTER": {
			const next = new Set(state.categoryFilters);
			if (next.has(action.payload)) {
				next.delete(action.payload);
			} else {
				next.add(action.payload);
			}
			return { ...state, categoryFilters: next };
		}
		default:
			return state;
	}
}

// ── Context ──────────────────────────────────────────────────

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<Dispatch<Action>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(reducer, initialState, () => {
		// Hydrate UI preferences from localStorage
		const saved = {
			selectedProject: localStorage.getItem("jira_project") || "",
			period:
				(localStorage.getItem("jira_period") as AppState["period"]) || "daily",
		};
		return { ...initialState, ...saved };
	});

	return (
		<AppStateContext.Provider value={state}>
			<AppDispatchContext.Provider value={dispatch}>
				{children}
			</AppDispatchContext.Provider>
		</AppStateContext.Provider>
	);
}

export function useAppState() {
	return useContext(AppStateContext);
}

export function useAppDispatch() {
	return useContext(AppDispatchContext);
}

// ── localStorage helpers ─────────────────────────────────────

export function saveProject(project: string) {
	localStorage.setItem("jira_project", project);
}

export function savePeriod(period: "daily" | "weekly" | "monthly") {
	localStorage.setItem("jira_period", period);
}
