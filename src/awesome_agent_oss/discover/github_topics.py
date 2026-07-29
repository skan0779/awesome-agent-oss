"""Discover pending repository candidates from GitHub topics."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from awesome_agent_oss.github_client import GitHubClient, GitHubClientError
from awesome_agent_oss.supabase_client import SupabaseClient, SupabaseClientError


DEFAULT_MIN_STARS = 1000
DEFAULT_PER_PAGE = 30
DEFAULT_MAX_PAGES = 1
DEFAULT_SORTS = ("stars", "updated")


class DiscoveryError(RuntimeError):
    """Raised when discovery cannot complete."""


@dataclass(frozen=True)
class Section:
    """A discoverable section."""

    id: str
    topics: tuple[str, ...]


@dataclass
class Candidate:
    """A discovered repository candidate."""

    full_name: str
    owner: str
    name: str
    html_url: str | None
    description: str | None
    stars: int
    forks: int
    pushed_at: str | None
    topics: list[str]
    suggested_sections: set[str]
    matched_topics: set[str]
    queries: set[str]


def discover_github_topic_candidates(
    min_stars: int = DEFAULT_MIN_STARS,
    per_page: int = DEFAULT_PER_PAGE,
    max_pages: int = DEFAULT_MAX_PAGES,
    sorts: tuple[str, ...] = DEFAULT_SORTS,
    github_token: str | None = None,
    supabase: SupabaseClient | None = None,
    github: GitHubClient | None = None,
) -> dict[str, int]:
    """Discover topic-matched repositories and store new candidates in Supabase."""
    if min_stars < 0:
        raise DiscoveryError("min_stars must be greater than or equal to 0.")
    if per_page < 1 or per_page > 100:
        raise DiscoveryError("per_page must be between 1 and 100.")
    if max_pages < 1:
        raise DiscoveryError("max_pages must be greater than or equal to 1.")

    supabase_client = supabase or SupabaseClient.from_env()
    github_client = github or GitHubClient(token=github_token)

    sections = load_sections(supabase_client)
    known_names = load_known_repository_names(supabase_client)
    candidates = search_candidates(
        sections=sections,
        known_names=known_names,
        github=github_client,
        min_stars=min_stars,
        per_page=per_page,
        max_pages=max_pages,
        sorts=sorts,
    )
    stored_count = store_candidates(supabase_client, candidates)

    return {
        "sections": len(sections),
        "queries": query_count(sections, sorts, max_pages),
        "candidates": len(candidates),
        "stored": stored_count,
    }


def load_sections(client: SupabaseClient) -> list[Section]:
    """Load section topic seeds from Supabase."""
    try:
        rows = client.select(
            "sections",
            columns="id,topics,sort_order",
            params={"order": "sort_order.asc,id.asc", "limit": "10000"},
        )
    except SupabaseClientError as error:
        raise DiscoveryError(str(error)) from error

    sections: list[Section] = []
    for index, row in enumerate(rows):
        section_id = row.get("id")
        topics = row.get("topics") or []
        if not isinstance(section_id, str) or not section_id:
            raise DiscoveryError(f"sections row #{index + 1} must include id.")
        if not isinstance(topics, list):
            raise DiscoveryError(f"sections row #{index + 1} topics must be a list.")

        normalized_topics = tuple(
            sorted({str(topic).strip() for topic in topics if str(topic).strip()})
        )
        if normalized_topics:
            sections.append(Section(id=section_id, topics=normalized_topics))

    return sections


def load_known_repository_names(client: SupabaseClient) -> set[str]:
    """Load all repositories already known to Supabase."""
    try:
        rows = client.select("repositories", columns="full_name", params={"limit": "10000"})
    except SupabaseClientError as error:
        raise DiscoveryError(str(error)) from error

    names: set[str] = set()
    for row in rows:
        full_name = row.get("full_name")
        if isinstance(full_name, str):
            names.add(full_name.lower())
    return names


def search_candidates(
    sections: list[Section],
    known_names: set[str],
    github: GitHubClient,
    min_stars: int,
    per_page: int,
    max_pages: int,
    sorts: tuple[str, ...],
) -> dict[str, Candidate]:
    """Search GitHub and return deduplicated candidates."""
    candidates: dict[str, Candidate] = {}

    for section in sections:
        for topic in section.topics:
            query = discovery_query(topic, min_stars=min_stars)
            for sort in sorts:
                for page in range(1, max_pages + 1):
                    try:
                        result = github.search_repositories(
                            query=query,
                            sort=sort,
                            order="desc",
                            per_page=per_page,
                            page=page,
                        )
                    except GitHubClientError as error:
                        raise DiscoveryError(str(error)) from error

                    items = result.get("items") or []
                    if not isinstance(items, list):
                        raise DiscoveryError("GitHub search response items must be a list.")

                    for item in items:
                        candidate = candidate_from_item(
                            item=item,
                            section_id=section.id,
                            topic=topic,
                            query=query,
                            min_stars=min_stars,
                            known_names=known_names,
                        )
                        if candidate is None:
                            continue

                        candidate_key = candidate.full_name.lower()
                        existing = candidates.get(candidate_key)
                        if existing is None:
                            candidates[candidate_key] = candidate
                        else:
                            existing.suggested_sections.update(candidate.suggested_sections)
                            existing.matched_topics.update(candidate.matched_topics)
                            existing.queries.update(candidate.queries)

    return candidates


def discovery_query(topic: str, min_stars: int) -> str:
    """Return a GitHub repository search query for one topic."""
    return f"topic:{topic} stars:>={min_stars} archived:false fork:false"


def candidate_from_item(
    item: Any,
    section_id: str,
    topic: str,
    query: str,
    min_stars: int,
    known_names: set[str],
) -> Candidate | None:
    """Build a candidate from a GitHub search result item."""
    if not isinstance(item, dict):
        return None

    full_name = item.get("full_name")
    if not isinstance(full_name, str) or "/" not in full_name:
        return None
    if full_name.lower() in known_names:
        return None
    if item.get("archived") is True or item.get("fork") is True:
        return None

    stars = int_value(item.get("stargazers_count")) or 0
    if stars < min_stars:
        return None

    owner, name = full_name.split("/", 1)
    topics = item.get("topics") or []
    return Candidate(
        full_name=full_name,
        owner=owner,
        name=name,
        html_url=str_value(item.get("html_url")),
        description=str_value(item.get("description")),
        stars=stars,
        forks=int_value(item.get("forks_count")) or 0,
        pushed_at=str_value(item.get("pushed_at")),
        topics=[str(topic_value) for topic_value in topics] if isinstance(topics, list) else [],
        suggested_sections={section_id},
        matched_topics={topic},
        queries={query},
    )


def store_candidates(client: SupabaseClient, candidates: dict[str, Candidate]) -> int:
    """Store discovered candidates in Supabase."""
    if not candidates:
        return 0

    discovered_at = datetime.now(UTC).isoformat()
    repository_rows = [
        {
            "full_name": candidate.full_name,
            "owner": candidate.owner,
            "name": candidate.name,
            "html_url": candidate.html_url,
            "status": "pending",
            "first_seen_at": discovered_at,
        }
        for candidate in candidates.values()
    ]

    try:
        stored_repositories = client.upsert(
            "repositories",
            repository_rows,
            on_conflict="full_name",
        )
    except SupabaseClientError as error:
        raise DiscoveryError(str(error)) from error

    repository_ids = repository_id_map(stored_repositories)
    section_rows = []
    discovery_rows = []
    event_rows = []

    for candidate in candidates.values():
        repository_id = repository_ids.get(candidate.full_name)
        if repository_id is None:
            raise DiscoveryError(f"Repository was not stored: {candidate.full_name}")

        for section_id in sorted(candidate.suggested_sections):
            section_rows.append(
                {
                    "repository_id": repository_id,
                    "section_id": section_id,
                    "status": "suggested",
                    "matched_topics": sorted(candidate.matched_topics),
                    "suggested_at": discovered_at,
                }
            )

        discovery_rows.append(
            {
                "repository_id": repository_id,
                "status": "pending",
                "source": "github_topics",
                "query": "; ".join(sorted(candidate.queries)),
                "suggested_sections": sorted(candidate.suggested_sections),
                "matched_topics": sorted(candidate.matched_topics),
                "discovered_at": discovered_at,
            }
        )
        event_rows.append(
            {
                "repository_id": repository_id,
                "action": "discovered",
                "next_repository_status": "pending",
                "sections": sorted(candidate.suggested_sections),
                "metadata": {
                    "stars": candidate.stars,
                    "forks": candidate.forks,
                    "topics": candidate.topics,
                    "queries": sorted(candidate.queries),
                },
                "created_at": discovered_at,
            }
        )

    try:
        client.upsert(
            "repository_sections",
            section_rows,
            on_conflict="repository_id,section_id",
        )
        client.upsert(
            "discovery_candidates",
            discovery_rows,
            on_conflict="repository_id",
        )
        client.insert("curation_events", event_rows)
    except SupabaseClientError as error:
        raise DiscoveryError(str(error)) from error

    return len(candidates)


def repository_id_map(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Return repository ids keyed by full_name."""
    mapping: dict[str, int] = {}
    for row in rows:
        full_name = row.get("full_name")
        repository_id = row.get("id")
        if isinstance(full_name, str) and isinstance(repository_id, int):
            mapping[full_name] = repository_id
    return mapping


def query_count(sections: list[Section], sorts: tuple[str, ...], max_pages: int) -> int:
    """Return the number of GitHub search API calls this run may make."""
    return sum(len(section.topics) for section in sections) * len(sorts) * max_pages


def int_value(value: Any) -> int | None:
    """Return an integer when value is numeric."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def str_value(value: Any) -> str | None:
    """Return a string or None."""
    if isinstance(value, str):
        return value
    return None
