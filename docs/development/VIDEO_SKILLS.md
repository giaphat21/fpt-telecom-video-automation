# Video skills: installation report (2026-11-22)

All 10 repositories exist and are public. 9 were installed from, 1 contains no skills. 30 third-party skills plus one
local guard skill (`fpt-video-skills`) are in `.claude/skills/`. Exact commits: `.claude/video-skills-lock.json`.

## 1. Installed

Path of each skill: `.claude/skills/<name>/`. Invoke: `/<name>`, or describe the task.

| Source | Skills | Licence |
|---|---|---|
| remotion-dev/skills | `remotion-best-practices` (contains the other 12 official skills) | none in repo |
| iart-ai/kinetic-typography-skills | `kinetic-typography` | MIT |
| iart-ai/tiktok-video-skills | `caption-animation`, `countdown-video`, `lower-thirds`, `short-form-video` | MIT |
| iart-ai/motion-design-skills | `after-effects`, `animation-principles`, `beat-sync-editing`, `color-motion`, `logo-animation`, `motion-art-direction`, `motion-background`, `shot-composition` | MIT |
| iart-ai/ad-video-skills | `ad-creative-video`, `launch-video`, `testimonial-video` | MIT |
| manuvegax/motionsmith | `motionsmith` | MIT, fonts OFL-1.1 |
| vidmoat/skills (core) | `audio-ducking`, `caption-styling` | Apache-2.0 / CC-BY-4.0 |
| iamaanahmad/agents-video-editing-skills | `audio-mixing`, `captions-subtitles`, `ffmpeg-essentials`, `motion-design-craft`, `platform-export`, `vertical-shorts`, `video-planning`, `video-qa`, `voiceover-tts` | MIT |
| ZiadAbdelkarim/beat-synced-edit | `beat-sync-edit` | MIT |
| local | `fpt-video-skills` (runtime, AGENTS.md precedence) | - |

Installers used: motionsmith's `install.py --dest` from a trimmed copy; iamaanahmad's `bin/cli.mjs --agent claude --only`;
folder copy for the rest. The iart packs keep helper scripts outside the skill folders, so they were copied into each
skill that calls them. `beat-sync-edit` has its Python scripts beside SKILL.md (upstream keeps them at the repo root).
No third-party SKILL.md was edited.

## 2. Skipped

| What | Why |
|---|---|
| iart-ai/awesome-motion-skills | A link list: README, LICENSE, CONTRIBUTING. No SKILL.md. |
| vidmoat `skills/vidmoat/*` (58) | Its README says they are written for Vidmoat's editing commands (`setKeyframeTrack`, `applyVfxPreset`...), which do not exist here. Some are brief-only, but refer to that editor too. |
| 12 separate Remotion skills | Same content is embedded in `remotion-best-practices`. |
| iart `remotion-video`, iamaanahmad `remotion-programmatic-video` | Duplicate the official Remotion skill. |
| iamaanahmad `video-editing-router` | Claims every video request first; conflicts with the FPT pipeline. |
| iamaanahmad `moviepy-python-video`, `screen-recording-demos`, `thumbnails` | Outside the requested capabilities; moviepy adds a second engine. |
| iamaanahmad `--rules` | Would add a root `CLAUDE.md` beside AGENTS.md. |
| motionsmith `companions/motion-architect` | A second Remotion agent with its own `npm install`, optional API keys and cloud modes. |
| motionsmith `examples/`, `tests/` | 22 MB of GIFs; tests were run from the clone. |

## 3. Dependencies and compatibility

Nothing system-wide. `var/video-skills/` (gitignored, about 0.86 GB):

| Component | Version |
|---|---|
| Python (nuget.org, PSF signature valid) | 3.12.10 |
| librosa / OpenCV / scenedetect / NumPy / Pillow | 1.0.1 / 5.1.0 / 0.7.3 / 2.5.5 / 13.0.0 (pins: `.claude/video-skills-requirements.txt`) |
| Playwright (no browser download; uses installed Chrome) | 1.65.1 |
| remotion, @remotion/cli, @remotion/captions | 4.0.543, same as the project |
| ffmpeg / ffprobe (already in node_modules) | 6.1.1 / 4.0.2 |

Issues:

- **Disk**: C: was 99 % full (5.0 GB free) before installing.
- **Remotion licence**: free for individuals and small teams; companies may need a paid licence. Check before commercial use.
- **Remotion skill** is written for 4.0.545; the project has 4.0.543.
- **motionsmith**: 226 of 228 upstream tests passed, 1 skipped, 1 failed. The landscape `kinetic-quote` recipe
  intermittently gives non-identical frames on this GPU (1 of 3 reruns); the 9:16 version was identical 3 of 3.
- **beat-sync-edit**: upstream gives only minimum versions. The first `clip_tag.py` run right after installation failed
  to import OpenCV; the next 5 passed. "Dreamy glow" in its table is not a complete filter. `vertical_style.py` defaults
  to a squeeze and a pink grade, which is off-brand here.
- **after-effects**: AE 2025 and 2026 are installed. Scripts were syntax-checked only; AE was not launched.
- **voiceover-tts**: ElevenLabs is an option and needs the user's own key; not tested.
- **seek-shot.sh** (iart): uses Playwright's own Chromium, which was not downloaded; not tested.
- **HyperFrames**: optional for motionsmith; not installed.

## 4. Validation

| Skill | Result |
|---|---|
| all 31 | Frontmatter valid, no name clashes, no hidden instructions; a fresh Claude Code 2.1.330 process lists 31 of 31 (listing only: the probe was not signed in, so no skill was run by a model; the session that did the install could not see them) |
| `beat-sync-edit` | beat map, scene tags, plan, render, vertical, flash montage ran; real track detected at 129.2 BPM / 449 beats; 10 cookbook effects ran (glow in its corrected form) |
| `motionsmith` | 1080x1920 H.264 rendered, reel deterministic, Vietnamese glyphs present in all 5 fonts |
| `remotion-best-practices` | 1080x1920 30 fps 30-frame kinetic text render |
| `caption-styling`, `audio-ducking` | checker and envelope scripts ran; vidmoat linter 60 skills, 0 errors |
| `video-qa`, iart `probe-mp4.sh`, `contact-sheet.sh` | ran correctly |
| `platform-export` | script loads; no full export |
| `audio-mixing`, `captions-subtitles` | loudnorm, sidechain and subtitle burn-in filters ran |
| remaining guidance-only skills | structure and links only |
| FPT project | `npm run doctor` passed, `npm test` 55/55 |

## 5. Recommended workflow

1. `/fpt-video-skills`: runtime and rules.
2. Plan: `/video-planning`, then `/ad-creative-video` or `/short-form-video` for hook and retention.
3. Direction: `/motion-art-direction`, `/shot-composition`.
4. Clock: Whisper word times for VJ videos. For speech-free montages, `/beat-sync-edit` (analysis) and
   `/beat-sync-editing` (phrases, J/L cuts, speed ramps).
5. Motion: FPT Studio for production; `/motionsmith` for hero shots; `/remotion-best-practices` for templates;
   `/kinetic-typography`, `/lower-thirds`, `/logo-animation`, `/after-effects` as needed.
6. Captions: `/caption-animation` (look), `/caption-styling` (readability check). Positions from AGENTS.md.
7. Audio: `/audio-ducking`, `/audio-mixing`, at the mix levels in AGENTS.md 7.7.
8. Finish: `/ffmpeg-essentials`, `/platform-export`, `/video-qa`, then `src/pipeline/quality_gate.js`.

## Remove

Delete `.claude/` and `var/video-skills/`, and this file. Nothing else was changed.

## Rebuild the runtime

Extract `https://api.nuget.org/v3-flatcontainer/python/3.12.10/python.3.12.10.nupkg` and move its `tools/` folder to
`var/video-skills/python`; copy `python.exe` to `python3.exe`; run
`python -m pip install --only-binary=:all: -r .claude/video-skills-requirements.txt`. In `var/video-skills/node`, run
`npm install --ignore-scripts playwright@1.65.1 remotion@4.0.543 @remotion/cli@4.0.543 @remotion/captions@4.0.543 react@18.3.1 react-dom@18.3.1`.
