"""Keep the snapshot history needed for catalog growth calculations."""

from __future__ import annotations

from datetime import date, timedelta

from awesome_agent_oss.supabase_client import SupabaseClient, SupabaseClientError


SNAPSHOT_HISTORY_DAYS = 60


class SnapshotRetentionError(RuntimeError):
    """Raised when the snapshot retention policy cannot be applied."""


def prune_supabase_snapshots(
    client: SupabaseClient | None = None,
    *,
    dry_run: bool = False,
) -> date | None:
    """Delete rows before the inclusive history window; return its start date.

    Anchor the window to the latest stored snapshot, so a collection outage
    does not age out the remaining history. Keep the boundary date itself:
    a 60-day delta needs both the latest value and the value 60 days earlier.
    """
    supabase = client or SupabaseClient.from_env()
    try:
        latest_rows = supabase.select(
            "repository_snapshots",
            columns="snapshot_date",
            params={"order": "snapshot_date.desc", "limit": "1"},
        )
        if not latest_rows:
            return None

        latest_value = latest_rows[0].get("snapshot_date")
        if not isinstance(latest_value, str):
            raise SnapshotRetentionError("Latest snapshot must include snapshot_date.")
        try:
            latest_date = date.fromisoformat(latest_value)
            cutoff_date = latest_date - timedelta(days=SNAPSHOT_HISTORY_DAYS)
        except (ValueError, OverflowError) as error:
            raise SnapshotRetentionError("Latest snapshot_date is invalid.") from error

        if not dry_run:
            supabase.request(
                "DELETE",
                "/rest/v1/repository_snapshots",
                params={"snapshot_date": f"lt.{cutoff_date.isoformat()}"},
                extra_headers={"Prefer": "return=minimal"},
            )
    except SupabaseClientError as error:
        raise SnapshotRetentionError(str(error)) from error

    return cutoff_date
