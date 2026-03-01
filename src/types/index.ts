export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "tester" | "viewer";
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestCase {
  id: string;
  title: string;
  description?: string;
  steps: TestStep[];
  projectId: string;
  status: "draft" | "active" | "archived";
  priority: "low" | "medium" | "high" | "critical";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestStep {
  order: number;
  action: string;
  expectedResult: string;
}

export interface TestRun {
  id: string;
  testCaseId: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  executedBy?: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}
