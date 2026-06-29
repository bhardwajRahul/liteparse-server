#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx<1",
# ]
# ///

import base64
import json
import sys
from pathlib import Path

import httpx


def single_file_req(file: str, text: bool, markdown: bool) -> None:
    with httpx.Client() as client:
        with open(file, "rb") as f:
            files = {"file": f}
            response = client.post(
                "http://localhost:5707/parse",
                params={
                    "text": "true" if text else "false",
                    "markdown": "true" if markdown else "false",
                },
                files=files,
            )
            response.raise_for_status()
            txt = response.content.decode("utf-8")
    print("RESPONSE")
    try:
        t = json.loads(txt)
        print(json.dumps(t, indent=2))
    except Exception:
        print(txt)


def is_complex_req(file: str) -> None:
    with httpx.Client() as client:
        with open(file, "rb") as f:
            files = {"file": f}
            response = client.post(
                "http://localhost:5707/is-complex",
                files=files,
            )
            response.raise_for_status()
            txt = response.content.decode("utf-8")
    print("RESPONSE")
    try:
        t = json.loads(txt)
        print(json.dumps(t, indent=2))
    except Exception:
        print(txt)


def screenshot_req(file: str, pages: str | None, output_dir: str = ".") -> None:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    with httpx.Client() as client:
        with open(file, "rb") as f:
            with client.stream(
                "POST",
                "http://localhost:5707/screenshots",
                params={"pages": pages} if pages else {},
                files={"file": f},
            ) as response:
                response.raise_for_status()

                buffer = ""
                for chunk in response.iter_text():
                    buffer += chunk
                    lines = buffer.split("\n")
                    buffer = lines.pop()

                    for line in lines:
                        if not line.strip():
                            continue
                        payload = json.loads(line)
                        ext = payload["mimetype"].split("/")[-1]  # e.g. "png"
                        image_bytes = base64.b64decode(payload["data"])
                        out_file = output_path / f"page_{payload['index']}.{ext}"
                        out_file.write_bytes(image_bytes)
                        print(f"Saved {out_file}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "You should provide at least 2 arguments ('file /path/to/file.pdf' or 'dir /path/to/dir')"
        )
    if sys.argv[1] == "file":
        text = False
        md = False
        if len(sys.argv) >= 4 and sys.argv[3] == "text":
            text = True
        if len(sys.argv) >= 4 and sys.argv[3] == "markdown":
            md = True
        single_file_req(sys.argv[2], text, md)
    elif sys.argv[1] == "screen":
        pages = None
        if len(sys.argv) >= 4 and sys.argv[3].startswith("pages="):
            pages = sys.argv[3].removeprefix("pages=")
        screenshot_req(sys.argv[2], pages)
    elif sys.argv[1] == "is-complex":
        is_complex_req(sys.argv[2])
    else:
        print(f"Unrecognized command: {sys.argv[1]}")
