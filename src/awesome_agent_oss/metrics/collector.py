"""Collect GitHub repository metrics for accepted repositories."""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from typing import Any

from awesome_agent_oss.github_client import GitHubClient, GitHubClientError
from awesome_agent_oss.metrics.availability import record_repository_availability
from awesome_agent_oss.supabase_client import SupabaseClient, SupabaseClientError
from awesome_agent_oss.supabase_registry import (
    AcceptedRepository,
    RegistryError,
    load_supabase_accepted_repositories,
)


class MetricsCollectionError(RuntimeError):
    """Raised when metrics cannot be collected for a repository."""


def collect_repository_metrics(
    repository: AcceptedRepository,
    client: GitHubClient,
    collected_at: datetime | None = None,
    *,
    supabase_client: SupabaseClient | None = None,
) -> dict[str, Any] | None:
    """Collect a snapshot, or persist a repository 404 and skip this repo."""
    checked_at = (collected_at or datetime.now(UTC)).astimezone(UTC)
    supabase = supabase_client or SupabaseClient.from_env()
    try:
        try:
            repo = client.get_repository(repository.full_name)
        except GitHubClientError as error:
            if error.status_code != 404:
                raise
            availability = record_repository_availability(
                supabase, repository.repository_id, 404, checked_at
            )
            print(
                f"Skipping {repository.full_name}: repository lookup returned HTTP 404; "
                f"{availability.not_found_days}/2 distinct UTC dates; {availability.outcome}.",
                file=sys.stderr,
            )
            return None

        availability = record_repository_availability(
            supabase, repository.repository_id, 200, checked_at
        )
        if availability.outcome == "ignored":
            print(
                f"Skipping stale availability check for {repository.full_name}.",
                file=sys.stderr,
            )
            return None
        latest_release = client.get_latest_release(repository.full_name)
    except (GitHubClientError, SupabaseClientError) as error:
        raise MetricsCollectionError(str(error)) from error

    license_info = repo.get("license") or {}

    return {
        "collected_at": checked_at.isoformat(),
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
    token: str | None = None,
    collected_at: datetime | None = None,
) -> list[dict[str, Any]]:
    """Collect metric rows for every Supabase-accepted repository."""
    try:
        supabase = SupabaseClient.from_env()
        repositories = load_supabase_accepted_repositories(supabase)
    except (RegistryError, SupabaseClientError) as error:
        raise MetricsCollectionError(str(error)) from error

    return collect_repository_list(
        repositories, token=token, collected_at=collected_at, supabase_client=supabase
    )


def collect_repository_list(
    repositories: list[AcceptedRepository],
    token: str | None = None,
    collected_at: datetime | None = None,
    *,
    supabase_client: SupabaseClient | None = None,
) -> list[dict[str, Any]]:
    """Collect metric rows for a repository list."""
    client = GitHubClient(token=token)
    supabase = supabase_client or SupabaseClient.from_env()
    rows: list[dict[str, Any]] = []

    for repository in repositories:
        row = collect_repository_metrics(
            repository, client, collected_at=collected_at, supabase_client=supabase
        )
        if row is not None:
            rows.append(row)

    return rows
