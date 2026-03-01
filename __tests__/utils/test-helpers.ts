/**
 * Shared test helpers for signup-flow integration tests.
 *
 * Exports:
 *  - TypeScript interfaces used across test files
 *  - Data factories for consistent, unique test payloads
 *  - Form-interaction helpers built on @testing-library/user-event
 *  - fetch-mock helpers that configure global.fetch for each scenario
 */

import { screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignupFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  organizationName: string;
}

export interface SignupApiResponse {
  success?: boolean;
  redirectTo?: string;
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<keyof SignupFormData, string>>;
}

// ---------------------------------------------------------------------------
// Data factories
// ---------------------------------------------------------------------------

let _counter = 0;

/** Returns a unique suffix so parallel tests don't share identical payloads. */
function uid(): string {
  return `${++_counter}`;
}

/**
 * Creates a valid SignupFormData object.
 *
 * Override any field to craft edge-case inputs while keeping the rest valid.
 *
 * @example
 * // Test duplicate-email path
 * createValidSignupData({ email: 'taken@example.com' });
 */
export function createValidSignupData(
  overrides: Partial<SignupFormData> = {}
): SignupFormData {
  const id = uid();
  return {
    name: "Test User",
    email: `user-${id}@example.com`,
    password: "SecurePassword123!",
    confirmPassword: "SecurePassword123!",
    organizationName: `Test Organization ${id}`,
    ...overrides,
  };
}

/** Creates valid data with an intentionally invalid email format. */
export function createInvalidEmailData(): SignupFormData {
  return createValidSignupData({ email: "not-a-valid-email" });
}

/** Creates data where passwords deliberately do not match. */
export function createMismatchedPasswordData(): SignupFormData {
  return createValidSignupData({
    password: "PasswordOne123!",
    confirmPassword: "PasswordTwo456!",
  });
}

/** Creates data with an intentionally weak (too-short) password. */
export function createWeakPasswordData(): SignupFormData {
  return createValidSignupData({ password: "short", confirmPassword: "short" });
}

// ---------------------------------------------------------------------------
// API response builders
// ---------------------------------------------------------------------------

export function buildSuccessResponse(
  overrides: Partial<SignupApiResponse> = {}
): SignupApiResponse {
  return { success: true, redirectTo: "/dashboard", ...overrides };
}

export function buildErrorResponse(
  error: string,
  message?: string
): SignupApiResponse {
  const defaultMessages: Record<string, string> = {
    duplicate_email: "An account with this email address already exists.",
    duplicate_organization:
      "An organization with this name already exists. Please choose a different name.",
    validation_error: "Please check your input and try again.",
    server_error: "Something went wrong. Please try again later.",
    network_error: "Unable to connect. Please check your connection.",
  };

  return {
    success: false,
    error,
    message: message ?? defaultMessages[error] ?? "An unexpected error occurred.",
  };
}

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a plain object in a minimal Response-like object so that code that
 * calls `response.json()` works as expected.
 */
function makeFetchResponse(status: number, body: object): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

/** Queue a successful signup response on the global fetch mock. */
export function mockSignupSuccess(
  overrides: Partial<SignupApiResponse> = {}
): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce(
    makeFetchResponse(200, buildSuccessResponse(overrides))
  );
}

/** Queue a 409 duplicate-email error on the global fetch mock. */
export function mockDuplicateEmailError(): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce(
    makeFetchResponse(409, buildErrorResponse("duplicate_email"))
  );
}

/** Queue a 409 duplicate-organization error on the global fetch mock. */
export function mockDuplicateOrganizationError(): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce(
    makeFetchResponse(409, buildErrorResponse("duplicate_organization"))
  );
}

/** Queue a 500 server error on the global fetch mock. */
export function mockServerError(): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce(
    makeFetchResponse(500, buildErrorResponse("server_error"))
  );
}

/** Queue a rejected promise simulating a network failure. */
export function mockNetworkFailure(): void {
  (global.fetch as jest.Mock).mockRejectedValueOnce(
    new Error("Network request failed")
  );
}

/**
 * Configure global.fetch to block indefinitely.
 * Returns a resolve function you can call to unblock the request.
 *
 * Useful for asserting loading states.
 */
export function mockPendingFetch(): () => void {
  let resolve!: (value: Response) => void;

  (global.fetch as jest.Mock).mockReturnValueOnce(
    new Promise<Response>((res) => {
      resolve = res;
    })
  );

  return () =>
    resolve(makeFetchResponse(200, buildSuccessResponse()));
}

// ---------------------------------------------------------------------------
// Form interaction helpers
// ---------------------------------------------------------------------------

/**
 * Fills every field of the signup form using userEvent.
 *
 * Labels are matched with case-insensitive regex so minor wording changes in
 * the component don't break every test.
 */
export async function fillSignupForm(
  user: UserEvent,
  data: SignupFormData
): Promise<void> {
  const fields: Array<[RegExp, string]> = [
    [/full name|^name/i, data.name],
    [/email/i, data.email],
    [/^password/i, data.password],
    [/confirm password/i, data.confirmPassword],
    [/organization name/i, data.organizationName],
  ];

  for (const [labelPattern, value] of fields) {
    if (value === "") continue; // leave the field untouched to test blank submission
    const input = screen.getByLabelText(labelPattern);
    await user.clear(input);
    await user.type(input, value);
  }
}

/**
 * Clicks the signup form's primary submit button.
 */
export async function submitSignupForm(user: UserEvent): Promise<void> {
  const button = screen.getByRole("button", {
    name: /sign up|create account|get started/i,
  });
  await user.click(button);
}

/**
 * Fills the form with `data` and immediately clicks the submit button.
 */
export async function completeSignupForm(
  user: UserEvent,
  data: SignupFormData
): Promise<void> {
  await fillSignupForm(user, data);
  await submitSignupForm(user);
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Waits for and asserts that a role="alert" element containing the given text
 * is present in the document.
 */
export async function expectAlertMessage(
  text: string | RegExp
): Promise<void> {
  await waitFor(() => {
    const alerts = screen.getAllByRole("alert");
    const matched = alerts.some((el) =>
      typeof text === "string"
        ? el.textContent?.includes(text)
        : text.test(el.textContent ?? "")
    );
    expect(matched).toBe(true);
  });
}

/**
 * Asserts that the signup submit button is currently in a disabled (loading)
 * state.
 */
export function expectSubmitButtonDisabled(): void {
  const button = screen.getByRole("button", {
    name: /sign up|create account|get started|loading/i,
  });
  expect(button).toBeDisabled();
}

/**
 * Asserts that the signup submit button is enabled and ready to be clicked.
 */
export function expectSubmitButtonEnabled(): void {
  const button = screen.getByRole("button", {
    name: /sign up|create account|get started/i,
  });
  expect(button).not.toBeDisabled();
}

/**
 * Parses the body sent to the first fetch call and returns it as a plain
 * object.  Throws if fetch was never called.
 */
export function getLastFetchBody(): Record<string, unknown> {
  const calls = (global.fetch as jest.Mock).mock.calls;
  if (calls.length === 0) {
    throw new Error("fetch was not called");
  }
  const [, init] = calls[calls.length - 1] as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}
