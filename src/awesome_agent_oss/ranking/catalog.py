"""Build generated catalog data from Supabase metric snapshots."""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from awesome_agent_oss.supabase_client import SupabaseClient, SupabaseClientError
from awesome_agent_oss.supabase_registry import (
    RegistryError,
    load_supabase_accepted_repository_rows,
)


DEFAULT_GENERATED_DIR = Path("data/generated")
DEFAULT_CATALOG_PATH = DEFAULT_GENERATED_DIR / "catalog.json"


class CatalogBuildError(RuntimeError):
    """Raised when generated catalog data cannot be built."""


@dataclass(frozen=True)
class Snapshot:
    """Rows collected on one snapshot date."""

    snapshot_date: date
    rows: list[dict[str, Any]]


def build_supabase_catalog(
    output_path: Path = DEFAULT_CATALOG_PATH,
    now: datetime | None = None,
    client: SupabaseClient | None = None,
) -> dict[str, Any]:
    """Build a generated catalog JSON file from Supabase metric snapshots."""
    supabase = client or SupabaseClient.from_env()
    section_definitions = load_supabase_section_definitions(client=supabase)
    snapshots = load_supabase_snapshots(client=supabase)
    if not snapshots:
        raise CatalogBuildError("No Supabase snapshot rows found.")

    return build_catalog_from_snapshots(
        snapshots,
        output_path=output_path,
        now=now,
        section_definitions=section_definitions,
    )


def build_catalog_from_snapshots(
    snapshots: list[Snapshot],
    output_path: Path = DEFAULT_CATALOG_PATH,
    now: datetime | None = None,
    section_definitions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build generated catalog data from loaded snapshots."""
    generated_at = (now or datetime.now(UTC)).astimezone(UTC).isoformat()
    latest_snapshot = snapshots[-1]
    rows_by_repo = group_rows_by_repo(snapshots)

    repositories = [
        build_catalog_entry(full_name, rows, latest_snapshot.snapshot_date)
        for full_name, rows in sorted(rows_by_repo.items())
    ]
    repositories.sort(key=lambda row: (row["score"], row["stars"] or 0, row["full_name"]), reverse=True)

    catalog = {
        "generated_at": generated_at,
        "snapshot_date": latest_snapshot.snapshot_date.isoformat(),
        "repository_count": len(repositories),
        "repositories": repositories,
        "sections": build_sections(repositories),
    }
    if section_definitions is not None:
        catalog["section_definitions"] = section_definitions

    write_catalog(catalog, output_path)
    return catalog


def load_supabase_section_definitions(
    client: SupabaseClient | None = None,
) -> list[dict[str, Any]]:
    """Load section definitions from Supabase."""
    supabase = client or SupabaseClient.from_env()
    try:
        rows = supabase.select(
            "sections",
            columns="id,name,description,sort_order",
            params={"order": "sort_order.asc,id.asc"},
        )
    except SupabaseClientError as error:
        raise CatalogBuildError(str(error)) from error

    section_definitions: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        section_id = row.get("id")
        name = row.get("name")
        description = row.get("description")
        sort_order = row.get("sort_order")
        if not isinstance(section_id, str) or not section_id:
            raise CatalogBuildError(f"Supabase sections row #{index + 1} must include id.")
        if not isinstance(name, str) or not name:
            raise CatalogBuildError(f"Supabase sections row #{index + 1} must include name.")

        section_definitions.append(
            {
                "id": section_id,
                "name": name,
                "description": description if isinstance(description, str) else "",
                "sort_order": sort_order if isinstance(sort_order, int) else index,
            }
        )

    return section_definitions


def load_supabase_snapshots(client: SupabaseClient | None = None) -> list[Snapshot]:
    """Load Supabase snapshots in date order."""
    supabase = client or SupabaseClient.from_env()
    try:
        accepted_rows = load_supabase_accepted_repository_rows(supabase)
        snapshot_rows = supabase.select(
            "repository_snapshots",
            columns="*",
            params={"order": "snapshot_date.asc,repository_id.asc"},
        )
    except (RegistryError, SupabaseClientError) as error:
        raise CatalogBuildError(str(error)) from error

    repositories = repository_metadata_by_id(accepted_rows)
    rows_by_date: dict[date, list[dict[str, Any]]] = defaultdict(list)
    for row in snapshot_rows:
        repository_id = row.get("repository_id")
        if not isinstance(repository_id, int) or repository_id not in repositories:
            continue

        raw_date = row.get("snapshot_date")
        if not isinstance(raw_date, str):
            raise CatalogBuildError("Supabase snapshot row must include snapshot_date.")

        try:
            parsed_date = date.fromisoformat(raw_date)
        except ValueError as error:
            raise CatalogBuildError(f"Invalid Supabase snapshot_date: {raw_date}") from error

        rows_by_date[parsed_date].append(
            catalog_snapshot_row(row, repositories[repository_id])
        )

    return [
        Snapshot(snapshot_date=snapshot_date, rows=rows)
        for snapshot_date, rows in sorted(rows_by_date.items())
    ]


def repository_metadata_by_id(rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """Return accepted repository metadata keyed by id."""
    repositories: dict[int, dict[str, Any]] = {}
    for row in rows:
        repository_id = row.get("id")
        full_name = row.get("full_name")
        sections = row.get("sections") or []
        if not isinstance(repository_id, int):
            raise CatalogBuildError("Supabase accepted repository row must include id.")
        if not isinstance(full_name, str) or "/" not in full_name:
            raise CatalogBuildError("Supabase accepted repository row must include full_name.")
        if not isinstance(sections, list) or not sections:
            raise CatalogBuildError("Supabase accepted repository row must include sections.")

        repositories[repository_id] = {
            "full_name": full_name,
            "name": row.get("name"),
            "sections": [str(section) for section in sections],
        }

    return repositories


def catalog_snapshot_row(
    snapshot: dict[str, Any],
    repository: dict[str, Any],
) -> dict[str, Any]:
    """Convert a Supabase snapshot row to the catalog snapshot shape."""
    return {
        "full_name": repository["full_name"],
        "sections": repository["sections"],
        "name": repository["name"],
        "html_url": snapshot.get("html_url"),
        "description": snapshot.get("description"),
        "topics": snapshot.get("topics") or [],
        "stars": snapshot.get("stars"),
        "forks": snapshot.get("forks"),
        "open_issues": snapshot.get("open_issues"),
        "watchers": snapshot.get("watchers"),
        "license": snapshot.get("license"),
        "license_name": snapshot.get("license_name"),
        "language": snapshot.get("language"),
        "default_branch": snapshot.get("default_branch"),
        "created_at": snapshot.get("github_created_at"),
        "updated_at": snapshot.get("github_updated_at"),
        "pushed_at": snapshot.get("pushed_at"),
        "latest_release_tag": snapshot.get("latest_release_tag"),
        "latest_release_name": snapshot.get("latest_release_name"),
        "latest_release_published_at": snapshot.get("latest_release_published_at"),
        "archived": snapshot.get("archived"),
        "disabled": snapshot.get("disabled"),
        "fork": snapshot.get("fork"),
    }


def group_rows_by_repo(snapshots: list[Snapshot]) -> dict[str, list[tuple[date, dict[str, Any]]]]:
    """Group snapshot rows by full repository name."""
    rows_by_repo: dict[str, list[tuple[date, dict[str, Any]]]] = defaultdict(list)

    for snapshot in snapshots:
        for row in snapshot.rows:
            full_name = row.get("full_name")
            if not isinstance(full_name, str) or "/" not in full_name:
                raise CatalogBuildError(
                    f"Snapshot {snapshot.snapshot_date} contains a row without full_name."
                )
            rows_by_repo[full_name].append((snapshot.snapshot_date, row))

    return rows_by_repo


def build_catalog_entry(
    full_name: str,
    rows: list[tuple[date, dict[str, Any]]],
    latest_date: date,
) -> dict[str, Any]:
    """Build one generated catalog entry for a repository."""
    rows = sorted(rows, key=lambda item: item[0])
    latest_row = rows[-1][1]

    stars = as_int(latest_row.get("stars"))
    forks = as_int(latest_row.get("forks"))
    stars_7d = delta_from_baseline(rows, latest_date, "stars", days=7)
    stars_30d = delta_from_baseline(rows, latest_date, "stars", days=30)
    stars_60d = delta_from_baseline(rows, latest_date, "stars", days=60)
    forks_7d = delta_from_baseline(rows, latest_date, "forks", days=7)
    forks_30d = delta_from_baseline(rows, latest_date, "forks", days=30)
    forks_60d = delta_from_baseline(rows, latest_date, "forks", days=60)

    return {
        "full_name": full_name,
        "sections": latest_row.get("sections") or [],
        "name": latest_row.get("name"),
        "html_url": latest_row.get("html_url"),
        "description": latest_row.get("description"),
        "topics": latest_row.get("topics") or [],
        "stars": stars,
        "forks": forks,
        "open_issues": as_int(latest_row.get("open_issues")),
        "watchers": as_int(latest_row.get("watchers")),
        "stars_7d": stars_7d,
        "stars_30d": stars_30d,
        "stars_60d": stars_60d,
        "forks_7d": forks_7d,
        "forks_30d": forks_30d,
        "forks_60d": forks_60d,
        "score": score_repository(stars, forks, stars_7d, stars_30d, stars_60d, forks_7d, forks_30d),
        "license": latest_row.get("license"),
        "license_name": latest_row.get("license_name"),
        "language": latest_row.get("language"),
        "default_branch": latest_row.get("default_branch"),
        "created_at": latest_row.get("created_at"),
        "updated_at": latest_row.get("updated_at"),
        "pushed_at": latest_row.get("pushed_at"),
        "latest_release_tag": latest_row.get("latest_release_tag"),
        "latest_release_name": latest_row.get("latest_release_name"),
        "latest_release_published_at": latest_row.get("latest_release_published_at"),
        "archived": latest_row.get("archived"),
        "disabled": latest_row.get("disabled"),
        "fork": latest_row.get("fork"),
    }


def delta_from_baseline(
    rows: list[tuple[date, dict[str, Any]]],
    latest_date: date,
    field: str,
    days: int,
) -> int | None:
    """Return latest field value minus the nearest row at or before the target date."""
    latest_value = as_int(rows[-1][1].get(field))
    if latest_value is None:
        return None

    target_date = latest_date - timedelta(days=days)
    baseline = find_baseline_row(rows, target_date)
    if baseline is None:
        return None

    baseline_value = as_int(baseline.get(field))
    if baseline_value is None:
        return None

    return latest_value - baseline_value


def find_baseline_row(
    rows: list[tuple[date, dict[str, Any]]],
    target_date: date,
) -> dict[str, Any] | None:
    """Find the nearest snapshot row at or before the target date."""
    baseline: dict[str, Any] | None = None
    for snapshot_date, row in rows:
        if snapshot_date <= target_date:
            baseline = row
        else:
            break
    return baseline


def score_repository(
    stars: int | None,
    forks: int | None,
    stars_7d: int | None,
    stars_30d: int | None,
    stars_60d: int | None,
    forks_7d: int | None,
    forks_30d: int | None,
) -> float:
    """Return a simple ranking score balancing popularity and recent growth."""
    return round(
        (stars or 0) * 1.0
        + (forks or 0) * 2.0
        + (stars_7d or 0) * 24.0
        + (stars_30d or 0) * 12.0
        + (stars_60d or 0) * 4.0
        + (forks_7d or 0) * 16.0
        + (forks_30d or 0) * 8.0,
        2,
    )


def build_sections(repositories: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Build section-indexed repository summaries."""
    sections: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for repository in repositories:
        for section in repository["sections"]:
            sections[str(section)].append(
                {
                    "full_name": repository["full_name"],
                    "name": repository["name"],
                    "html_url": repository["html_url"],
                    "stars": repository["stars"],
                    "stars_7d": repository["stars_7d"],
                    "stars_30d": repository["stars_30d"],
                    "stars_60d": repository["stars_60d"],
                    "forks": repository["forks"],
                    "forks_7d": repository["forks_7d"],
                    "forks_30d": repository["forks_30d"],
                    "forks_60d": repository["forks_60d"],
                    "score": repository["score"],
                    "license": repository["license"],
                    "pushed_at": repository["pushed_at"],
                    "latest_release_tag": repository["latest_release_tag"],
                    "latest_release_published_at": repository["latest_release_published_at"],
                }
            )

    return {
        section: sorted(rows, key=lambda row: (row["score"], row["stars"] or 0), reverse=True)
        for section, rows in sorted(sections.items())
    }


def write_catalog(catalog: dict[str, Any], output_path: Path) -> Path:
    """Write generated catalog JSON."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return output_path


def as_int(value: Any) -> int | None:
    """Return an int when a snapshot value is numeric."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None
