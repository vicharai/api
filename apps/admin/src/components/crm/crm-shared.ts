import type {
	CrmActivityType,
	CrmPriority,
	CrmSegment,
	CrmStage,
} from "@/lib/api/pending-paths";

export const STAGES: { value: CrmStage; label: string }[] = [
	{ value: "lead", label: "Lead" },
	{ value: "qualified", label: "Qualified" },
	{ value: "trial", label: "Trial" },
	{ value: "negotiation", label: "Negotiation" },
	{ value: "won", label: "Won" },
	{ value: "lost", label: "Lost" },
];

export const SEGMENTS: { value: CrmSegment; label: string }[] = [
	{ value: "smb", label: "SMB" },
	{ value: "mid_market", label: "Mid-market" },
	{ value: "enterprise", label: "Enterprise" },
];

export const PRIORITIES: { value: CrmPriority; label: string }[] = [
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
];

export const ACTIVITY_TYPES: { value: CrmActivityType; label: string }[] = [
	{ value: "note", label: "Note" },
	{ value: "call", label: "Call" },
	{ value: "email", label: "Email" },
	{ value: "meeting", label: "Meeting" },
	{ value: "task", label: "Task" },
];

export type TaskBucket = "overdue" | "today" | "week" | "later" | "none";

export const TASK_BUCKETS: { value: TaskBucket; label: string }[] = [
	{ value: "overdue", label: "Overdue" },
	{ value: "today", label: "Today" },
	{ value: "week", label: "This week" },
	{ value: "later", label: "Later" },
	{ value: "none", label: "No date" },
];

export function taskBucket(dueAt: string | null, now = new Date()): TaskBucket {
	if (!dueAt) {
		return "none";
	}
	const due = new Date(dueAt);
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);
	const startOfTomorrow = new Date(startOfToday);
	startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
	const endOfWeek = new Date(startOfToday);
	endOfWeek.setDate(endOfWeek.getDate() + 7);
	if (due < startOfToday) {
		return "overdue";
	}
	if (due < startOfTomorrow) {
		return "today";
	}
	if (due < endOfWeek) {
		return "week";
	}
	return "later";
}
