"""Supabase-backed registry loading helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from awesome_agent_oss.supabase_client import SupabaseClient, SupabaseClientError


class RegistryError(RuntimeError):
    """Raised when Supabase registry data cannot be loaded."""


@dataclass(frozen=True)
class AcceptedRepository:
    """A repository accepted into the catalog."""

    full_name: str
    sections: tuple[str, ...]


def load_supabase_accepted_repositories(
    client: SupabaseClient | None = None,
) -> list[AcceptedRepository]:
    """Load accepted repositories from the Supabase accepted_repositories view."""
    supabase = client or SupabaseClient.from_env()
    try:
        rows = supabase.select(
            "accepted_repositories",
            columns="id,full_name,sections",
            params={"order": "full_name.asc"},
        )
    except SupabaseClientError as error:
        raise RegistryError(str(error)) from error

    repositories: list[AcceptedRepository] = []
    for index, row in enumerate(rows):
        full_name = row.get("full_name")
        sections = row.get("sections") or []
        if not isinstance(full_name, str) or "/" not in full_name:
            raise RegistryError(
                f"Supabase accepted_repositories row #{index + 1} must include full_name."
            )
        if not isinstance(sections, list) or not sections:
            raise RegistryError(
                f"Supabase accepted_repositories row #{index + 1} must include sections."
            )

        repositories.append(
            AcceptedRepository(
                full_name=full_name,
                sections=tuple(str(section) for section in sections),
            )
        )

    return repositories


def load_supabase_accepted_repository_rows(
    client: SupabaseClient | None = None,
) -> list[dict[str, Any]]:
    """Load accepted repository rows with ids from Supabase."""
    supabase = client or SupabaseClient.from_env()
    try:
        return supabase.select(
            "accepted_repositories",
            columns="id,full_name,owner,name,sections",
            params={"order": "full_name.asc"},
        )
    except SupabaseClientError as error:
        raise RegistryError(str(error)) from error
