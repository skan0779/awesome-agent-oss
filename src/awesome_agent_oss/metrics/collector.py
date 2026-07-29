"""Collect GitHub repository metrics for accepted repositories."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from awesome_agent_oss.github_client import GitHubClient, GitHubClientError
from awesome_agent_oss.registry import (
    DEFAULT_REGISTRY_PATH,
    AcceptedRepository,
    RegistryError,
    load_accepted_repositories,
)
from awesome_agent_oss.supabase_registry import load_supabase_accepted_repositories

DEFAULT_SNAPSHOT_DIR = Path("data/snapshots")


class MetricsCollectionError(RuntimeError):
    """Raised when metrics cannot be collected for a repository."""


def collect_repository_metrics(
    repository: AcceptedRepository,
    client: GitHubClient,
    collected_at: datetime | None = None,
) -> dict[str, Any]:
    """Collect one snapshot row for an accepted repository."""
    collected = (collected_at or datetime.now(UTC)).astimezone(UTC).isoformat()
    try:
        repo = client.get_repository(repository.full_name)
        latest_release = client.get_latest_release(repository.full_name)
    except GitHubClientError as error:
        raise MetricsCollectionError(str(error)) from error

    license_info = repo.get("license") or {}

    return {
        "collected_at": collected,
        "full_name": repository.full_name,
        "sections": list(repository.sections),
        "name": repo.get("name"),
        "html_url": repo.get("html_url"),
        "description": repo.get("description"),
        "topics": repo.get("topics") or [],
        "stars": repo.get("stargazers_count"),
        "forks": repo.get("forks_count"),
        "open_issues": repo.get("open_issues_count"),
        "watchers": repo.get("watchers_count"),
        "license": license_info.get("spdx_id") or license_info.get("key"),
        "license_name": license_info.get("name"),
        "default_branch": repo.get("default_branch"),
        "language": repo.get("language"),
        "created_at": repo.get("created_at"),
        "updated_at": repo.get("updated_at"),
        "pushed_at": repo.get("pushed_at"),
        "archived": repo.get("archived"),
        "disabled": repo.get("disabled"),
        "fork": repo.get("fork"),
        "latest_release_tag": latest_release.get("tag_name") if latest_release else None,
        "latest_release_name": latest_release.get("name") if latest_release else None,
        "latest_release_published_at": latest_release.get("published_at") if latest_release else None,
    }


def collect_metrics(
    registry_path: Path = DEFAULT_REGISTRY_PATH,
    token: str | None = None,
    collected_at: datetime | None = None,
) -> list[dict[str, Any]]:
    """Collect metric rows for every accepted repository."""
    try:
        repositories = load_accepted_repositories(registry_path)
    except RegistryError as error:
        raise MetricsCollectionError(str(error)) from error

    return collect_repository_list(repositories, token=token, collected_at=collected_at)


def collect_supabase_metrics(
    token: str | None = None,
    collected_at: datetime | None = None,
) -> list[dict[str, Any]]:
    """Collect metric rows for every Supabase-accepted repository."""
    try:
        repositories = load_supabase_accepted_repositories()
    except RegistryError as error:
        raise MetricsCollectionError(str(error)) from error

    return collect_repository_list(repositories, token=token, collected_at=collected_at)


def collect_repository_list(
    repositories: list[AcceptedRepository],
    token: str | None = None,
    collected_at: datetime | None = None,
) -> list[dict[str, Any]]:
    """Collect metric rows for a repository list."""
    client = GitHubClient(token=token)
    rows: list[dict[str, Any]] = []

    for repository in repositories:
        rows.append(collect_repository_metrics(repository, client, collected_at=collected_at))

    return rows
