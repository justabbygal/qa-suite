"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

const DEFAULT_MESSAGE = "Hello World";
const CLICKED_MESSAGE = "Button Clicked!";
const RESET_DELAY_MS = 3000;

/**
 * HelloWorld component for the test-for-n8n module.
 *
 * A simple interactive component used to verify the module scaffold, routing,
 * and UI component integration are working correctly. It renders a card
 * with a message that updates on button click and auto-resets after 3 seconds,
 * with visual feedback during the countdown period.
 */
export default function HelloWorld() {
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [clickCount, setClickCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleButtonClick() {
    try {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      setMessage(CLICKED_MESSAGE);
      setClickCount((c) => c + 1);

      timerRef.current = setTimeout(() => {
        setMessage(DEFAULT_MESSAGE);
        timerRef.current = null;
      }, RESET_DELAY_MS);
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[HelloWorld] Unexpected error in click handler:", err);
      }
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const isActive = message === CLICKED_MESSAGE;

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-8"
      aria-label="Hello World module"
    >
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="pb-2">
          <h1
            id="hello-world-message"
            aria-live="polite"
            aria-atomic="true"
            className={`text-center text-3xl font-bold tracking-tight transition-colors duration-300 ${
              isActive ? "text-primary" : "text-foreground"
            }`}
          >
            {message}
          </h1>
        </CardHeader>
        <CardContent>
          <p className="text-center text-base text-muted-foreground">
            test-for-n8n module is running successfully.
          </p>
          <div
            className="mt-4 h-1 w-full overflow-hidden rounded-full bg-secondary"
            aria-hidden="true"
          >
            {isActive && (
              <div
                key={clickCount}
                className="h-full animate-countdown rounded-full bg-primary"
              />
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            variant={isActive ? "secondary" : "default"}
            size="lg"
            onClick={handleButtonClick}
            aria-label="Click to show a confirmation message"
            aria-describedby="hello-world-message"
            aria-pressed={isActive}
            className="transition-all duration-200"
          >
            Click Me
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
