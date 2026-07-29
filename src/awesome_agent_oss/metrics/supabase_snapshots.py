"""Supabase snapshot persistence for collected repository metrics."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from typing import Any

from awesome_agent_oss.registry import RegistryError
from awesome_agent_oss.supabase_client import SupabaseClient, SupabaseClientError
from awesome_agent_oss.supabase_registry import load_supabase_accepted_repository_rows


class SupabaseSnapshotError(RuntimeError):
    """Raised when Supabase snapshot persistence fails."""


def write_supabase_snapshot(
    rows: Iterable[Mapping[str, Any]],
    client: SupabaseClient | None = None,
    now: datetime | None = None,
) -> int:
    """Upsert collected metric rows into repository_snapshots."""
    supabase = client or SupabaseClient.from_env()
    repository_ids = load_repository_ids(supabase)
    snapshot_rows = [
        snapshot_row(row, repository_ids, now=now)
        for row in rows
    ]

    try:
        stored = supabase.upsert(
            "repository_snapshots",
            snapshot_rows,
            on_conflict="repository_id,snapshot_date",
        )
    except SupabaseClientError as error:
        raise SupabaseSnapshotError(str(error)) from error

    return len(stored)


def load_repository_ids(client: SupabaseClient) -> dict[str, int]:
    """Return accepted repository ids keyed by full_name."""
    try:
        rows = load_supabase_accepted_repository_rows(client)
    except RegistryError as error:
        raise SupabaseSnapshotError(str(error)) from error

    repository_ids: dict[str, int] = {}
    for row in rows:
        full_name = row.get("full_name")
        repository_id = row.get("id")
        if isinstance(full_name, str) and isinstance(repository_id, int):
            repository_ids[full_name] = repository_id

    return repository_ids


def snapshot_row(
    row: Mapping[str, Any],
    repository_ids: dict[str, int],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Convert a collected metrics row to a repository_snapshots row."""
    full_name = row.get("full_name")
    if not isinstance(full_name, str):
        raise SupabaseSnapshotError("Collected metric row must include full_name.")

    repository_id = repository_ids.get(full_name)
    if repository_id is None:
        raise SupabaseSnapshotError(f"Repository is not accepted in Supabase: {full_name}")

    collected_at = row.get("collected_at")
    collected = parse_datetime(collected_at) if isinstance(collected_at, str) else None
    collected = collected or now or datetime.now(UTC)
    collected = collected.astimezone(UTC)

    return {
        "repository_id": repository_id,
        "snapshot_date": collected.date().isoformat(),
        "collected_at": collected.isoformat(),
        "html_url": nullable_str(row.get("html_url")),
        "description": nullable_str(row.get("description")),
        "topics": list_value(row.get("topics")),
        "stars": nullable_int(row.get("stars")),
        "forks": nullable_int(row.get("forks")),
        "open_issues": nullable_int(row.get("open_issues")),
        "watchers": nullable_int(row.get("watchers")),
        "license": nullable_str(row.get("license")),
        "license_name": nullable_str(row.get("license_name")),
        "default_branch": nullable_str(row.get("default_branch")),
        "language": nullable_str(row.get("language")),
        "github_created_at": nullable_str(row.get("created_at")),
        "github_updated_at": nullable_str(row.get("updated_at")),
        "pushed_at": nullable_str(row.get("pushed_at")),
        "archived": nullable_bool(row.get("archived")),
        "disabled": nullable_bool(row.get("disabled")),
        "fork": nullable_bool(row.get("fork")),
        "latest_release_tag": nullable_str(row.get("latest_release_tag")),
        "latest_release_name": nullable_str(row.get("latest_release_name")),
        "latest_release_published_at": nullable_str(row.get("latest_release_published_at")),
    }


def parse_datetime(value: str) -> datetime:
    """Parse GitHub or Python ISO timestamps."""
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def nullable_str(value: Any) -> str | None:
    """Return value as string or None."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(value)


def nullable_int(value: Any) -> int | None:
    """Return value when it is an integer but not a boolean."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def nullable_bool(value: Any) -> bool | None:
    """Return value when it is a boolean."""
    if isinstance(value, bool):
        return value
    return None


def list_value(value: Any) -> list[str]:
    """Return a string list for Postgres text[] columns."""
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]
