#!/usr/bin/env bash
# Encode a native app screen recording into the homepage hero assets.
#
#   scripts/encode-hero-recording.sh <recording.mov|mp4> <dark|light> [start] [end]
#
#   start/end  optional trim, in seconds or hh:mm:ss (e.g. 1.5 35)
#
# Writes to public/images/blacknexa/:
#   hero-incident-reporting[-light].webm         VP9, 612px wide (2x of the 306px slot)
#   hero-incident-reporting[-light].mp4          H.264 fallback, same size
#   hero-incident-reporting[-light]-poster.jpg   first frame
#   hero-incident-reporting[-light].gif          306px handoff copy (not used by the page)
#
# The input should be a raw screen capture (no device frame): the site draws
# the phone frame itself. Record at 3x (e.g. 1179x2556); downscaling to 612px
# keeps text sharp, whereas upscaling a small source never will.
set -euo pipefail

IN=${1:?usage: $0 <recording> <dark|light> [start] [end]}
THEME=${2:?usage: $0 <recording> <dark|light> [start] [end]}
START=${3:-}
END=${4:-}

case "$THEME" in
  dark) SUFFIX="" ;;
  light) SUFFIX="-light" ;;
  *) echo "theme must be dark or light" >&2; exit 1 ;;
esac

OUT="$(cd "$(dirname "$0")/.." && pwd)/public/images/blacknexa/hero-incident-reporting${SUFFIX}"
TRIM=()
[[ -n "$START" ]] && TRIM+=(-ss "$START")
[[ -n "$END" ]] && TRIM+=(-to "$END")

W=612
SCALE="scale=${W}:-2:flags=lanczos,fps=30"

ffmpeg -v error -y "${TRIM[@]}" -i "$IN" -vf "$SCALE" -an \
  -c:v libvpx-vp9 -crf 24 -b:v 0 -row-mt 1 -pix_fmt yuv420p "${OUT}.webm"
ffmpeg -v error -y "${TRIM[@]}" -i "$IN" -vf "$SCALE" -an \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart "${OUT}.mp4"
ffmpeg -v error -y -i "${OUT}.mp4" -frames:v 1 -q:v 2 "${OUT}-poster.jpg"
ffmpeg -v error -y -i "${OUT}.mp4" -an \
  -vf "fps=15,scale=306:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a" \
  -loop 0 "${OUT}.gif"

ls -la "${OUT}".* "${OUT}-poster.jpg"
