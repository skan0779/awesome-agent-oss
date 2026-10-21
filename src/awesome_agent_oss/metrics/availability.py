"""Persist repository availability checks and atomically reject missing repos."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from awesome_agent_oss.supabase_client import SupabaseClient, SupabaseClientError


@dataclass(frozen=True)
class AvailabilityResult:
    outcome: str
    not_found_days: int


def record_repository_availability(
    client: SupabaseClient,
    repository_id: int,
    status_code: int,
    checked_at: datetime,
) -> AvailabilityResult:
    """Apply the database's two-distinct-UTC-dates policy to one lookup."""
    result = client.request(
        "POST",
        "/rest/v1/rpc/record_repository_availability",
        body={
            "p_repository_id": repository_id,
            "p_status_code": status_code,
            "p_checked_at": checked_at.astimezone(UTC).isoformat(),
        },
    )
    if (
        not isinstance(result, dict)
        or result.get("outcome") not in {"available", "not_found", "rejected", "ignored"}
        or type(result.get("not_found_days")) is not int
        or not 0 <= result["not_found_days"] <= 2
    ):
        raise SupabaseClientError("Unexpected repository availability response.")
    return AvailabilityResult(result["outcome"], result["not_found_days"])
