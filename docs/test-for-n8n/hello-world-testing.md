# Hello World Component — Testing Guide

**Module:** test-for-n8n
**Story:** Add Interactive Button to Hello World
**Component:** `src/modules/test-for-n8n/components/HelloWorld.tsx`
**Tests:** `src/modules/test-for-n8n/__tests__/HelloWorld.test.tsx`
**Last updated:** 2026-03-01

---

## Overview

This guide covers manual verification of the `HelloWorld` component. It confirms that the test-for-n8n module scaffold, routing, shadcn/ui integration, interactive button behaviour, auto-reset timer, ARIA attributes, and defensive edge-case handling all work correctly.

---

## Prerequisites

Before testing, confirm:

- [ ] The Next.js dev server is running (`npm run dev`)
- [ ] The route `/hello-world` is accessible in the browser
- [ ] No TypeScript or ESLint errors are reported in the terminal (`npm run lint` and `npx tsc --noEmit`)
- [ ] The automated test suite passes (`npm test`)

---

## Test Scenarios

### 1. Rendering — Desktop (≥ 1024 px)

| # | Action | Expected result |
|---|--------|-----------------|
| 1.1 | Navigate to the Hello World page | Page loads without errors |
| 1.2 | Inspect the card | Card is centered horizontally and vertically on the viewport |
| 1.3 | Inspect the heading | "Hello World" is displayed as a large bold `<h1>` |
| 1.4 | Inspect the subtitle | "test-for-n8n module is running successfully." appears below the heading in muted text |
| 1.5 | Inspect the button | A "Click Me" button is visible and centered in the card footer |
| 1.6 | Check card width | Card does not exceed `max-w-md` (~28 rem) and has visible padding |

### 2. Rendering — Tablet (768 px – 1023 px)

| # | Action | Expected result |
|---|--------|-----------------|
| 2.1 | Resize browser to tablet width | Card remains centered, no horizontal overflow |
| 2.2 | Check padding | Outer padding adjusts from `p-8` to `p-4` without content clipping |

### 3. Rendering — Mobile (< 768 px)

| # | Action | Expected result |
|---|--------|-----------------|
| 3.1 | Resize browser to 375 px (iPhone 14 viewport) | Card stretches to full available width with `p-4` padding |
| 3.2 | Check text legibility | Heading font size remains readable; no text overflow |
| 3.3 | Scroll behaviour | Page does not scroll horizontally |

### 4. Interactive Button — Normal Click

| # | Action | Expected result |
|---|--------|-----------------|
| 4.1 | Click the "Click Me" button | Heading changes instantly to "Button Clicked!" |
| 4.2 | Observe heading after 1 second | Heading still shows "Button Clicked!" |
| 4.3 | Observe heading after 2 seconds | Heading still shows "Button Clicked!" |
| 4.4 | Observe heading after 3 seconds | Heading resets to "Hello World" |
| 4.5 | Click again immediately after reset | Heading changes to "Button Clicked!" again |

### 5. Interactive Button — Rapid Click Stress Test

| # | Action | Expected result |
|---|--------|-----------------|
| 5.1 | Click the button 20+ times as fast as possible | Heading remains "Button Clicked!"; no console errors |
| 5.2 | Wait 3 seconds after the last rapid click | Heading resets to "Hello World" exactly once |
| 5.3 | Open DevTools → Performance → Memory | No memory leak; heap size is stable after rapid clicking |
| 5.4 | Click rapidly, then immediately close DevTools | No warnings about state updates on unmounted components |

### 6. Interactive Button — Timer Interleaving

| # | Action | Expected result |
|---|--------|-----------------|
| 6.1 | Click button; after 2 seconds click again | Timer resets; heading stays "Button Clicked!" for 3 more seconds |
| 6.2 | Click button; after 2.5 seconds click again | Only one reset fires 3 seconds after the second click |
| 6.3 | Click button; wait exactly 3 seconds | Heading resets; click again immediately | New 3-second cycle starts |

### 7. Navigation / Unmount Test

| # | Action | Expected result |
|---|--------|-----------------|
| 7.1 | Click button; navigate away before 3 seconds | No console warnings about state updates on unmounted components |
| 7.2 | Click button rapidly; navigate away immediately | No memory leak; no console errors |
| 7.3 | Return to page after navigating away | Component re-mounts fresh; heading shows "Hello World" |

### 8. Cross-Browser Verification

Test scenarios 4–7 in each browser:

| Browser | Minimum version |
|---------|-----------------|
| Chrome / Chromium | 120 |
| Firefox | 121 |
| Safari | 17 |
| Edge | 120 |

### 9. Accessibility

| # | Check | Expected result |
|---|-------|-----------------|
| 9.1 | Tab key | Focus moves to "Click Me" button; no other focusable elements in the card |
| 9.2 | Enter key (button focused) | Heading changes to "Button Clicked!" |
| 9.3 | Space key (button focused) | Heading changes to "Button Clicked!" |
| 9.4 | Screen reader — landmark | `<main>` announced as main landmark with label "Hello World module" |
| 9.5 | Screen reader — heading change | Screen reader announces "Button Clicked!" when heading updates (aria-live polite) |
| 9.6 | `aria-pressed` attribute | `false` initially; `true` after click; `false` again after auto-reset |
| 9.7 | Colour contrast | Heading and body text meet WCAG AA (≥ 4.5 : 1) |
| 9.8 | Zoom to 200 % | Content reflows; button remains fully visible and clickable |
| 9.9 | axe DevTools | Zero violations reported |

Tools: axe DevTools browser extension, macOS VoiceOver, NVDA (Windows).

### 10. Console / Error Check

| # | Check | Expected result |
|---|-------|-----------------|
| 10.1 | Open DevTools → Console before visiting page | No pre-existing errors |
| 10.2 | Click button normally | No console errors or warnings |
| 10.3 | Click button 20+ times rapidly | No console errors or warnings |
| 10.4 | Click button; navigate away before reset | No React unmount warnings |
| 10.5 | Run with `NODE_ENV=development` | `console.warn` appears only if a click-handler error actually occurs |

---

## Verification Checklist (Acceptance Criteria)

Use this checklist to sign off the story. Every item must be checked before the story moves to **Done**.

### Component Output
- [ ] Page renders without a blank screen or console errors
- [ ] "Hello World" text is visible as the primary heading (`h1`)
- [ ] Subtitle text is visible beneath the heading
- [ ] "Click Me" button is visible and centered in the card footer
- [ ] Content is contained within a shadcn/ui `Card` component

### Interactive Button Behaviour
- [ ] Clicking the button changes the heading to "Button Clicked!" immediately
- [ ] Heading resets to "Hello World" automatically after exactly 3 seconds
- [ ] Each new click restarts the 3-second countdown (previous timer is cancelled)
- [ ] 20+ rapid clicks produce no console errors and no memory leaks
- [ ] Navigating away mid-countdown produces no unmount warnings

### Responsive Layout
- [ ] Layout is correct at 375 px (mobile)
- [ ] Layout is correct at 768 px (tablet)
- [ ] Layout is correct at 1280 px (desktop)
- [ ] No horizontal scrollbar appears at any breakpoint

### Accessibility
- [ ] Component has a `<main>` landmark with `aria-label="Hello World module"`
- [ ] Heading is an `<h1>` with `aria-live="polite"` and `aria-atomic="true"`
- [ ] Button has `aria-pressed="false"` initially and `aria-pressed="true"` when active
- [ ] Button is reachable and activatable by keyboard (Tab, Enter, Space)
- [ ] axe DevTools reports zero violations
- [ ] Heading and body text pass WCAG AA colour contrast

### Code Quality
- [ ] Component file is at `src/modules/test-for-n8n/components/HelloWorld.tsx`
- [ ] Click handler is wrapped in try/catch with dev-only `console.warn`
- [ ] `useEffect` cleanup cancels any pending timer on unmount
- [ ] No TypeScript errors (`npx tsc --noEmit` passes)
- [ ] No ESLint errors (`npm run lint` passes)
- [ ] All automated unit tests pass (`npm test`)

---

## Automated Test Coverage

The test suite at `src/modules/test-for-n8n/__tests__/HelloWorld.test.tsx` covers:

| Group | Cases |
|-------|-------|
| Initial render | Heading text, button presence, subtitle text |
| Button click | Message changes to "Button Clicked!" |
| 3-second auto-reset | Reset at exactly 3 s; "Button Clicked!" persists until then |
| Multiple rapid clicks | Timer resets on each click; resets correctly after last click |
| Keyboard accessibility | Enter key, Space key, Tab focus |
| ARIA attributes | aria-label, aria-live, aria-atomic, aria-pressed states |
| Cleanup on unmount | clearTimeout called; no throw; no post-unmount state update; unmount after reset; unmount mid-sequence |
| Stress testing – rapid successive clicks | 20-click state check; 20-click auto-reset; single active timer assertion; interleaved partial advances |
| Error resilience | No throw when handler encounters error; dev console.warn fires; production stays silent |

Run the full suite with:

```bash
npm test
# or with coverage
npm run test:coverage
```

---

## Troubleshooting

### Page shows a 404
**Cause:** The route is not registered in the Next.js App Router.
**Fix:** Ensure `src/app/hello-world/page.tsx` exists and renders `<HelloWorld />`.

### Heading does not reset after 3 seconds
**Cause:** `setTimeout` may be blocked or the component re-mounted.
**Fix:** Check browser DevTools for errors; confirm the component is not re-mounting on each render cycle.

### Rapid clicking causes React warning about state on unmounted component
**Cause:** Timer fired after the component was unmounted.
**Fix:** Verify the `useEffect` cleanup in `HelloWorld.tsx` calls `clearTimeout(timerRef.current)`.

### Card is not centered vertically
**Cause:** A parent wrapper may be overriding `min-h-screen` on the `<main>` element.
**Fix:** Check that the closest layout file does not set `overflow: hidden` or a fixed height on a parent container.

### Text contrast fails WCAG AA
**Cause:** The active Tailwind theme overrides `--muted-foreground` with a low-contrast value.
**Fix:** Inspect the CSS variable in `globals.css` or the theme configuration and adjust to meet a 4.5 : 1 ratio.

### Stale styles after Tailwind config change
**Cause:** Next.js cached a previous build artifact.
**Fix:** Delete `.next/` and restart the dev server.

---

## Test Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA | | | |
| Dev | | | |
