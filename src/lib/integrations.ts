import type { Priority } from "./tasks";

export type IntegrationSource = "calendar" | "gtasks";

export interface IntegrationItem {
  id: string;
  title: string;
  source: IntegrationSource;
  due?: string;
  priority: Priority;
  notes?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  list?: string;
  done?: boolean;
}

// Guest accounts start completely empty — populate via real integrations later.
export const mockCalendarEvents: IntegrationItem[] = [];
export const mockGoogleTasks: IntegrationItem[] = [];

export function allIntegrationItems(): IntegrationItem[] {
  return [];
}
