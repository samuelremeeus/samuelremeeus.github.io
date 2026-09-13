#!/usr/bin/env python3
"""Upload generated portfolio media to Cloudflare R2.

Image keys omit the local ``assets/img`` segment while video keys keep a
``video`` segment, so the public layout is:

  media/v1/full/example.jpg
  media/v1/grid/example.jpg
  media/v1/video/example.mp4
  media/v1/video/poster/example.jpg
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import subprocess
import sys
import threading


ROOT = Path(__file__).resolve().parents[1]
IMAGE_ROOT = (ROOT / "assets" / "img").resolve()
VIDEO_ROOT = (ROOT / "assets" / "video").resolve()
DEFAULT_BUCKET = "samuel-remeeus-portfolio-media"
DEFAULT_PREFIX = "media/v1"
WRANGLER = ("npx", "-y", "wrangler@4.131.1")
CACHE_CONTROL = "public, max-age=31536000, immutable"
MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp4": "video/mp4",
}
PRINT_LOCK = threading.Lock()


def positive_jobs(value: str) -> int:
    jobs = int(value)
    if not 1 <= jobs <= 16:
        raise argparse.ArgumentTypeError("jobs must be between 1 and 16")
    return jobs


def media_key(path: Path, prefix: str) -> str:
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(IMAGE_ROOT)
        return f"{prefix}/{relative.as_posix()}"
    except ValueError:
        pass

    try:
        relative = resolved.relative_to(VIDEO_ROOT)
        return f"{prefix}/video/{relative.as_posix()}"
    except ValueError as exc:
        raise ValueError(f"outside supported media folders: {path}") from exc


def media_files(requested: list[str]) -> list[Path]:
    candidates: list[Path] = []
    if requested:
        for raw_path in requested:
            path = Path(raw_path)
            if not path.is_absolute():
                path = ROOT / path
            path = path.resolve()
            if path.is_dir():
                candidates.extend(item for item in path.rglob("*") if item.is_file())
            elif path.is_file():
                candidates.append(path)
            else:
                raise ValueError(f"media path does not exist: {raw_path}")
    else:
        for root in (IMAGE_ROOT, VIDEO_ROOT):
            candidates.extend(item for item in root.rglob("*") if item.is_file())

    files: dict[Path, None] = {}
    for path in candidates:
        if path.suffix.lower() not in MIME_TYPES:
            continue
        media_key(path, DEFAULT_PREFIX)
        files[path] = None
    return sorted(files, key=lambda item: item.as_posix())


def upload(path: Path, bucket: str, prefix: str) -> str:
    key = media_key(path, prefix)
    command = [
        *WRANGLER,
        "r2",
        "object",
        "put",
        f"{bucket}/{key}",
        "--file",
        str(path),
        "--content-type",
        MIME_TYPES[path.suffix.lower()],
        "--cache-control",
        CACHE_CONTROL,
        "--remote",
    ]
    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        details = (result.stderr or result.stdout).strip()
        raise RuntimeError(details or f"Wrangler exited with {result.returncode}")
    return key


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", help="Optional files or folders to upload")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--jobs", type=positive_jobs, default=4)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    prefix = args.prefix.strip("/")
    if not prefix:
        parser.error("prefix cannot be empty")

    try:
        files = media_files(args.paths)
    except ValueError as exc:
        parser.error(str(exc))

    if not files:
        print("No supported media files found.")
        return 0

    if args.dry_run:
        for path in files:
            print(f"{path.relative_to(ROOT)} -> {media_key(path, prefix)}")
        print(f"Dry run: {len(files)} objects")
        return 0

    failures: list[tuple[Path, str]] = []
    completed = 0
    print(
        f"Uploading {len(files)} objects to r2://{args.bucket}/{prefix}/ "
        f"with {args.jobs} workers"
    )
    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        pending = {
            executor.submit(upload, path, args.bucket, prefix): path for path in files
        }
        for future in as_completed(pending):
            path = pending[future]
            try:
                key = future.result()
                completed += 1
                with PRINT_LOCK:
                    print(f"[{completed}/{len(files)}] {key}", flush=True)
            except Exception as exc:  # keep independent uploads running
                failures.append((path, str(exc)))
                with PRINT_LOCK:
                    print(f"FAILED {path.relative_to(ROOT)}: {exc}", file=sys.stderr, flush=True)

    if failures:
        print(f"Upload finished with {len(failures)} failure(s).", file=sys.stderr)
        return 1

    print(f"Upload complete: {completed} objects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
