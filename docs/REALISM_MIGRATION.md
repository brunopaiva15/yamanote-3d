# Conservative realism migration

## Classification

| Area | Status | Decision |
|---|---|---|
| 30 stations, directions, platform matrix | ALREADY_CORRECT | Preserved. |
| Alternative platforms and runtime flag | ALREADY_CORRECT | Preserved unchanged. |
| Central platform profile/evidence | MISSING | Added as a composed adapter over the existing matrix. |
| Direction/platform door API | PARTIALLY_IMPLEMENTED | Added; inherited station-only values remain unverified. Existing consumers are frozen by an allow-list test pending incremental migration. |
| Per-platform PSD | PARTIALLY_IMPLEMENTED | Explicit profile value resolves from the existing layout fallback; no factual override was invented. |
| Platform voice and approach chime APIs | MISSING | Added fallback-only APIs. |
| Transfer profiles | PARTIALLY_IMPLEMENTED | Added central fallback resolver; no unsupported spoken exceptions. |
| Melody metadata and safe generation | PARTIALLY_IMPLEMENTED | Added metadata and targeted/non-overwriting CLI. No MP3 regenerated. |
| Variable melody operation | PARTIALLY_IMPLEMENTED | Pure plan added; the mature departure state machine retains its two-round fallback. |
| Courtesy schedule | PARTIALLY_IMPLEMENTED | Replaced arithmetic selection with equivalent data, explicitly unverified. |
| 14 existing visual signatures | ALREADY_CORRECT | All left intact. |
| 16 new signatures | UNVERIFIED | Deferred rather than generating generic competing modules. |
| Platform factual corrections/new audio | UNVERIFIED | None made or generated without sources. |

## Before and after

Previously, `YAMANOTE_PLATFORMS`, `DOOR_SIDE`, and `stationLayouts.psd` were separate compatibility datasets. `platformProfileFor` now composes them into one query result while `platformFor`, `DOOR_SIDE`, `hasPlatformDoors`, and `runtime.useAlternativePlatform` remain available. The old direct `DOOR_SIDE` consumers are an explicit frozen allow-list: future changes must reduce, never grow, that list.

No file is deprecated for deletion yet. Future work can migrate each consumer and remove the allow-list entry only after direction/platform context is available. The announcement queues, probabilistic platform plan, Shibuya timing, departure identifiers, blockers, and audio buses were intentionally untouched.
