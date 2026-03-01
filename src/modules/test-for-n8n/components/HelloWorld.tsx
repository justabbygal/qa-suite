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
 * with a message that updates on button click and auto-resets after 3 seconds.
 */
export default function HelloWorld() {
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleButtonClick() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    setMessage(CLICKED_MESSAGE);

    timerRef.current = setTimeout(() => {
      setMessage(DEFAULT_MESSAGE);
      timerRef.current = null;
    }, RESET_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-8"
      aria-label="Hello World module"
    >
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="pb-2">
          <h1
            aria-live="polite"
            aria-atomic="true"
            className="text-center text-3xl font-bold tracking-tight text-foreground"
          >
            {message}
          </h1>
        </CardHeader>
        <CardContent>
          <p className="text-center text-base text-muted-foreground">
            test-for-n8n module is running successfully.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            onClick={handleButtonClick}
            aria-pressed={message === CLICKED_MESSAGE ? "true" : "false"}
          >
            Click Me
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
