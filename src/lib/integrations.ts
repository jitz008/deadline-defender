import type { Priority } from "./tasks";

export type IntegrationSource = "calendar" | "gtasks";

export interface IntegrationItem {
  id: string;
  title: string;
  source: IntegrationSource;
  due?: string;
  priority: Priority;
  notes?: string;
  // for calendar
  startTime?: string;
  endTime?: string;
  location?: string;
  // for tasks
  list?: string;
  done?: boolean;
}

// Mock data — shape mirrors Google Calendar Events + Google Tasks API
// Swap with real API responses later.
export const mockCalendarEvents: IntegrationItem[] = [
  {
    id: "cal-1",
    title: "Standup with eng team",
    source: "calendar",
    startTime: "9:30 AM",
    endTime: "10:00 AM",
    due: "Today 9:30 AM",
    priority: "medium",
    location: "Google Meet",
  },
  {
    id: "cal-2",
    title: "Investor pitch — Sequoia",
    source: "calendar",
    startTime: "3:00 PM",
    endTime: "4:00 PM",
    due: "Today 3:00 PM",
    priority: "high",
    location: "Zoom",
  },
  {
    id: "cal-3",
    title: "Dinner with Priya",
    source: "calendar",
    startTime: "7:30 PM",
    endTime: "9:00 PM",
    due: "Tonight 7:30 PM",
    priority: "low",
    location: "Olive & Vine",
  },
];

export const mockGoogleTasks: IntegrationItem[] = [
  {
    id: "gt-1",
    title: "Review Q3 OKRs draft",
    source: "gtasks",
    due: "Today",
    priority: "high",
    list: "Work",
  },
  {
    id: "gt-2",
    title: "Renew car insurance",
    source: "gtasks",
    due: "Tomorrow",
    priority: "medium",
    list: "Personal",
  },
  {
    id: "gt-3",
    title: "Pick up dry cleaning",
    source: "gtasks",
    priority: "low",
    list: "Personal",
  },
];

export function allIntegrationItems(): IntegrationItem[] {
  return [...mockCalendarEvents, ...mockGoogleTasks];
}
