import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * HelloWorld component for the test-for-n8n module.
 *
 * A simple display component used to verify the module scaffold, routing,
 * and UI component integration are working correctly. It renders a card
 * with a "Hello World" heading and a brief description.
 *
 * @component
 * @example
 * ```tsx
 * <HelloWorld />
 * ```
 *
 * @remarks
 * - Fully responsive: uses Tailwind's `max-w-*` utilities to constrain width
 *   on larger viewports while remaining full-width on mobile.
 * - Accessible: heading is rendered as an `<h1>` via CardTitle so it is the
 *   primary landmark for screen-reader navigation on its page.
 * - No props or side-effects — safe to render in any context.
 */
export default function HelloWorld() {
  return (
    <main
      className="flex min-h-screen items-center justify-center p-4 sm:p-8"
      aria-label="Hello World module"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle
            as="h1"
            className="text-center text-3xl font-bold"
          >
            Hello World
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            test-for-n8n module is running successfully.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
