#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx<1",
# ]
# ///

import json
import os
import sys

import httpx


def single_file_req(file: str, text: bool) -> None:
    with httpx.Client() as client:
        with open(file, "rb") as f:
            files = {"file": f}
            response = client.post(
                "http://localhost:5000/parse",
                params={"text": "true" if text else "false"},
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


def multiple_file_req(directory: str, text: bool) -> None:
    with httpx.Client(timeout=60) as client:
        fls = [
            ("files", open(os.path.join(directory, f), "rb"))
            for f in os.listdir(directory)
        ]
        response = client.post(
            "http://localhost:5000/batch/parse",
            params={"text": "true" if text else "false"},
            files=fls,
        )
        response.raise_for_status()
        txt = response.content.decode("utf-8")
    print("RESPONSE")
    try:
        t = json.loads(txt)
        print(json.dumps(t, indent=2))
    except Exception:
        print(txt)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "You should provide at least 2 arguments ('file /path/to/file.pdf' or 'dir /path/to/dir')"
        )
    if sys.argv[1] == "file":
        text = False
        if len(sys.argv) >= 4 and sys.argv[3] == "text":
            text = True
        single_file_req(sys.argv[2], text)
    else:
        text = False
        if len(sys.argv) >= 4 and sys.argv[3] == "text":
            text = True
        multiple_file_req(sys.argv[2], text)
