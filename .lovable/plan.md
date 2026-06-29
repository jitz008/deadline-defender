# Pulse Tasks 2.0 — Major Upgrade

I'll ship all 8 changes in one pass. Here's the approach for each:

## 1. Sticky AI input + scrollable chat
- Restructure the chat panel: make the conversation a `flex-1 overflow-y-auto` container with auto-scroll-to-bottom on new messages (ref + `scrollIntoView`).
- Wrap the input bar in a `sticky bottom-0` container with the gradient backdrop so it never moves.

## 2. Animated black + blue gradient background
- New `<AnimatedBackground />` component fixed behind everything: 3–4 absolutely-positioned radial-gradient blobs (`bg-[radial-gradient(...)]`) animated via new `@keyframes breathe` in `src/styles.css` (10s ease-in-out scale + opacity).
- Base: `#000` → deep navy `#020617`.

## 3. Hero "Tasks 2.0" feathered edges
- Replace hard rounded card with a panel using `mask-image: radial-gradient(ellipse at center, black 55%, transparent 100%)` so edges melt into bg.

## 4. Interactive dot-grid
- New `<InteractiveDotGrid />` canvas component: tracks `mousemove`, renders dots, dots within ~120px of cursor brighten/scale with smooth lerp.

## 5. Google Calendar & Tasks UI
- New module `src/lib/integrations.ts` exporting mock `calendarEvents` and `googleTasks` arrays with `source: 'calendar' | 'gtasks'`.
- Two new sidebar buttons + routes `/calendar` and `/google-tasks` listing items.
- Merge integration items into the main "Today's tasks" columns with a small `Badge` (blue "Calendar" / "Tasks").

## 6. Previous tasks calendar nav
- Add shadcn `Calendar` to Previous Tasks section; clicking a date filters the list to tasks whose `completedAt` matches that date.

## 7. Time awareness
- Show subtle live clock in header (`useEffect` setInterval).
- Pass `currentTime: new Date().toISOString()` in the body to `/api/ask`; system prompt already references date — extend to include exact time.

## 8. Login page
- New `/login` route: dark gradient bg + dot-grid + Pulse logo + tagline + "Sign in with Google" button (UI only, no auth wired yet). Premium feel with breathing animation.

## Technical notes
- All new colors via Tailwind arbitrary values referencing existing semantic tokens where possible.
- Mock data shape mirrors Google Calendar/Tasks API responses so swap-in later is trivial.
- No backend/auth changes — purely UI prep for integrations + login.

Confirm and I'll build it.