# Workspace restructuring plan

No files have been deleted.

## Target structure

```text
fpt-telecom-video-automation/
├── src/
│   ├── core/                 # video, subtitles, B-roll, timing, quality
│   ├── integrations/         # CapCut and alignment adapters
│   ├── renderers/            # PowerShell typography renderer
│   └── server.js
├── public/                   # compact Studio UI
├── skills/                   # editing rules and B-roll skill
├── assets/                   # fonts, audio, B-roll and original source clips
│   └── references/           # protected approved video + original metadata
├── config/                   # reference rules + centralized paths
├── scripts/                  # launch, doctor, CLI and asset generators
├── tests/
│   └── fixtures/             # small stable inputs, independent of output/
├── runtime/                  # Whisper binaries/models
├── node_modules/             # local locked dependencies
├── docs/                     # audit, path mapping and change history
├── var/                      # regenerable cache/logs/QA (created on demand)
├── output/
│   └── .gitkeep
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## Proposed cleanup

- `FPT_Telecom_Studio/output/FPT_Video_1794847822637` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794847907687` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794848041893` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794848735498` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794850446008` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794850555664` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794852056234` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794852144628` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794852721379` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794852840159` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794852915231` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794853009502` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794853073643` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794919731220` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794919794528` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794928008540` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794928791941` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794931282001` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794933344659` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794933533665` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/FPT_Video_1794933728383` — Historical export; retain reference and small regression fixtures before deleting
- `FPT_Telecom_Studio/output/qa_approved_reference` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/qa_creative_broll` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/qa_direct_render_browser` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/QA_FPT_Creative` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/QA_FPT_Direct` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/QA_FPT_Mandatory` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/QA_HighlightCount` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/qa_highlight_count_browser` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/qa_mandatory_browser` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/qa_speech_broll` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/qa_studio_ui` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/qa_subtext_browser` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/qa_typography_catalog` — Generated automated QA output/browser profile
- `FPT_Telecom_Studio/output/studio-server-error.log` — Prior server session log
- `FPT_Telecom_Studio/output/studio-server.log` — Prior server session log
- `FPT_Telecom_Studio/.codex-backups` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/assets/broll_library/.previous` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/assets/broll_library/.staging` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/engine/patch_broll_drag.js` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/engine/patch_broll_labels.js` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/extract_snaps.js` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/footage/videos/test_upload.mp4` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/footage/videos/test_vid.mp4` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/footage/videos/debug_voice_10_18.wav` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/footage/videos/frame_user_14s.jpg` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/footage/videos/frame_user_2s.jpg` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `FPT_Telecom_Studio/footage/videos/frame_user_8s.jpg` — Obsolete patch/QA/debug or generated snapshot; not used by runtime
- `test_autosub_run.js` — Superseded one-off FPT diagnostic; maintained regression suite will be retained
- `test_highlights_cadence.js` — Superseded one-off FPT diagnostic; maintained regression suite will be retained
- `test_hook_highlight_cadence.js` — Superseded one-off FPT diagnostic; maintained regression suite will be retained
- `test_nlp_fpt.js` — Superseded one-off FPT diagnostic; maintained regression suite will be retained
- `test_render_v5.js` — Superseded one-off FPT diagnostic; maintained regression suite will be retained
- `test_whisper_paths.js` — Superseded one-off FPT diagnostic; maintained regression suite will be retained

## Safeguards

Retain the approved reference and necessary fixture JSON before deleting output. Validate retained assets with SHA-256. Keep other projects/shared repositories and all environment files. Never delete external CapCut drafts. A pre-existing external draft named “Bản 1” references an already missing export; this cleanup will not modify it.

Old timestamped exports require review. If not approved for deletion, relocate them under archive/exports and leave output/ empty.

## Completed

User approved old-export deletion. See restructuring_result.json, cleanup_result.json and project_tree.txt for the executed result. The approved video and original assets were retained and hash-verified. Output contains only .gitkeep.
