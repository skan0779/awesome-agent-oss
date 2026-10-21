"""Repository 404s must be persisted without aborting the remaining collection."""

import argparse
import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from awesome_agent_oss.cli import collect_metrics_command
from awesome_agent_oss.github_client import GitHubClient, GitHubClientError
from awesome_agent_oss.metrics.availability import record_repository_availability
from awesome_agent_oss.metrics.collector import (
    MetricsCollectionError,
    collect_repository_list,
    collect_repository_metrics,
)
from awesome_agent_oss.ranking.catalog import build_supabase_catalog
from awesome_agent_oss.supabase_client import SupabaseClient, SupabaseClientError
from awesome_agent_oss.supabase_registry import AcceptedRepository, RegistryError, load_supabase_accepted_repositories


CHECKED_AT = datetime(2026, 10, 21, 0, 10, tzinfo=UTC)
REPOSITORIES = [AcceptedRepository(f"test/repo-{i}", ("memory",), i) for i in (1, 2, 3)]


class RepositoryAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.github = Mock(spec=GitHubClient)
        self.github.get_repository.return_value = {"name": "test", "stargazers_count": 10}
        self.github.get_latest_release.return_value = None
        self.supabase = Mock(spec=SupabaseClient)
        self.supabase.request.return_value = {"outcome": "available", "not_found_days": 0}

    def collect_one(self, **kwargs):
        with redirect_stderr(io.StringIO()):
            return collect_repository_metrics(
                REPOSITORIES[0], self.github, CHECKED_AT, supabase_client=self.supabase, **kwargs
            )

    def test_404_between_healthy_repositories_continues_and_stores_healthy_rows(self):
        self.github.get_repository.side_effect = [
            {"name": "one", "stargazers_count": 10},
            GitHubClientError("Not Found", status_code=404),
            {"name": "three", "stargazers_count": 30},
        ]
        self.supabase.request.side_effect = [
            {"outcome": "available", "not_found_days": 0},
            {"outcome": "not_found", "not_found_days": 1},
            {"outcome": "available", "not_found_days": 0},
        ]
        self.supabase.select_all.return_value = [
            {"id": repo.repository_id, "full_name": repo.full_name, "sections": list(repo.sections)}
            for repo in REPOSITORIES
        ]
        self.supabase.upsert.side_effect = lambda table, rows, **kwargs: rows
        stderr, stdout = io.StringIO(), io.StringIO()
        with (
            patch("awesome_agent_oss.metrics.collector.GitHubClient", return_value=self.github),
            patch.object(SupabaseClient, "from_env", return_value=self.supabase),
            redirect_stderr(stderr), redirect_stdout(stdout),
        ):
            collect_metrics_command(argparse.Namespace(github_token="test"))
        self.assertEqual(self.github.get_repository.call_count, 3)
        self.assertEqual(self.github.get_latest_release.call_count, 2)
        stored_rows = self.supabase.upsert.call_args.args[1]
        self.assertEqual([row["repository_id"] for row in stored_rows], [1, 3])
        self.assertIn("Skipping test/repo-2", stderr.getvalue())
        self.assertIn("Wrote 2 metric rows", stdout.getvalue())

    def test_rejection_on_second_date_still_collects_the_next_repository(self):
        self.github.get_repository.side_effect = [
            GitHubClientError("Not Found", status_code=404), {"name": "healthy"},
        ]
        self.supabase.request.side_effect = [
            {"outcome": "rejected", "not_found_days": 2},
            {"outcome": "available", "not_found_days": 0},
        ]
        with (
            patch("awesome_agent_oss.metrics.collector.GitHubClient", return_value=self.github),
            redirect_stderr(io.StringIO()) as output,
        ):
            rows = collect_repository_list(REPOSITORIES[:2], supabase_client=self.supabase)
        self.assertEqual([row["full_name"] for row in rows], [REPOSITORIES[1].full_name])
        self.assertIn("2/2 distinct UTC dates; rejected", output.getvalue())

    def test_other_github_errors_never_record_a_404(self):
        for status in (401, 403, 429, 500, None):
            with self.subTest(status=status):
                self.github.get_repository.side_effect = GitHubClientError(
                    "An error mentioning HTTP 404 in its body", status_code=status
                )
                with self.assertRaises(MetricsCollectionError):
                    self.collect_one()
                self.supabase.request.assert_not_called()

    def test_release_404_is_a_successful_repository_lookup(self):
        self.github = GitHubClient()
        with patch.object(self.github, "_request", side_effect=[
            {"name": "healthy"}, GitHubClientError("Not Found", status_code=404),
        ]):
            row = self.collect_one()
        self.assertIsNone(row["latest_release_tag"])
        self.assertEqual(self.supabase.request.call_args.kwargs["body"]["p_status_code"], 200)

    def test_repository_success_resets_streak_even_if_release_request_fails(self):
        self.github.get_latest_release.side_effect = GitHubClientError("Unavailable", status_code=503)
        with self.assertRaises(MetricsCollectionError):
            self.collect_one()
        self.assertEqual(self.supabase.request.call_args.kwargs["body"]["p_status_code"], 200)

    def test_failed_persistence_is_not_silently_ignored(self):
        self.github.get_repository.side_effect = GitHubClientError("Not Found", status_code=404)
        self.supabase.request.side_effect = SupabaseClientError("Database unavailable")
        with self.assertRaisesRegex(MetricsCollectionError, "Database unavailable"):
            self.collect_one()

    def test_stale_checks_do_not_produce_snapshots(self):
        self.supabase.request.return_value = {"outcome": "ignored", "not_found_days": 0}
        self.assertIsNone(self.collect_one())
        self.github.get_latest_release.assert_not_called()

    def test_rpc_records_id_and_utc_timestamp(self):
        checked_at = datetime(2026, 10, 21, 8, tzinfo=timezone(timedelta(hours=9)))
        record_repository_availability(self.supabase, 10, 404, checked_at)
        self.assertEqual(self.supabase.request.call_args.kwargs["body"], {
            "p_repository_id": 10, "p_status_code": 404, "p_checked_at": "2026-10-20T23:00:00+00:00",
        })

    def test_rpc_invalid_response_is_an_error(self):
        for result in (None, [], {}, {"outcome": "rejected", "not_found_days": True}):
            with self.subTest(result=result):
                self.supabase.request.return_value = result
                with self.assertRaises(SupabaseClientError):
                    record_repository_availability(self.supabase, 1, 404, CHECKED_AT)

    def test_http_status_is_preserved_on_the_github_exception(self):
        error = HTTPError("https://api.github.com/repos/test/missing", 404, "Not Found", {}, io.BytesIO(b"{}"))
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaises(GitHubClientError) as raised:
                GitHubClient().get_repository("test/missing")
        self.assertEqual(raised.exception.status_code, 404)

    def test_registry_requires_a_real_database_id(self):
        for repository_id in (None, True, 0, "1"):
            with self.subTest(repository_id=repository_id):
                self.supabase.select_all.return_value = [{
                    "id": repository_id, "full_name": "test/repo", "sections": ["memory"],
                }]
                with self.assertRaises(RegistryError):
                    load_supabase_accepted_repositories(self.supabase)

    def test_all_repositories_rejected_can_generate_an_empty_catalog(self):
        self.supabase.select_all.side_effect = [
            [{"id": "memory", "name": "Memory", "sort_order": 0}],
            [],
            [{"repository_id": 1, "snapshot_date": "2026-10-20", "stars": 20}],
        ]
        self.supabase.select.return_value = [{"snapshot_date": "2026-10-20"}]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalog.json"
            catalog = build_supabase_catalog(output, client=self.supabase)
            self.assertEqual(catalog["repository_count"], 0)
            self.assertIsNone(catalog["snapshot_date"])
            self.assertEqual(json.loads(output.read_text())["repositories"], [])


if __name__ == "__main__":
    unittest.main()
