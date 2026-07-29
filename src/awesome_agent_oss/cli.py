"""Command line entrypoints for Awesome Agent OSS automation."""

from __future__ import annotations

import argparse
from pathlib import Path

from dotenv import load_dotenv

from awesome_agent_oss.discover.github_topics import (
    DEFAULT_MAX_PAGES,
    DEFAULT_MIN_STARS,
    DEFAULT_PER_PAGE,
    discover_github_topic_candidates,
)
from awesome_agent_oss.metrics.collector import (
    collect_metrics,
)
from awesome_agent_oss.metrics.supabase_snapshots import write_supabase_snapshot
from awesome_agent_oss.ranking.catalog import (
    DEFAULT_CATALOG_PATH,
    build_supabase_catalog,
)
from awesome_agent_oss.render.markdown import (
    DEFAULT_README_PATH,
    DEFAULT_SECTIONS_DIR,
    render_markdown,
)


DEFAULT_ENV_PATH = Path("environments/env/.env")


def collect_metrics_command(args: argparse.Namespace) -> None:
    """Collect GitHub metrics and write a Supabase snapshot."""
    rows = collect_metrics(token=args.github_token)
    count = write_supabase_snapshot(rows)
    print(f"Wrote {count} metric rows to Supabase repository_snapshots")


def discover_command(args: argparse.Namespace) -> None:
    """Discover pending repository candidates from GitHub topics."""
    summary = discover_github_topic_candidates(
        min_stars=args.min_stars,
        per_page=args.per_page,
        max_pages=args.max_pages,
        github_token=args.github_token,
    )
    print(
        "Discovered "
        f"{summary['stored']} new pending repositories "
        f"from {summary['queries']} GitHub search queries "
        f"across {summary['sections']} sections"
    )


def build_catalog_command(args: argparse.Namespace) -> None:
    """Build generated catalog data from Supabase metric snapshots."""
    catalog = build_supabase_catalog(output_path=args.output)

    print(
        "Wrote "
        f"{catalog['repository_count']} repositories to {args.output} "
        f"from snapshot {catalog['snapshot_date']}"
    )


def render_command(args: argparse.Namespace) -> None:
    """Render README and section markdown files."""
    render_markdown(
        catalog_path=args.catalog,
        readme_path=args.readme,
        sections_dir=args.sections_dir,
    )
    print(f"Rendered {args.readme} and section pages in {args.sections_dir}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="awesome-agent-oss",
        description="Automation commands for Awesome Agent OSS.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    discover_parser = subparsers.add_parser(
        "discover",
        help="Discover pending repository candidates from GitHub topics.",
    )
    discover_parser.add_argument(
        "--min-stars",
        type=int,
        default=DEFAULT_MIN_STARS,
        help="Minimum repository star count.",
    )
    discover_parser.add_argument(
        "--per-page",
        type=int,
        default=DEFAULT_PER_PAGE,
        help="GitHub search results per query.",
    )
    discover_parser.add_argument(
        "--max-pages",
        type=int,
        default=DEFAULT_MAX_PAGES,
        help="Maximum GitHub search pages per topic and sort.",
    )
    discover_parser.add_argument(
        "--github-token",
        default=None,
        help="GitHub token. Defaults to the GITHUB_TOKEN environment variable.",
    )
    discover_parser.set_defaults(func=discover_command)

    collect_parser = subparsers.add_parser(
        "collect-metrics",
        help="Collect GitHub metrics for accepted repositories.",
    )
    collect_parser.add_argument(
        "--github-token",
        default=None,
        help="GitHub token. Defaults to the GITHUB_TOKEN environment variable.",
    )
    collect_parser.set_defaults(func=collect_metrics_command)

    catalog_parser = subparsers.add_parser(
        "build-catalog",
        help="Build generated catalog JSON from Supabase metric snapshots.",
    )
    catalog_parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_CATALOG_PATH,
        help="Path to write the generated catalog JSON file.",
    )
    catalog_parser.set_defaults(func=build_catalog_command)

    render_parser = subparsers.add_parser(
        "render",
        help="Render README and section markdown from generated catalog JSON.",
    )
    render_parser.add_argument(
        "--catalog",
        type=Path,
        default=DEFAULT_CATALOG_PATH,
        help="Path to the generated catalog JSON file.",
    )
    render_parser.add_argument(
        "--readme",
        type=Path,
        default=DEFAULT_README_PATH,
        help="Path to README.md.",
    )
    render_parser.add_argument(
        "--sections-dir",
        type=Path,
        default=DEFAULT_SECTIONS_DIR,
        help="Directory where section markdown files are written.",
    )
    render_parser.set_defaults(func=render_command)

    return parser


def main() -> None:
    load_dotenv(dotenv_path=DEFAULT_ENV_PATH, override=False)
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
