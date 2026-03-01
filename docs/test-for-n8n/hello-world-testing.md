# Hello World Component — Testing Guide

**Module:** test-for-n8n
**Story:** Create Hello World Display Component
**Component:** `src/modules/test-for-n8n/components/HelloWorld.tsx`
**Last updated:** 2026-03-01

---

## Overview

This guide covers manual verification of the `HelloWorld` component. Its purpose is to confirm that the test-for-n8n module scaffold, routing, and shadcn/ui card integration are working correctly before any real business logic is added.

---

## Prerequisites

Before testing, confirm:

- [ ] The Next.js dev server is running (`npm run dev`)
- [ ] The route `/test-for-n8n` (or wherever the component is mounted) is accessible in the browser
- [ ] No TypeScript or ESLint errors are reported in the terminal

---

## Test Scenarios

### 1. Rendering — Desktop (≥ 1024 px)

| # | Action | Expected result |
|---|--------|-----------------|
| 1.1 | Navigate to the Hello World page | Page loads without errors |
| 1.2 | Inspect the card | Card is centered horizontally and vertically on the viewport |
| 1.3 | Inspect the heading | "Hello World" is displayed as a large bold `<h1>` |
| 1.4 | Inspect the subtitle | "test-for-n8n module is running successfully." appears below the heading in muted text |
| 1.5 | Check card width | Card does not exceed `max-w-md` (~28 rem) and has visible padding |

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

### 4. Cross-Browser Verification

Test each scenario above in:

| Browser | Minimum version |
|---------|-----------------|
| Chrome / Chromium | 120 |
| Firefox | 121 |
| Safari | 17 |
| Edge | 120 |

### 5. Accessibility

| # | Check | Expected result |
|---|-------|-----------------|
| 5.1 | Keyboard navigation | Tab key cycles through any focusable elements; card itself is not a focus trap |
| 5.2 | Screen reader — landmark | The `<main>` element is announced as the main landmark |
| 5.3 | Screen reader — heading | "Hello World" is announced as a level-1 heading |
| 5.4 | Colour contrast | Heading and body text meet WCAG AA contrast ratio (≥ 4.5 : 1) |
| 5.5 | Zoom to 200 % | Content reflows without text being cut off |
| 5.6 | No `aria-*` errors | Browser console shows no ARIA-related warnings |

Tools: axe DevTools browser extension, macOS VoiceOver, NVDA (Windows).

---

## Verification Checklist (Acceptance Criteria)

Use this checklist to sign off the story. Every item must be checked before the story moves to **Done**.

### Component Output
- [ ] Page renders without a blank screen or console errors
- [ ] "Hello World" text is visible as the primary heading (`h1`)
- [ ] Subtitle text is visible beneath the heading
- [ ] Content is contained within a shadcn/ui `Card` component

### Responsive Layout
- [ ] Layout is correct at 375 px (mobile)
- [ ] Layout is correct at 768 px (tablet)
- [ ] Layout is correct at 1280 px (desktop)
- [ ] No horizontal scrollbar appears at any breakpoint

### Accessibility
- [ ] Component has a `<main>` landmark with a descriptive `aria-label`
- [ ] Heading is an `<h1>` (verified via DevTools Elements panel)
- [ ] axe DevTools reports zero violations
- [ ] Heading and body text pass WCAG AA colour contrast

### Code Quality
- [ ] Component file is located at `src/modules/test-for-n8n/components/HelloWorld.tsx`
- [ ] Component has complete JSDoc block (description, `@component`, `@example`, `@remarks`)
- [ ] No TypeScript errors (`npm run type-check` passes)
- [ ] No ESLint errors (`npm run lint` passes)
- [ ] Component accepts no props (pure display, no side-effects)

---

## Troubleshooting

### Page shows a 404
**Cause:** The route is not registered in the Next.js App Router.
**Fix:** Ensure `src/app/test-for-n8n/page.tsx` exists and renders `<HelloWorld />`.

### Card is not centered vertically
**Cause:** A parent wrapper may be overriding `min-h-screen` on the `<main>` element.
**Fix:** Check that the closest layout file does not set `overflow: hidden` or a fixed height on a parent container.

### Text contrast fails WCAG AA
**Cause:** The active Tailwind theme overrides `--muted-foreground` with a low-contrast value.
**Fix:** Inspect the CSS variable in `globals.css` or the theme configuration and adjust to meet a 4.5 : 1 ratio.

### TypeScript error: `as` prop not accepted on `CardTitle`
**Cause:** The shadcn/ui `CardTitle` component is typed as `React.HTMLAttributes<HTMLHeadingElement>` and does not forward the `as` prop by default.
**Fix:** Either cast the prop (`{...({ as: "h1" } as any)}`) or wrap the text in a semantic `<h1>` inside `CardTitle` and remove the `as` prop.

### Stale styles after Tailwind config change
**Cause:** Next.js cached a previous build artifact.
**Fix:** Delete `.next/` and restart the dev server.

---

## Test Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA | | | |
| Dev | | | |
