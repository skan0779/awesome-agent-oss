"""Verify retention against a simulated Supabase REST endpoint."""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from datetime import date, timedelta
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse

from awesome_agent_oss.cli import build_parser
from awesome_agent_oss.metrics.retention import (
    SnapshotRetentionError,
    prune_supabase_snapshots,
)
from awesome_agent_oss.ranking.catalog import delta_from_baseline
from awesome_agent_oss.supabase_client import SupabaseClient


class SnapshotEndpoint:
    """Store rows in memory while exercising the real HTTP client encoding."""

    def __init__(self, rows, fail_method=None):
        self.rows = list(rows)
        self.methods = []
        self.fail_method = fail_method

    def __call__(self, request, timeout):
        method = request.get_method()
        self.methods.append(method)
        url = urlparse(request.full_url)
        if url.path != "/rest/v1/repository_snapshots":
            raise AssertionError(f"Unexpected table: {url.path}")
        if method == self.fail_method:
            raise HTTPError(
                request.full_url, 503, "Unavailable", {}, io.BytesIO(b"unavailable")
            )

        params = parse_qs(url.query)
        if method == "GET":
            if params != {
                "select": ["snapshot_date"],
                "order": ["snapshot_date.desc"],
                "limit": ["1"],
            }:
                raise AssertionError(f"Unexpected latest-date query: {params}")
            latest = sorted(self.rows, key=lambda row: row["snapshot_date"], reverse=True)[:1]
            return io.BytesIO(json.dumps(latest).encode())

        if method == "DELETE":
            if set(params) != {"snapshot_date"}:
                raise AssertionError("Delete must be restricted by snapshot_date")
            operator, cutoff = params["snapshot_date"][0].split(".", 1)
            if operator != "lt":
                raise AssertionError("Delete must preserve the boundary date")
            if request.get_header("Prefer") != "return=minimal":
                raise AssertionError("Delete should not download the deleted history")
            self.rows = [row for row in self.rows if row["snapshot_date"] >= cutoff]
            return io.BytesIO()

        raise AssertionError(f"Unexpected HTTP method: {method}")


class SnapshotRetentionTests(unittest.TestCase):
    def setUp(self):
        self.client = SupabaseClient("https://example.test", "test-key")

    def prune(self, endpoint, **kwargs):
        with patch("awesome_agent_oss.supabase_client.urlopen", side_effect=endpoint):
            return prune_supabase_snapshots(self.client, **kwargs)

    def test_preserves_60_day_boundary_and_growth_for_every_repository(self):
        latest = date(2026, 10, 21)
        rows = [
            {
                "repository_id": repository_id,
                "snapshot_date": (latest - timedelta(days=days)).isoformat(),
                "stars": 1000 - days * repository_id,
            }
            for repository_id in (1, 2)
            for days in range(75)
        ]
        endpoint = SnapshotEndpoint(rows)

        self.assertEqual(self.prune(endpoint), date(2026, 8, 22))
        self.assertEqual(len(endpoint.rows), 2 * 61)
        for repository_id in (1, 2):
            before, after = [
                sorted(
                    (date.fromisoformat(row["snapshot_date"]), row)
                    for row in source
                    if row["repository_id"] == repository_id
                )
                for source in (rows, endpoint.rows)
            ]
            for days in (1, 3, 7, 30, 60):
                self.assertEqual(
                    delta_from_baseline(after, latest, "stars", days),
                    delta_from_baseline(before, latest, "stars", days),
                )
            self.assertEqual(delta_from_baseline(after, latest, "stars", 60), 60 * repository_id)

        remaining = list(endpoint.rows)
        self.prune(endpoint)
        self.assertEqual(endpoint.rows, remaining)

    def test_uses_stored_date_during_outage_and_handles_leap_year(self):
        endpoint = SnapshotEndpoint([
            {"snapshot_date": "2023-12-31"},
            {"snapshot_date": "2024-01-01"},
            {"snapshot_date": "2024-03-01"},
        ])
        self.assertEqual(self.prune(endpoint), date(2024, 1, 1))
        self.assertEqual(endpoint.rows, [
            {"snapshot_date": "2024-01-01"},
            {"snapshot_date": "2024-03-01"},
        ])

    def test_dry_run_reports_cutoff_without_deleting(self):
        rows = [{"snapshot_date": "2020-01-01"}, {"snapshot_date": "2026-10-21"}]
        endpoint = SnapshotEndpoint(rows)
        self.assertEqual(self.prune(endpoint, dry_run=True), date(2026, 8, 22))
        self.assertEqual(endpoint.rows, rows)
        self.assertEqual(endpoint.methods, ["GET"])

    def test_empty_database_does_not_delete(self):
        endpoint = SnapshotEndpoint([])
        self.assertIsNone(self.prune(endpoint))
        self.assertEqual(endpoint.methods, ["GET"])

    def test_short_history_is_preserved(self):
        rows = [{"snapshot_date": "2026-10-20"}, {"snapshot_date": "2026-10-21"}]
        endpoint = SnapshotEndpoint(rows)
        self.prune(endpoint)
        self.assertEqual(endpoint.rows, rows)

    def test_invalid_latest_date_never_deletes(self):
        for value in (None, "invalid", "2026-02-30", "0001-01-01"):
            with self.subTest(value=value):
                endpoint = SnapshotEndpoint([{"snapshot_date": value}])
                with self.assertRaises(SnapshotRetentionError):
                    self.prune(endpoint)
                self.assertEqual(endpoint.methods, ["GET"])

    def test_http_failures_are_reported_and_preserve_rows(self):
        for method in ("GET", "DELETE"):
            with self.subTest(method=method):
                rows = [{"snapshot_date": "2020-01-01"}, {"snapshot_date": "2026-10-21"}]
                endpoint = SnapshotEndpoint(rows, fail_method=method)
                with self.assertRaisesRegex(SnapshotRetentionError, "HTTP 503"):
                    self.prune(endpoint)
                self.assertEqual(endpoint.rows, rows)
                self.assertEqual(endpoint.methods, ["GET"] if method == "GET" else ["GET", "DELETE"])

    def test_cli_dry_run_is_forwarded_and_described(self):
        args = build_parser().parse_args(["prune-snapshots", "--dry-run"])
        output = io.StringIO()
        with patch(
            "awesome_agent_oss.cli.prune_supabase_snapshots", return_value=date(2026, 8, 22)
        ) as prune, redirect_stdout(output):
            args.func(args)
        prune.assert_called_once_with(dry_run=True)
        self.assertIn("Would delete", output.getvalue())
        self.assertIn("2026-08-22", output.getvalue())


if __name__ == "__main__":
    unittest.main()
