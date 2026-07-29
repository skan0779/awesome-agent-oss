"""Snapshot persistence helpers for collected repository metrics."""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def snapshot_date(now: datetime | None = None) -> str:
    """Return the UTC date string used for snapshot filenames."""
    current = now or datetime.now(UTC)
    return current.astimezone(UTC).date().isoformat()


def snapshot_path(snapshot_dir: Path, now: datetime | None = None) -> Path:
    """Return the JSONL snapshot path for the given timestamp."""
    return snapshot_dir / f"{snapshot_date(now)}.jsonl"


def write_jsonl_snapshot(
    rows: Iterable[Mapping[str, Any]],
    snapshot_dir: Path,
    now: datetime | None = None,
) -> Path:
    """Write metric rows as a daily JSONL snapshot and return the file path."""
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    path = snapshot_path(snapshot_dir, now)

    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            file.write("\n")

    return path


def read_jsonl_snapshot(path: Path) -> list[dict[str, Any]]:
    """Read a JSONL snapshot file."""
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows
