"""Seed Supabase from the current YAML registry files."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from awesome_agent_oss.registry import DEFAULT_REGISTRY_PATH, load_accepted_repositories
from awesome_agent_oss.supabase_client import SupabaseClient, SupabaseClientError


DEFAULT_SECTIONS_PATH = DEFAULT_REGISTRY_PATH.with_name("sections.yml")
DEFAULT_PENDING_PATH = DEFAULT_REGISTRY_PATH.with_name("pending.yml")
DEFAULT_REJECTED_PATH = DEFAULT_REGISTRY_PATH.with_name("rejected.yml")


class SupabaseSeedError(RuntimeError):
    """Raised when registry data cannot be seeded into Supabase."""


@dataclass(frozen=True)
class PendingRepository:
    """A repository discovered but not yet accepted or rejected."""

    full_name: str
    suggested_sections: tuple[str, ...]
    matched_topics: tuple[str, ...]
    discovered_at: str | None


@dataclass(frozen=True)
class RejectedRepository:
    """A rejected repository or section decision."""

    full_name: str
    scope: str
    sections: tuple[str, ...]
    reason: str | None
    rejected_at: str | None


def seed_supabase_registry(
    sections_path: Path = DEFAULT_SECTIONS_PATH,
    accepted_path: Path = DEFAULT_REGISTRY_PATH,
    pending_path: Path = DEFAULT_PENDING_PATH,
    rejected_path: Path = DEFAULT_REJECTED_PATH,
    client: SupabaseClient | None = None,
) -> dict[str, int]:
    """Seed sections, repositories, and curation state into Supabase."""
    supabase = client or SupabaseClient.from_env()
    seeded_at = datetime.now(UTC).isoformat()

    section_rows = load_section_rows(sections_path)
    accepted_repositories = load_accepted_repositories(accepted_path)
    pending_repositories = load_pending_repositories(pending_path)
    rejected_repositories = load_rejected_repositories(rejected_path)

    supabase.upsert("sections", section_rows, on_conflict="id")

    accepted_names = {repository.full_name for repository in accepted_repositories}
    repo_rejected_names = {
        repository.full_name
        for repository in rejected_repositories
        if repository.scope == "repo" and repository.full_name not in accepted_names
    }
    pending_names = {
        repository.full_name
        for repository in pending_repositories
        if repository.full_name not in accepted_names
        and repository.full_name not in repo_rejected_names
    }
    section_rejected_names = {
        repository.full_name
        for repository in rejected_repositories
        if repository.scope == "section"
        and repository.full_name not in accepted_names
        and repository.full_name not in repo_rejected_names
        and repository.full_name not in pending_names
    }

    repository_rows: list[dict[str, Any]] = []
    for repository in accepted_repositories:
        repository_rows.append(
            repository_row(
                repository.full_name,
                status="accepted",
                accepted_at=seeded_at,
            )
        )
    for repository in pending_repositories:
        if repository.full_name in pending_names:
            repository_rows.append(
                repository_row(
                    repository.full_name,
                    status="pending",
                    first_seen_at=repository.discovered_at or seeded_at,
                )
            )
    for repository in rejected_repositories:
        if repository.full_name in repo_rejected_names:
            repository_rows.append(
                repository_row(
                    repository.full_name,
                    status="rejected",
                    rejected_at=repository.rejected_at or seeded_at,
                    rejection_reason=repository.reason,
                )
            )
        elif repository.full_name in section_rejected_names:
            repository_rows.append(
                repository_row(
                    repository.full_name,
                    status="pending",
                    first_seen_at=repository.rejected_at or seeded_at,
                )
            )

    stored_repositories = supabase.upsert(
        "repositories",
        repository_rows,
        on_conflict="full_name",
    )
    repository_ids = repository_id_map(stored_repositories)

    accepted_pairs = {
        (repository.full_name, section)
        for repository in accepted_repositories
        for section in repository.sections
    }
    repository_section_rows: list[dict[str, Any]] = []
    for repository in accepted_repositories:
        for section in repository.sections:
            repository_section_rows.append(
                repository_section_row(
                    repository_ids,
                    repository.full_name,
                    section,
                    status="accepted",
                    accepted_at=seeded_at,
                )
            )
    for repository in pending_repositories:
        if repository.full_name not in pending_names:
            continue
        for section in repository.suggested_sections:
            repository_section_rows.append(
                repository_section_row(
                    repository_ids,
                    repository.full_name,
                    section,
                    status="suggested",
                    matched_topics=repository.matched_topics,
                    suggested_at=repository.discovered_at or seeded_at,
                )
            )
    for repository in rejected_repositories:
        if repository.scope != "section":
            continue
        for section in repository.sections:
            if (repository.full_name, section) in accepted_pairs:
                continue
            repository_section_rows.append(
                repository_section_row(
                    repository_ids,
                    repository.full_name,
                    section,
                    status="rejected",
                    rejected_at=repository.rejected_at or seeded_at,
                    rejection_reason=repository.reason,
                )
            )

    supabase.upsert(
        "repository_sections",
        repository_section_rows,
        on_conflict="repository_id,section_id",
    )

    discovery_rows = [
        discovery_candidate_row(repository_ids, repository)
        for repository in pending_repositories
        if repository.full_name in pending_names
    ]
    supabase.upsert(
        "discovery_candidates",
        discovery_rows,
        on_conflict="repository_id",
    )

    return {
        "sections": len(section_rows),
        "repositories": len(repository_rows),
        "repository_sections": len(repository_section_rows),
        "discovery_candidates": len(discovery_rows),
    }


def load_section_rows(path: Path) -> list[dict[str, Any]]:
    """Load section rows from sections.yml."""
    raw = load_yaml_list(path, "sections.yml")
    rows: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise SupabaseSeedError(f"sections.yml entry #{index + 1} must be a mapping.")

        section_id = item.get("id")
        name = item.get("name")
        description = item.get("description")
        topics = item.get("topics") or []
        if not isinstance(section_id, str) or not section_id:
            raise SupabaseSeedError(f"sections.yml entry #{index + 1} must include id.")
        if not isinstance(name, str) or not name:
            raise SupabaseSeedError(f"sections.yml entry #{index + 1} must include name.")
        if not isinstance(topics, list):
            raise SupabaseSeedError(f"sections.yml entry #{index + 1} topics must be a list.")

        rows.append(
            {
                "id": section_id,
                "name": name,
                "description": description if isinstance(description, str) else None,
                "topics": [str(topic) for topic in topics],
                "sort_order": index,
            }
        )

    return rows


def load_pending_repositories(path: Path) -> list[PendingRepository]:
    """Load pending repositories from pending.yml when present."""
    if not path.exists():
        return []

    raw = load_yaml_list(path, "pending.yml")
    repositories: list[PendingRepository] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise SupabaseSeedError(f"pending.yml entry #{index + 1} must be a mapping.")

        full_name = item.get("full_name")
        suggested_sections = item.get("suggested_sections") or []
        matched_topics = item.get("matched_topics") or []
        discovered_at = item.get("discovered_at")
        if not is_full_name(full_name):
            raise SupabaseSeedError(
                f"pending.yml entry #{index + 1} must include full_name as owner/repo."
            )
        if not isinstance(suggested_sections, list):
            raise SupabaseSeedError(
                f"pending.yml entry #{index + 1} suggested_sections must be a list."
            )
        if not isinstance(matched_topics, list):
            raise SupabaseSeedError(
                f"pending.yml entry #{index + 1} matched_topics must be a list."
            )

        repositories.append(
            PendingRepository(
                full_name=full_name,
                suggested_sections=tuple(str(section) for section in suggested_sections),
                matched_topics=tuple(str(topic) for topic in matched_topics),
                discovered_at=discovered_at if isinstance(discovered_at, str) else None,
            )
        )

    return repositories


def load_rejected_repositories(path: Path) -> list[RejectedRepository]:
    """Load rejected repositories from rejected.yml when present."""
    if not path.exists():
        return []

    raw = load_yaml_list(path, "rejected.yml")
    repositories: list[RejectedRepository] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise SupabaseSeedError(f"rejected.yml entry #{index + 1} must be a mapping.")

        full_name = item.get("full_name")
        scope = item.get("scope") or "repo"
        sections = item.get("sections") or []
        reason = item.get("reason")
        rejected_at = item.get("rejected_at")
        if not is_full_name(full_name):
            raise SupabaseSeedError(
                f"rejected.yml entry #{index + 1} must include full_name as owner/repo."
            )
        if scope not in {"repo", "section"}:
            raise SupabaseSeedError(
                f"rejected.yml entry #{index + 1} scope must be repo or section."
            )
        if not isinstance(sections, list):
            raise SupabaseSeedError(f"rejected.yml entry #{index + 1} sections must be a list.")
        if scope == "section" and not sections:
            raise SupabaseSeedError(
                f"rejected.yml entry #{index + 1} must include sections for section scope."
            )

        repositories.append(
            RejectedRepository(
                full_name=full_name,
                scope=str(scope),
                sections=tuple(str(section) for section in sections),
                reason=reason if isinstance(reason, str) else None,
                rejected_at=rejected_at if isinstance(rejected_at, str) else None,
            )
        )

    return repositories


def load_yaml_list(path: Path, label: str) -> list[Any]:
    """Load a YAML file that must contain a top-level list."""
    if not path.exists():
        raise SupabaseSeedError(f"{label} does not exist: {path}")

    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not isinstance(raw, list):
        raise SupabaseSeedError(f"{label} must contain a top-level list.")
    return raw


def repository_row(full_name: str, status: str, **extra: Any) -> dict[str, Any]:
    """Return a repositories table row."""
    owner, name = split_full_name(full_name)
    row = {
        "full_name": full_name,
        "owner": owner,
        "name": name,
        "html_url": f"https://github.com/{full_name}",
        "status": status,
    }
    row.update({key: value for key, value in extra.items() if value is not None})
    return row


def repository_section_row(
    repository_ids: dict[str, int],
    full_name: str,
    section_id: str,
    status: str,
    **extra: Any,
) -> dict[str, Any]:
    """Return a repository_sections table row."""
    row = {
        "repository_id": get_repository_id(repository_ids, full_name),
        "section_id": section_id,
        "status": status,
    }
    row.update({key: value for key, value in extra.items() if value is not None})
    return row


def discovery_candidate_row(
    repository_ids: dict[str, int],
    repository: PendingRepository,
) -> dict[str, Any]:
    """Return a discovery_candidates table row."""
    row = {
        "repository_id": get_repository_id(repository_ids, repository.full_name),
        "status": "pending",
        "source": "yaml_seed",
        "suggested_sections": list(repository.suggested_sections),
        "matched_topics": list(repository.matched_topics),
    }
    if repository.discovered_at:
        row["discovered_at"] = repository.discovered_at
    return row


def repository_id_map(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Return a full_name to repository id mapping from stored rows."""
    mapping: dict[str, int] = {}
    for row in rows:
        full_name = row.get("full_name")
        repository_id = row.get("id")
        if isinstance(full_name, str) and isinstance(repository_id, int):
            mapping[full_name] = repository_id
    return mapping


def get_repository_id(repository_ids: dict[str, int], full_name: str) -> int:
    """Return a repository id or raise a seed error."""
    try:
        return repository_ids[full_name]
    except KeyError as error:
        raise SupabaseSeedError(f"Repository was not stored in Supabase: {full_name}") from error


def split_full_name(full_name: str) -> tuple[str, str]:
    """Split owner/repo full_name."""
    if not is_full_name(full_name):
        raise SupabaseSeedError(f"Repository full_name must be owner/repo: {full_name}")
    owner, name = full_name.split("/", 1)
    return owner, name


def is_full_name(value: Any) -> bool:
    """Return true when value looks like owner/repo."""
    return isinstance(value, str) and "/" in value and all(value.split("/", 1))


def seed_supabase_from_env(**kwargs: Any) -> dict[str, int]:
    """Seed Supabase using environment configuration."""
    try:
        return seed_supabase_registry(**kwargs)
    except SupabaseClientError as error:
        raise SupabaseSeedError(str(error)) from error
