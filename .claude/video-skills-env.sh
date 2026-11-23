# Source in Git Bash:  source .claude/video-skills-env.sh
# Adds the project-local runtimes used by .claude/skills to this shell only.
_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$_root/var/video-skills/python:$_root/var/video-skills/node/node_modules/.bin:$_root/node_modules/ffmpeg-static:$_root/node_modules/ffprobe-static/bin/win32/x64:$PATH"
export PYTHONUTF8=1 PYTHONDONTWRITEBYTECODE=1
export MOTION_NODE_MODULES="$(cygpath -m "$_root")/var/video-skills/node/node_modules"
export MOTION_CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
unset _root
