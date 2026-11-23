---
name: fpt-video-skills
description: Use before any other video, caption, motion, beat-sync, Remotion, FFmpeg or ad skill in this FPT repository. Loads the project-local runtimes and settles conflicts between third-party skills and the mandatory FPT rules in AGENTS.md.
---

# FPT video skills: runtime and precedence

## 1. Load the runtime (per shell)

Python, FFmpeg and Playwright are not installed system-wide. In the same command that uses them:

- Git Bash: `source .claude/video-skills-env.sh`
- PowerShell: `. .\.claude\video-skills-env.ps1`

Gives `python`/`python3` 3.12 (NumPy, Pillow, librosa, OpenCV, scenedetect), `ffmpeg` 6.1.1, `ffprobe`, Playwright on
system Chrome, and the Remotion CLI (4.0.543). Runtimes live in `var/video-skills/` (gitignored). If missing, see
`docs/development/VIDEO_SKILLS.md`. Ask before installing anything else: C: is nearly full.

Remotion renders need: `--browser-executable="$MOTION_CHROME" --chrome-mode=chrome-for-testing`, run from
`var/video-skills/node`.

## 2. Precedence

AGENTS.md section 8 (then 7) always wins over any third-party skill. In particular:

| A skill says | Here |
|---|---|
| Cut on the beat, the song is the clock | The VJ voice (Whisper word times) is the only clock; beats are for speech-free montages or accents |
| Its own safe zones, caption sizes, positions | Hook/Outro y320 scale 1.3, Highlight y350 scale 1.4, Sub `pos(540,1580)` |
| Own palettes/grades (`vertical_style.py` defaults to squeeze + pink) | FPT palette only (8.1): #F37021, #0066B3, #00A651, #0B1F3F, white and tints; no colour-changing default grade |
| An SFX on every text/cut, a 2-4 s interrupt quota | `sfx_director.js` (8.4): hit on the cue, max 2 uses per file; highlight count follows speech |
| Invent hook, offer or CTA copy | Only spoken or user-entered text; empty lines are not rendered |
| Lift looks, shots or frames from a reference | Never cut B-roll from the sample video; analyse only |
| -14 LUFS / other mix targets | Reference mix in 7.7 (voice 1.32, BGM 0.18 under voice, highlight SFX 0.38) |
| Write outputs next to sources | Deliver to `output/`; scratch in `var/`; never overwrite originals |

Productions made by FPT Studio still go through `src/pipeline/quality_gate.js`.

## 3. Cross-references to skills that are not installed

- `remotion-video`, `remotion-programmatic-video` -> `remotion-best-practices`
- `moviepy-python-video` -> `ffmpeg-essentials`; `video-editing-router` -> this skill
- motionsmith's `companions/motion-architect` is not installed; HyperFrames is optional and not installed
- `beat-sync-edit` scripts sit beside its SKILL.md: call them as `python <skill dir>/beat_map.py ...`; outputs go to
  the current folder. Its "dreamy glow" row is not a complete filter; use
  `split[a][b];[b]gblur=sigma=8[c];[a][c]blend=all_mode=screen:all_opacity=0.35`
