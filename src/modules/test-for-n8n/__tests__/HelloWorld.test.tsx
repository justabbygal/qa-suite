import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HelloWorld from "../components/HelloWorld";

describe("HelloWorld", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Initial render
  // ---------------------------------------------------------------------------

  describe("initial render", () => {
    it('displays "Hello World" as the heading', () => {
      render(<HelloWorld />);
      expect(
        screen.getByRole("heading", { name: "Hello World" })
      ).toBeInTheDocument();
    });

    it('renders a "Click Me" button', () => {
      render(<HelloWorld />);
      expect(
        screen.getByRole("button", { name: /click me/i })
      ).toBeInTheDocument();
    });

    it("renders the module status text", () => {
      render(<HelloWorld />);
      expect(
        screen.getByText("test-for-n8n module is running successfully.")
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Button click – message change
  // ---------------------------------------------------------------------------

  describe("button click", () => {
    it('changes the heading to "Button Clicked!" after a click', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      await user.click(screen.getByRole("button", { name: /click me/i }));

      expect(
        screen.getByRole("heading", { name: "Button Clicked!" })
      ).toBeInTheDocument();
    });

    it('reverts the heading back to "Hello World" once 3 seconds elapse', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      await user.click(screen.getByRole("button", { name: /click me/i }));

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(
        screen.getByRole("heading", { name: "Hello World" })
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 3-second auto-reset
  // ---------------------------------------------------------------------------

  describe("3-second auto-reset", () => {
    it('keeps "Button Clicked!" visible until exactly 3 seconds have passed', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      await user.click(screen.getByRole("button", { name: /click me/i }));

      act(() => {
        jest.advanceTimersByTime(2999);
      });

      expect(
        screen.getByRole("heading", { name: "Button Clicked!" })
      ).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1);
      });

      expect(
        screen.getByRole("heading", { name: "Hello World" })
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple rapid clicks – timer reset
  // ---------------------------------------------------------------------------

  describe("multiple rapid clicks", () => {
    it("resets the 3-second countdown on every click", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      const button = screen.getByRole("button", { name: /click me/i });

      await user.click(button);

      // Advance 2 seconds – just before the first timer fires.
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Click again; this should cancel the first timer and start a new one.
      await user.click(button);

      // 2 more seconds (4 total since first click, but only 2 since second click).
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Still in the clicked state because the new timer hasn't fired yet.
      expect(
        screen.getByRole("heading", { name: "Button Clicked!" })
      ).toBeInTheDocument();
    });

    it("resets to the default message 3 seconds after the last click", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      const button = screen.getByRole("button", { name: /click me/i });

      await user.click(button);

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await user.click(button);

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(
        screen.getByRole("heading", { name: "Hello World" })
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard accessibility
  // ---------------------------------------------------------------------------

  describe("keyboard accessibility", () => {
    it("activates the button with the Enter key", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      screen.getByRole("button", { name: /click me/i }).focus();
      await user.keyboard("{Enter}");

      expect(
        screen.getByRole("heading", { name: "Button Clicked!" })
      ).toBeInTheDocument();
    });

    it("activates the button with the Space key", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      screen.getByRole("button", { name: /click me/i }).focus();
      await user.keyboard(" ");

      expect(
        screen.getByRole("heading", { name: "Button Clicked!" })
      ).toBeInTheDocument();
    });

    it("button receives focus when tabbing through the page", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      await user.tab();

      expect(screen.getByRole("button", { name: /click me/i })).toHaveFocus();
    });
  });

  // ---------------------------------------------------------------------------
  // ARIA attributes and semantic markup
  // ---------------------------------------------------------------------------

  describe("ARIA attributes", () => {
    it('main landmark has aria-label "Hello World module"', () => {
      render(<HelloWorld />);
      expect(
        screen.getByRole("main", { name: "Hello World module" })
      ).toBeInTheDocument();
    });

    it('heading has aria-live="polite" for screen-reader announcements', () => {
      render(<HelloWorld />);
      expect(screen.getByRole("heading")).toHaveAttribute("aria-live", "polite");
    });

    it('heading has aria-atomic="true"', () => {
      render(<HelloWorld />);
      expect(screen.getByRole("heading")).toHaveAttribute("aria-atomic", "true");
    });

    it('button has aria-pressed="false" in the initial state', () => {
      render(<HelloWorld />);
      expect(
        screen.getByRole("button", { name: /click me/i })
      ).toHaveAttribute("aria-pressed", "false");
    });

    it('button has aria-pressed="true" immediately after a click', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      await user.click(screen.getByRole("button", { name: /click me/i }));

      expect(
        screen.getByRole("button", { name: /click me/i })
      ).toHaveAttribute("aria-pressed", "true");
    });

    it('button returns to aria-pressed="false" after the auto-reset', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);

      await user.click(screen.getByRole("button", { name: /click me/i }));

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(
        screen.getByRole("button", { name: /click me/i })
      ).toHaveAttribute("aria-pressed", "false");
    });
  });

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------

  describe("cleanup on unmount", () => {
    it("calls clearTimeout when unmounted while a timer is active", async () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      const { unmount } = render(<HelloWorld />);

      await user.click(screen.getByRole("button", { name: /click me/i }));

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("does not throw when unmounting before any click", () => {
      const { unmount } = render(<HelloWorld />);
      expect(() => unmount()).not.toThrow();
    });

    it("does not trigger a state update after the component has unmounted", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { unmount } = render(<HelloWorld />);

      await user.click(screen.getByRole("button", { name: /click me/i }));

      // Unmount before the timer fires.
      unmount();

      // Advance past the timer threshold – no state-update warnings should appear.
      expect(() => {
        act(() => {
          jest.advanceTimersByTime(3000);
        });
      }).not.toThrow();
    });

    it("does not throw when unmounting after the auto-reset has already fired", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { unmount } = render(<HelloWorld />);

      await user.click(screen.getByRole("button", { name: /click me/i }));

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Timer has already fired and timerRef is null – unmount should be a no-op.
      expect(() => unmount()).not.toThrow();
    });

    it("does not throw when unmounting mid-sequence during rapid clicks", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { unmount } = render(<HelloWorld />);
      const button = screen.getByRole("button", { name: /click me/i });

      await user.click(button);
      await user.click(button);
      await user.click(button);

      expect(() => unmount()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Stress testing – rapid successive clicks
  // ---------------------------------------------------------------------------

  describe("stress testing – rapid successive clicks", () => {
    it("remains in the clicked state after 20 rapid clicks", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);
      const button = screen.getByRole("button", { name: /click me/i });

      for (let i = 0; i < 20; i++) {
        await user.click(button);
      }

      expect(
        screen.getByRole("heading", { name: "Button Clicked!" })
      ).toBeInTheDocument();
    });

    it("auto-resets to the default message 3 seconds after the 20th rapid click", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);
      const button = screen.getByRole("button", { name: /click me/i });

      for (let i = 0; i < 20; i++) {
        await user.click(button);
      }

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(
        screen.getByRole("heading", { name: "Hello World" })
      ).toBeInTheDocument();
    });

    it("clears the previous timer on every click, leaving only one pending timeout", async () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);
      const button = screen.getByRole("button", { name: /click me/i });

      // First click has no previous timer; each subsequent click clears one.
      const CLICK_COUNT = 20;
      for (let i = 0; i < CLICK_COUNT; i++) {
        await user.click(button);
      }

      // The spy may also be called by internals (e.g. user-event), so we assert
      // at least CLICK_COUNT - 1 calls rather than an exact count.
      expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(
        CLICK_COUNT - 1
      );

      clearTimeoutSpy.mockRestore();
    });

    it("does not accumulate multiple timers when clicking rapidly", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);
      const button = screen.getByRole("button", { name: /click me/i });

      for (let i = 0; i < 20; i++) {
        await user.click(button);
      }

      // Only one timer should fire after 3 seconds – heading resets exactly once.
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Advance another full interval to confirm no stale timers trigger.
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(
        screen.getByRole("heading", { name: "Hello World" })
      ).toBeInTheDocument();
    });

    it("handles clicks interleaved with partial timer advances without error", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HelloWorld />);
      const button = screen.getByRole("button", { name: /click me/i });

      await user.click(button);

      act(() => { jest.advanceTimersByTime(1000); });

      await user.click(button);

      act(() => { jest.advanceTimersByTime(1500); });

      await user.click(button);

      act(() => { jest.advanceTimersByTime(500); });

      await user.click(button);

      // Still in clicked state – the last timer started 500 ms ago.
      expect(
        screen.getByRole("heading", { name: "Button Clicked!" })
      ).toBeInTheDocument();

      // Complete the final timer.
      act(() => { jest.advanceTimersByTime(2500); });

      expect(
        screen.getByRole("heading", { name: "Hello World" })
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Error resilience
  // ---------------------------------------------------------------------------

  describe("error resilience", () => {
    it("does not throw when the click handler encounters an unexpected error", () => {
      render(<HelloWorld />);
      const button = screen.getByRole("button", { name: /click me/i });

      // Temporarily break clearTimeout to simulate a runtime anomaly.
      const originalClearTimeout = global.clearTimeout;
      global.clearTimeout = () => { throw new Error("simulated clearTimeout failure"); };

      // First click: timerRef is null, so clearTimeout is not called – no error.
      expect(() => button.click()).not.toThrow();

      global.clearTimeout = originalClearTimeout;
    });

    it("emits a console.warn in development when the click handler throws", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const originalEnv = process.env.NODE_ENV;

      // Simulate development environment.
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        configurable: true,
      });

      render(<HelloWorld />);
      const button = screen.getByRole("button", { name: /click me/i });

      // Force the handler to catch by sabotaging setTimeout after first click.
      const originalSetTimeout = global.setTimeout;
      // @ts-ignore – intentional bad override for testing purposes
      global.setTimeout = () => { throw new Error("simulated setTimeout failure"); };

      button.click();

      expect(warnSpy).toHaveBeenCalledWith(
        "[HelloWorld] Unexpected error in click handler:",
        expect.any(Error)
      );

      global.setTimeout = originalSetTimeout;
      Object.defineProperty(process.env, "NODE_ENV", {
        value: originalEnv,
        configurable: true,
      });
      warnSpy.mockRestore();
    });

    it("does not emit console.warn in production when the click handler throws", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const originalEnv = process.env.NODE_ENV;

      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        configurable: true,
      });

      render(<HelloWorld />);
      const button = screen.getByRole("button", { name: /click me/i });

      const originalSetTimeout = global.setTimeout;
      // @ts-ignore – intentional bad override for testing purposes
      global.setTimeout = () => { throw new Error("simulated setTimeout failure"); };

      button.click();

      expect(warnSpy).not.toHaveBeenCalled();

      global.setTimeout = originalSetTimeout;
      Object.defineProperty(process.env, "NODE_ENV", {
        value: originalEnv,
        configurable: true,
      });
      warnSpy.mockRestore();
    });
  });
});
