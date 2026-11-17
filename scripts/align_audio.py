#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bridge script for WhisperX & Faster-Whisper forced word-level alignment.
Receives:
  --audio <path_to_audio>
  --script <original_script_text_or_file>
  --lang <language_code, default: vi>
  --out <output_json_path>

Outputs @remotion/captions compatible JSON:
[
  {
    "text": "Từ ",
    "startMs": 120,
    "endMs": 340,
    "timestampMs": 230,
    "confidence": 0.99
  }
]
"""

import argparse
import json
import os
import re
import sys
from difflib import SequenceMatcher


def tokenize_script(script_text: str):
    cleaned = re.sub(r"\s+", " ", (script_text or "").strip())
    if not cleaned:
        return []
    return [w for w in cleaned.split(" ") if w]


def force_align_words_to_script(detected_words, script_words):
    """
    Aligns ASR-detected word timestamps to the exact spelling/diacritics
    of `script_words` using sequence alignment so 100% of Vietnamese spelling
    matches the original script while preserving exact acoustic timestamps.
    """
    if not script_words:
        return detected_words
    if not detected_words:
        return []

    det_norm = [re.sub(r"[^\w]", "", w["text"].lower()) for w in detected_words]
    scr_norm = [re.sub(r"[^\w]", "", w.lower()) for w in script_words]

    matcher = SequenceMatcher(None, det_norm, scr_norm)
    aligned = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for di, sj in zip(range(i1, i2), range(j1, j2)):
                item = dict(detected_words[di])
                item["text"] = script_words[sj] + " "
                item["confidence"] = 1.0
                aligned.append(item)
        elif tag in ("replace", "insert", "delete"):
            scr_slice = script_words[j1:j2]
            det_slice = detected_words[i1:i2]
            if not scr_slice:
                continue
            if det_slice:
                start_ms = det_slice[0]["startMs"]
                end_ms = det_slice[-1]["endMs"]
            else:
                prev_end = aligned[-1]["endMs"] if aligned else detected_words[0]["startMs"]
                next_start = detected_words[i2]["startMs"] if i2 < len(detected_words) else prev_end + len(scr_slice) * 220
                start_ms = prev_end
                end_ms = max(start_ms + len(scr_slice) * 120, next_start)

            span = max(len(scr_slice) * 60, end_ms - start_ms)
            step = span / len(scr_slice)
            for idx, sw in enumerate(scr_slice):
                w_start = int(round(start_ms + idx * step))
                w_end = int(round(start_ms + (idx + 1) * step))
                aligned.append({
                    "text": sw + " ",
                    "startMs": w_start,
                    "endMs": w_end,
                    "timestampMs": int(round((w_start + w_end) / 2)),
                    "confidence": 0.98
                })

    return aligned


def run_whisperx_or_faster_whisper(audio_path: str, script_text: str, lang: str, model_name: str, device: str):
    script_words = tokenize_script(script_text)
    initial_prompt = " ".join(script_words) if script_words else "Thủy Ngân Limousine, xe giường nằm, cabin đôi, ghế da massage êm như mây."

    detected_words = []

    # 1. Try WhisperX (with phoneme/wav2vec2 forced alignment)
    try:
        import torch
        import whisperx

        compute_type = "float16" if (device == "cuda" and torch.cuda.is_available()) else "int8"
        actual_device = "cuda" if (device == "cuda" and torch.cuda.is_available()) else "cpu"

        model = whisperx.load_model(
            model_name,
            actual_device,
            compute_type=compute_type,
            asr_options={"initial_prompt": initial_prompt}
        )
        audio = whisperx.load_audio(audio_path)
        result = model.transcribe(audio, batch_size=8, language=lang)

        model_a, metadata = whisperx.load_align_model(language_code=lang, device=actual_device)
        aligned_res = whisperx.align(
            result["segments"],
            model_a,
            metadata,
            audio,
            actual_device,
            return_char_alignments=False
        )

        for seg in aligned_res.get("segments", []):
            for w in seg.get("words", []):
                word_txt = (w.get("word") or "").strip()
                if not word_txt:
                    continue
                s_ms = int(round(float(w.get("start", seg.get("start", 0.0))) * 1000))
                e_ms = int(round(float(w.get("end", s_ms / 1000.0 + 0.18)) * 1000))
                detected_words.append({
                    "text": word_txt + " ",
                    "startMs": s_ms,
                    "endMs": max(s_ms + 60, e_ms),
                    "timestampMs": int(round((s_ms + e_ms) / 2)),
                    "confidence": round(float(w.get("score", 0.95)), 3)
                })
        return force_align_words_to_script(detected_words, script_words)
    except Exception:
        pass

    # 2. Fallback to faster-whisper with word_timestamps=True and initial_prompt
    from faster_whisper import WhisperModel

    fw_model = WhisperModel(model_name, device=device, compute_type="int8")
    segments, _ = fw_model.transcribe(
        audio_path,
        language=lang,
        initial_prompt=initial_prompt,
        word_timestamps=True,
        vad_filter=True
    )
    for seg in segments:
        for w in (seg.words or []):
            word_txt = (w.word or "").strip()
            if not word_txt:
                continue
            s_ms = int(round(float(w.start) * 1000))
            e_ms = int(round(float(w.end) * 1000))
            detected_words.append({
                "text": word_txt + " ",
                "startMs": s_ms,
                "endMs": max(s_ms + 60, e_ms),
                "timestampMs": int(round((s_ms + e_ms) / 2)),
                "confidence": round(float(getattr(w, "probability", 0.95)), 3)
            })

    return force_align_words_to_script(detected_words, script_words)


def main():
    parser = argparse.ArgumentParser(description="WhisperX / Faster-Whisper Subtitle Aligner")
    parser.add_argument("--audio", required=True, help="Input audio file path")
    parser.add_argument("--script", default="", help="Original script text or path to text file")
    parser.add_argument("--lang", default="vi", help="Language code (default: vi)")
    parser.add_argument("--model", default="small", help="Whisper model size (default: small)")
    parser.add_argument("--device", default="cpu", help="cpu or cuda")
    parser.add_argument("--out", required=True, help="Output JSON file path (@remotion/captions format)")
    args = parser.parse_args()

    script_text = args.script
    if script_text and os.path.isfile(script_text):
        with open(script_text, "r", encoding="utf-8") as f:
            script_text = f.read()

    captions = run_whisperx_or_faster_whisper(
        audio_path=args.audio,
        script_text=script_text,
        lang=args.lang,
        model_name=args.model,
        device=args.device
    )

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(captions, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
