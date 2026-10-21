"""Run availability policy tests in an isolated, temporary PostgreSQL cluster.

Set TEST_POSTGRES_BIN to a directory containing postgres, initdb, pg_ctl, and
psql. These tests never use the project's Supabase connection or credentials.
"""

import os
import shutil
import subprocess
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


POSTGRES_BIN = os.environ.get("TEST_POSTGRES_BIN")
if not POSTGRES_BIN and shutil.which("postgres"):
    POSTGRES_BIN = str(Path(shutil.which("postgres")).resolve().parent)
ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(POSTGRES_BIN, "Set TEST_POSTGRES_BIN to run isolated PostgreSQL tests")
class RepositoryAvailabilitySQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="agent-availability-")
        cls.addClassCleanup(cls.directory.cleanup)
        cls.data = Path(cls.directory.name) / "data"
        cls.run_tool("initdb", "-D", str(cls.data), "-U", "postgres", "-A", "trust", "--no-locale")
        cls.run_tool(
            "pg_ctl", "-D", str(cls.data), "-l", str(Path(cls.directory.name) / "postgres.log"),
            "-o", f"-F -h '' -k {cls.directory.name} -p 55439", "-w", "start",
        )
        cls.addClassCleanup(cls.run_tool, "pg_ctl", "-D", str(cls.data), "-m", "immediate", "-w", "stop")
        cls.sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;")
        cls.sql((ROOT / "supabase/migrations/0001_initial_schema.sql").read_text())
        cls.sql("GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;")
        cls.sql((ROOT / "supabase/migrations/0003_repository_availability.sql").read_text())

    @classmethod
    def run_tool(cls, name, *args, input=None):
        result = subprocess.run(
            [str(Path(POSTGRES_BIN) / name), *args], input=input,
            text=True, capture_output=True, timeout=30,
        )
        if result.returncode:
            raise AssertionError(f"{name} failed: {result.stderr}")
        return result.stdout.strip()

    @classmethod
    def sql(cls, source):
        return cls.run_tool(
            "psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-h", cls.directory.name,
            "-p", "55439", "-U", "postgres", "-d", "postgres", input=source,
        )

    def test_policy_reset_permissions_and_atomic_rejection(self):
        self.sql((ROOT / "tests/sql/repository_availability.sql").read_text())

    def test_overlapping_runs_count_each_date_once_and_reject_once(self):
        self.sql("""
            INSERT INTO repositories (id, full_name, owner, name, status, accepted_at)
            VALUES (77, 'test/concurrent', 'test', 'concurrent', 'accepted', '2026-01-01Z');
        """)
        for day in (20, 21):
            scripts = [f"""
                BEGIN;
                SELECT record_repository_availability(77, 404, '2026-10-{day}T00:10:0{second}Z');
                SELECT pg_sleep(0.05);
                COMMIT;
            """ for second in (0, 1)]
            with ThreadPoolExecutor(max_workers=2) as executor:
                list(executor.map(self.sql, scripts))
            self.assertEqual(self.sql("SELECT not_found_days FROM repository_availability WHERE repository_id = 77;"), str(day - 19))
        self.assertEqual(self.sql("SELECT status FROM repositories WHERE id = 77;"), "rejected")
        self.assertEqual(self.sql("SELECT count(*) FROM curation_events WHERE repository_id = 77;"), "1")


if __name__ == "__main__":
    unittest.main()
