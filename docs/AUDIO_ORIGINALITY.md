# Audio originality

The 19 departure MP3 files in `public/audio/melodies` are existing project-original synthesized compositions. Their technical paths remain unchanged for compatibility; player-facing names live in `ORIGINAL_MELODY_DEFINITIONS`. All definitions declare `originalComposition: true` and `copyrightPolicy: original-no-motif-copy`.

The assets predate complete reproducibility metadata. They are therefore marked `legacyGeneratedAsset: true`; absent seeds, exact tempo, meter, tonal centre, and mode are intentionally not invented. Duration comes from `melodyManifest.ts`, and instrumentation is conservatively described as additive synthesis.

Safe generator commands:

```bash
python scripts/melodies-gen.py --missing
python scripts/melodies-gen.py --only 01_jre-ikst-010-01_inner-main
python scripts/melodies-gen.py --only <id> --output /tmp/melody-review
```

The generator refuses its old overwrite-all default and skips existing targets unless `--force` is explicitly paired with a selection. No official recording, protected MIDI, transcription, or copied motif is used. Historical terms remain technical compatibility identifiers only.
