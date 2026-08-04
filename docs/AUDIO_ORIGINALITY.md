# Audio originality

The 19 departure MP3 files in `public/audio/melodies` are project-original compositions. Their technical paths remain unchanged for compatibility; player-facing names live in `ORIGINAL_MELODY_DEFINITIONS`. All definitions declare `originalComposition: true` and `copyrightPolicy: original-no-motif-copy`.

Seventeen of them are additive-synthesis pieces that predate complete reproducibility metadata. They are therefore marked `legacyGeneratedAsset: true`; absent seeds, exact tempo, meter, tonal centre, and mode are intentionally not invented. Duration comes from `melodyManifest.ts`, and instrumentation is conservatively described as additive synthesis.

The two main-loop clips (`01_…_inner-main`, `02_…_outer-main`) were re-cut for bright acoustic piano, both hands, and do carry full metadata (`legacyGeneratedAsset: false`, seed, tempo 110, 4/4, tonal centre C). Both clips are cut just under 8 s so that the game's two full passes plus the breath between them fit in 16.7 s of dwell; the cut lands in the written rests of bar 4, after the last key is released at 7.09 s, so no note is shortened. They are two interpretations of a single score held in `scripts/piano-melody-gen.py`: pitches, octaves, note lengths, rests, and rhythmic positions are shared by construction, and only velocity, hand balance, pedal, stereo placement, and colour differ between the Inner and Outer readings. Nothing adds a note: the piano reads `SCORE_RIGHT` and `SCORE_LEFT` verbatim. The score is newly written for this project — no transcription, no quoted motif, no reference to any existing jingle.

These two are the only clips in the game that are not synthesized. The score is emitted as MIDI and played by a **sampled** piano — FluidR3_GM, released by Frank Wen under the MIT licence — because additive synthesis cannot produce a convincing piano at any setting; the reasoning is written out at the top of `scripts/piano-melody-gen.py`. The MIT licence permits redistributing the rendered audio without restriction. Only the rendered audio is versioned: the 148 MB sample bank is not vendored, and re-cutting these two clips needs `fluidsynth` and `fluid-soundfont-gm` installed. Every note, duration, rest, and rhythmic position still comes from this project's own score, and the interpretation — velocities, hand balance, pedal, panning, colour — is ours; only the instrument timbre is third-party.

Safe generator commands:

```bash
python scripts/melodies-gen.py --missing
python scripts/melodies-gen.py --only 03_jre-ikst-010-03_inner-secondary-osaki
python scripts/melodies-gen.py --only <id> --output /tmp/melody-review
python scripts/piano-melody-gen.py                  # both main-loop clips
python scripts/piano-melody-gen.py --only inner
node scripts/melody-manifest-gen.mjs                # after any re-cut
```

`melodies-gen.py` refuses its old overwrite-all default and skips existing targets unless `--force` is explicitly paired with a selection; it no longer owns the two main-loop files, which belong to `piano-melody-gen.py`. Masters are written to `assets/melodies/*.wav` (48 kHz / 24-bit stereo), outside `public/` so the build does not ship them. No official recording, protected MIDI, transcription, or copied motif is used. Historical terms remain technical compatibility identifiers only.
