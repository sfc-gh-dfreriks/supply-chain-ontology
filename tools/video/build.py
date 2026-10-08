#!/usr/bin/env python3
"""Build the narrated walkthrough video.

Four phases, in order, because each depends on the last:

  1. narrate  synthesise per-segment audio, measure its real duration
  2. capture  drive the live app with Playwright, dwelling per measured duration
  3. cards    render popup PNGs with alpha (needs capture's timeline.json)
  4. assemble ffmpeg: video + narration + overlays -> mp4

Timing is audio-led. The narration is produced first and the browser then holds
each step for exactly as long as its line takes to speak. Doing it the other way —
fixing the visuals and stretching audio to fit — drifts within a minute and there is
no way to recover sync afterwards.

Usage:
    python3 tools/video/build.py                 # everything
    python3 tools/video/build.py --engine say --voice Daniel  # a macOS system voice
    python3 tools/video/build.py --phase cards   # one phase only
"""

import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from segments import NAV, SEGMENTS  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = pathlib.Path("/tmp/sc_video")
OUT = pathlib.Path.home() / "Documents" / "SAP" / "Supply_Chain_Ontology_Walkthrough.mp4"

APP = "http://localhost:5179/"
W, H = 1600, 1000              # browser viewport
BAND = 132                     # caption band drawn BELOW the app, not over it
VH = H + BAND                  # final canvas height
FPS = 25

# Brand, matching the Word deliverables and the app.
NAVY = (27, 58, 87)
BLUE = (41, 181, 232)
WHITE = (255, 255, 255)
DIM = (176, 196, 212)

# Lead-in and tail so the video does not start or end abruptly.
TITLE_SECS = 5.0
END_SECS = 5.5
PAD_AFTER_SPEECH = 0.55        # a beat of silence after each line


# Cloned-voice engine: Qwen3-TTS via mlx-audio in its own venv. The renderer and
# the reference recording are shared with the 360 video builder.
HOME = pathlib.Path.home()
VOICECLONE = HOME / ".snowflake" / "video" / "voiceclone"
QWEN_SAY = (HOME / "Documents" / "SAP" / "SAP Skills" / "sap-bdc-finance-360"
            / "tools" / "voiceclone" / "qwen_say.py")
REF_AUDIO = VOICECLONE / "ref" / "dave.wav"
REF_TEXT = HOME / "Desktop" / "voice_samples" / "dave_reference.txt"


def qwen_batch(items):
    """Voice [(text, dest_wav)] in Dave's cloned voice with one model load."""
    py = VOICECLONE / ".venv" / "bin" / "python"
    for f in (py, QWEN_SAY, REF_AUDIO, REF_TEXT):
        if not f.exists():
            sys.exit(f"qwen3 engine needs {f}")
    jobs = WORK / "qwen_jobs.json"
    jobs.write_text(json.dumps(dict(ref_audio=str(REF_AUDIO), ref_text=REF_TEXT.read_text().strip(),
                                    jobs=[dict(text=t, out=str(d)) for t, d in items])))
    r = subprocess.run([str(py), str(QWEN_SAY), str(jobs)], capture_output=True, text=True)
    if r.returncode:
        sys.exit("Qwen3-TTS failed:\n" + r.stderr[-2000:])


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def duration(path):
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "csv=p=0", str(path)]).stdout.strip()
    return float(out)


# ------------------------------------------------------------------- 1. narrate

def phase_narrate(voice, rate, engine="qwen3"):
    """Synthesise each line and measure it. Start offsets come later, from the
    capture itself — page loads and navigation cost real time that cannot be
    predicted, and guessing it put the captions 10s early by the end."""
    d = WORK / "audio"
    d.mkdir(parents=True, exist_ok=True)
    clips = []
    if engine == "qwen3":
        print("  voicing all segments with Qwen3-TTS (cloned voice)…")
        qwen_batch([(seg["narration"], d / f"{seg['id']}.aiff") for seg in SEGMENTS])
    for seg in SEGMENTS:
        aiff = d / f"{seg['id']}.aiff"   # a WAV under qwen3; ffmpeg reads it by content
        wav = d / f"{seg['id']}.wav"
        if engine != "qwen3":
            run(["say", "-v", voice, "-r", str(rate), "-o", str(aiff), seg["narration"]])
        # 48k stereo so every clip concatenates without resampling surprises
        run(["ffmpeg", "-y", "-v", "error", "-i", str(aiff),
             "-ar", "48000", "-ac", "2", str(wav)])
        spoken = duration(wav)
        clips.append(dict(id=seg["id"], page=seg["page"],
                          secs=round(spoken + PAD_AFTER_SPEECH, 3),
                          spoken=round(spoken, 3),
                          actions=seg["actions"], popup=seg["popup"]))
        print(f"  {seg['id']:16} {spoken:6.2f}s spoken  -> holds "
              f"{spoken + PAD_AFTER_SPEECH:5.2f}s")

    (WORK / "clips.json").write_text(json.dumps(
        dict(voice="Qwen3-TTS clone of Dave" if engine == "qwen3" else voice, rate=rate, title=TITLE_SECS, end=END_SECS,
             clips=clips), indent=2))
    spk = sum(c["secs"] for c in clips)
    print(f"\n  {len(clips)} clips · {spk:.1f}s of narration")
    return spk


def build_audio_track():
    """Lay each clip at the offset the capture actually reached.

    Built with adelay + amix rather than concat so a clip lands on its real
    timestamp; concatenating assumes the video had no unaccounted time, which it
    always does — page loads and sidebar navigation are not free.
    """
    tl = json.loads((WORK / "timeline.json").read_text())
    d = WORK / "audio"
    total = tl["total"]

    inputs, filt, labels = [], [], []
    for i, s in enumerate(tl["segments"]):
        inputs += ["-i", str(d / f"{s['id']}.wav")]
        ms = int(round(s["start"] * 1000))
        filt.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
        labels.append(f"[a{i}]")
    filt.append(f"{''.join(labels)}amix=inputs={len(labels)}:"
                f"normalize=0:dropout_transition=0[mixed]")
    filt.append(f"[mixed]apad,atrim=0:{total:.3f}[out]")

    raw = WORK / "narration_raw.wav"
    run(["ffmpeg", "-y", "-v", "error", *inputs,
         "-filter_complex", ";".join(filt), "-map", "[out]",
         "-ar", "48000", "-ac", "2", str(raw)])

    final = WORK / "narration.wav"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(raw),
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", str(final)])
    print(f"  narration track {duration(final):.1f}s, normalised to -16 LUFS")
    return final


# --------------------------------------------------------------------- 2. cards

def _font(size, bold=False):
    from PIL import ImageFont
    for name in ([" /System/Library/Fonts/Supplemental/Arial Bold.ttf".strip(),
                  "/System/Library/Fonts/Helvetica.ttc"] if bold else
                 ["/System/Library/Fonts/Supplemental/Arial.ttf",
                  "/System/Library/Fonts/Helvetica.ttc"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap(draw, text, font, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if draw.textlength(t, font=font) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def card(popup, path):
    """One caption strip, full width, sitting in the band below the app.

    Overlaying cards on top of the app was the first design and it hid whichever
    panel it landed on — and on these pages every region carries something. Giving
    captions their own band costs 132px of canvas and hides nothing.
    """
    from PIL import Image, ImageDraw
    f_title, f_fig, f_body = _font(24, True), _font(27, True), _font(17)

    img = Image.new("RGBA", (W, BAND), NAVY + (255,))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 3], fill=BLUE + (255,))          # accent rule on top
    d.rectangle([44, 26, 48, BAND - 26], fill=BLUE + (255,))

    x = 70
    d.text((x, 24), popup["title"], font=f_title, fill=WHITE)
    body_lines = _wrap(d, popup["body"], f_body, 880)[:2]
    y = 60
    for ln in body_lines:
        d.text((x, y), ln, font=f_body, fill=DIM)
        y += 24

    # the figure sits right-aligned, so the eye can find it without reading
    fw = d.textlength(popup["figure"], font=f_fig)
    d.text((W - 70 - fw, 44), popup["figure"], font=f_fig, fill=BLUE)

    img.save(path)
    return img.size


def title_card(path, sub):
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (W, VH), NAVY + (255,))
    d = ImageDraw.Draw(img)
    d.text((90, 360), "Supply Chain Ontology", font=_font(34, True), fill=BLUE)
    d.text((90, 410), "Scenario modelling: a hurricane closes Austin",
           font=_font(52, True), fill=WHITE)
    d.text((90, 500), sub, font=_font(20), fill=DIM)
    d.rounded_rectangle([90, 560, 250, 564], 2, fill=BLUE + (255,))
    img.save(path)


def end_card(path):
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (W, VH), NAVY + (255,))
    d = ImageDraw.Draw(img)
    d.text((90, 330), "Explore it yourself", font=_font(44, True), fill=WHITE)
    rows = [("Live application", "sfc-gh-dfreriks.github.io/supply-chain-ontology"),
            ("Source and documentation", "github.com/sfc-gh-dfreriks/supply-chain-ontology"),
            ("Built on", "SAP data in Snowflake · Cortex AI · no pipeline, no copies")]
    y = 420
    for k, v in rows:
        d.text((90, y), k, font=_font(15), fill=DIM)
        d.text((90, y + 22), v, font=_font(22, True), fill=BLUE)
        y += 78
    img.save(path)


def phase_cards():
    d = WORK / "cards"
    d.mkdir(parents=True, exist_ok=True)
    tl = json.loads((WORK / "timeline.json").read_text())
    for s in tl["segments"]:
        size = card(s["popup"], d / f"{s['id']}.png")
        s["card"] = list(size)
    (WORK / "timeline.json").write_text(json.dumps(tl, indent=2))
    mins = tl["total"] / 60
    title_card(d / "_title.png",
               f"A narrated walkthrough · {mins:.0f} minutes · "
               f"figures computed live, not illustrative")
    end_card(d / "_end.png")
    print(f"  {len(tl['segments'])} popup cards + title + end card")


# ------------------------------------------------------------------- 3. capture

def phase_capture():
    import time
    from playwright.sync_api import sync_playwright
    cl = json.loads((WORK / "clips.json").read_text())
    vid = WORK / "raw"
    if vid.exists():
        shutil.rmtree(vid)
    vid.mkdir(parents=True)

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--force-device-scale-factor=1"])
        ctx = b.new_context(viewport={"width": W, "height": H},
                            record_video_dir=str(vid),
                            record_video_size={"width": W, "height": H})
        pg = ctx.new_page()
        pg.goto(APP, wait_until="networkidle")
        pg.wait_for_timeout(2500)

        # t0 marks video-time zero for the timeline. Everything before it is
        # page-load noise and gets trimmed off the front in assembly.
        t0 = time.monotonic()
        pg.wait_for_timeout(int(TITLE_SECS * 1000))

        segments, cur_page = [], None
        for s in cl["clips"]:
            if s["page"] != cur_page:
                pg.get_by_role("button", name=NAV[s["page"]], exact=True).click()
                pg.wait_for_timeout(1300)
                cur_page = s["page"]

            for act in s["actions"]:
                do_action(pg, act)

            # The caption and the voice line begin now, whatever time the
            # navigation and clicks happened to consume.
            start = time.monotonic() - t0
            pg.wait_for_timeout(int(s["secs"] * 1000))
            segments.append({**s, "start": round(start, 3)})
            print(f"  {s['id']:16} {s['page']:11} starts {start:7.2f}s  "
                  f"holds {s['secs']:5.2f}s")

        pg.wait_for_timeout(int(END_SECS * 1000))
        total = time.monotonic() - t0
        path = pg.video.path()
        ctx.close()
        b.close()

    src = pathlib.Path(path)
    dst = WORK / "screen.webm"
    shutil.move(str(src), dst)

    raw = duration(dst)
    preroll = round(raw - total, 3)      # page-load time before t0
    (WORK / "timeline.json").write_text(json.dumps(
        dict(total=round(total, 3), preroll=max(0.0, preroll),
             title=cl["title"], end=cl["end"],
             voice=cl["voice"], rate=cl["rate"], segments=segments), indent=2))
    print(f"\n  captured {raw:.1f}s · timeline {total:.1f}s · "
          f"pre-roll to trim {preroll:.1f}s")
    build_audio_track()
    return dst


def do_action(pg, act):
    """Run one scripted action, returning roughly how long it consumed."""
    kind = act[0]
    if kind == "click_text":
        pg.get_by_text(act[1], exact=False).first.click()
        pg.wait_for_timeout(600)
        return 600
    if kind == "click_chip":
        # Ripple rail chips: "start", "1a", "1b" …
        pg.get_by_role("button", name=act[1], exact=True).first.click()
        pg.wait_for_timeout(1100)          # let the camera settle
        return 1100
    if kind == "click_chip_exact":
        pg.get_by_role("button", name=act[1], exact=True).first.click()
        pg.wait_for_timeout(1100)
        return 1100
    if kind == "set_pace":
        sel = pg.locator("select").first
        if sel.count():
            sel.select_option(act[1])
        pg.wait_for_timeout(300)
        return 300
    if kind == "close_popover":
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(250)
        return 250
    if kind == "scroll":
        pg.mouse.wheel(0, act[1])
        pg.wait_for_timeout(500)
        return 500
    if kind == "wait":
        pg.wait_for_timeout(act[1])
        return act[1]
    raise ValueError(f"unknown action {act!r}")


# ------------------------------------------------------------------ 4. assemble

def phase_assemble():
    """Composite screen recording + caption band + narration into the mp4.

    Each caption is fed as a LOOPED image lasting exactly its own window. A
    single-frame PNG cannot be faded: its only frame sits at PTS 0, so
    `fade=t=in:st=246` leaves that frame fully transparent and the caption never
    appears — which is precisely what happened the first time. Looping gives the
    fade real frames to work on, and `setpts` moves the clip to its slot so only
    its own window is ever generated.
    """
    tl = json.loads((WORK / "timeline.json").read_text())
    screen = WORK / "screen.webm"
    audio = WORK / "narration.wav"
    cards = WORK / "cards"
    total = tl["total"]
    pre = tl.get("preroll", 0.0)

    inputs = ["-i", str(screen)]
    # title and end cards, each looped for their own hold
    inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{tl['title']:.3f}",
               "-i", str(cards / "_title.png")]
    inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{tl['end'] + 0.5:.3f}",
               "-i", str(cards / "_end.png")]
    for s_ in tl["segments"]:
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{s_['secs']:.3f}",
                   "-i", str(cards / f"{s_['id']}.png")]
    inputs += ["-i", str(audio)]
    audio_idx = 3 + len(tl["segments"])

    fc = []
    # trim the page-load pre-roll so video time zero is timeline time zero, then
    # pad downward to make room for the caption band
    fc.append(f"[0:v]trim=start={pre:.3f},setpts=PTS-STARTPTS,"
              f"fps={FPS},scale={W}:{H},setsar=1,"
              f"pad={W}:{VH}:0:0:color=0x1B3A57[base]")

    # title card: holds from 0, fades out just before the app is revealed
    fc.append(f"[1:v]format=rgba,fade=t=out:st={max(0.0, tl['title']-0.6):.3f}:"
              f"d=0.6:alpha=1[tc]")
    fc.append(f"[base][tc]overlay=0:0:enable='lt(t,{tl['title']:.3f})'[v0]")

    prev = "v0"
    for i, s_ in enumerate(tl["segments"]):
        st, dur = s_["start"], s_["secs"]
        en = st + dur
        lbl, nxt = f"c{i}", f"v{i+1}"
        fo = max(0.0, dur - 0.4)
        fc.append(f"[{3+i}:v]format=rgba,"
                  f"fade=t=in:st=0:d=0.3:alpha=1,"
                  f"fade=t=out:st={fo:.3f}:d=0.4:alpha=1,"
                  f"setpts=PTS+{st:.3f}/TB[{lbl}]")
        fc.append(f"[{prev}][{lbl}]overlay=0:{H}:"
                  f"enable='between(t,{st:.3f},{en:.3f})'[{nxt}]")
        prev = nxt

    end_start = total - tl["end"]
    fc.append(f"[2:v]format=rgba,fade=t=in:st=0:d=0.6:alpha=1,"
              f"setpts=PTS+{end_start:.3f}/TB[ec]")
    fc.append(f"[{prev}][ec]overlay=0:0:enable='gte(t,{end_start:.3f})'[vout]")

    cmd = ["ffmpeg", "-y", "-v", "error", "-stats", *inputs,
           "-filter_complex", ";".join(fc),
           "-map", "[vout]", "-map", f"{audio_idx}:a",
           "-t", f"{total:.2f}",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart",
           "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
           str(OUT)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(cmd, check=True)
    print(f"\n  wrote {OUT}")
    print(f"  {duration(OUT):.1f}s · {OUT.stat().st_size // 1024 // 1024} MB")


# ------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="Samantha")
    ap.add_argument("--rate", type=int, default=168)
    ap.add_argument("--engine", choices=["qwen3", "say"], default="qwen3",
                    help="qwen3 = Dave's cloned voice (Qwen3-TTS); say = a macOS system voice")
    ap.add_argument("--phase", choices=["narrate", "cards", "capture", "assemble"])
    a = ap.parse_args()

    WORK.mkdir(parents=True, exist_ok=True)
    # capture before cards: phase_cards reads timeline.json, which only capture writes
    phases = [a.phase] if a.phase else ["narrate", "capture", "cards", "assemble"]

    for ph in phases:
        print(f"\n=== {ph} ===")
        if ph == "narrate":
            phase_narrate(a.voice, a.rate, a.engine)
        elif ph == "cards":
            phase_cards()
        elif ph == "capture":
            phase_capture()
        elif ph == "assemble":
            phase_assemble()


if __name__ == "__main__":
    main()
