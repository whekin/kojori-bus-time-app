# Kojori Improvement QA Checklist

Phase 0 baseline for the phased improvement plan in `.omx/plans/kojori-improvement-implementation-final.md`.

## Dirty-tree preflight

Run before every phase and before every phase commit:

```sh
git status --short
git diff --stat
```

Baseline result on 2026-05-15:

- `git status --short`: clean working tree.
- Previously known dirty files from planning (`CHANGELOG.md`, `src/app/explore.tsx`) were not dirty at Phase 0 start.
- If a later phase starts with dirty files, snapshot each already-dirty owned file with `git diff -- <path>` before editing, then ask or isolate pre-existing hunks before committing.

## Required command gates

Run for every phase unless the final plan narrows the gate:

```sh
bun run typecheck
bun lint
```

Additional gates by phase:

- Translation-touching phases: `bun run i18n:check` after Phase 1 adds it.
- TTC schedule/live phases: `bun test src/services/ttc.test.ts`.
- Widget-adjacent phases: inspect native widget diffs and confirm no network calls were added under `modules/kojori-widget/`.

## Manual Android QA matrix

Use this matrix for any phase that changes visible behavior.

| Surface | Light | Dark | EN | KA | RU | Large font | Reduced motion | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| First launch / start screen | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Direction cards, smart-location copy, privacy note. |
| Departures | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Next bus, later buses, status island, refresh, empty/end-of-service states. |
| Direction switch | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Direction pill label, animation/reduced-motion fallback. |
| Stop selector / stop picker | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Current stop, closest stop, add/remove saved stops, map link. |
| Map | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Route overlays, stop markers, vehicle markers, refresh/locate controls. |
| Timetable | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Stop card, route filters, section headings, upcoming/live hints. |
| Settings hub | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Commute, Appearance, Widget, Data, About sections. |
| Android widget | ☐ | ☐ | ☐ | ☐ | ☐ | n/a | n/a | Schedule-only countdowns, stop defaults, language/theme sync. |

## Accessibility observations

For phases touching controls, verify with TalkBack or accessibility inspector:

- Current tab announces selected state and destination.
- Selected filters, themes, language rows, and launch behavior rows announce selected state.
- Map refresh, locate, route chips, and stop actions have meaningful labels.
- Close/back buttons in sheets and modals announce their action.

## Reduced-motion observations

When Android reduced/remove animations is enabled:

- Decorative splash/reveal motion is skipped or shortened.
- Direction switch remains understandable without large movement.
- Refresh indicators do not spin indefinitely for decorative reasons.
- Settings cards avoid unnecessary lift/slide motion.

## Phase handoff template

Create a handoff note after every phase, preferably at `.omx/state/kojori-improvements/phase-N-handoff.md`:

```md
# Phase N Handoff

- Commit: <hash or none>
- Changed files: <paths>
- Dirty-tree preflight: <git status --short summary>
- Already-dirty owned-file snapshots: <paths or n/a>
- Verification:
  - <command>: PASS/FAIL, key output
- Manual QA:
  - <surface/observation>
- New helpers/contracts:
  - <notes for later phases>
- Remaining dirty tree:
  - <git status --short after commit>
- Follow-ups:
  - <items>
```
