import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * HelloWorld component for the test-for-n8n module.
 *
 * A simple display component used to verify the module scaffold, routing,
 * and UI component integration are working correctly. It renders a card
 * with a "Hello World" heading and a brief description.
 */
export default function HelloWorld() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-8"
      aria-label="Hello World module"
    >
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="pb-2">
          <h1 className="text-center text-3xl font-bold tracking-tight text-foreground">
            Hello World
          </h1>
        </CardHeader>
        <CardContent>
          <p className="text-center text-base text-muted-foreground">
            test-for-n8n module is running successfully.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
