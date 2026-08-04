# Audio originality

The 19 departure MP3 files in `public/audio/melodies` are project-original compositions. Their technical paths remain unchanged for compatibility; player-facing names live in `ORIGINAL_MELODY_DEFINITIONS`. All definitions declare `originalComposition: true` and `copyrightPolicy: original-no-motif-copy`.

Seventeen of them are additive-synthesis pieces that predate complete reproducibility metadata. They are therefore marked `legacyGeneratedAsset: true`; absent seeds, exact tempo, meter, tonal centre, and mode are intentionally not invented. Duration comes from `melodyManifest.ts`, and instrumentation is conservatively described as additive synthesis.

The two main-loop clips (`01_…_inner-main`, `02_…_outer-main`) were re-cut for bright acoustic piano and do carry full metadata (`legacyGeneratedAsset: false`, seed, tempo 110, 4/4, tonal centre C). They are two interpretations of a single score held in `scripts/piano-melody-gen.py`: pitches, octaves, note lengths, rests, and rhythmic positions are shared by construction, and only touch, velocity, hand balance, pedal, stereo placement, and piano colour differ between the Inner and Outer readings. The score is newly written for this project — no transcription, no quoted motif, no reference to any existing jingle.

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
