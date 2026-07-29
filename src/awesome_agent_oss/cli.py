"""Command line entrypoints for Awesome Agent OSS automation."""

from __future__ import annotations

import argparse
from pathlib import Path

from dotenv import load_dotenv

from awesome_agent_oss.metrics.collector import (
    DEFAULT_SNAPSHOT_DIR,
    collect_metrics,
)
from awesome_agent_oss.metrics.snapshots import write_jsonl_snapshot
from awesome_agent_oss.ranking.catalog import DEFAULT_CATALOG_PATH, build_catalog
from awesome_agent_oss.render.markdown import (
    DEFAULT_README_PATH,
    DEFAULT_SECTIONS_DIR,
    DEFAULT_SECTIONS_PATH,
    render_markdown,
)
from awesome_agent_oss.registry import DEFAULT_REGISTRY_PATH


DEFAULT_ENV_PATH = Path("environments/env/.env")


def collect_metrics_command(args: argparse.Namespace) -> None:
    """Collect GitHub metrics and write a daily JSONL snapshot."""
    rows = collect_metrics(
        registry_path=args.registry,
        token=args.github_token,
    )
    snapshot_path = write_jsonl_snapshot(rows, args.snapshot_dir)
    print(f"Wrote {len(rows)} metric rows to {snapshot_path}")


def build_catalog_command(args: argparse.Namespace) -> None:
    """Build generated catalog data from metric snapshots."""
    catalog = build_catalog(
        snapshot_dir=args.snapshot_dir,
        output_path=args.output,
    )
    print(
        "Wrote "
        f"{catalog['repository_count']} repositories to {args.output} "
        f"from snapshot {catalog['snapshot_date']}"
    )


def render_command(args: argparse.Namespace) -> None:
    """Render README and section markdown files."""
    render_markdown(
        catalog_path=args.catalog,
        sections_path=args.sections,
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

    collect_parser = subparsers.add_parser(
        "collect-metrics",
        help="Collect GitHub metrics for accepted repositories.",
    )
    collect_parser.add_argument(
        "--registry",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to the accepted repository registry YAML file.",
    )
    collect_parser.add_argument(
        "--snapshot-dir",
        type=Path,
        default=DEFAULT_SNAPSHOT_DIR,
        help="Directory where daily JSONL snapshots are written.",
    )
    collect_parser.add_argument(
        "--github-token",
        default=None,
        help="GitHub token. Defaults to the GITHUB_TOKEN environment variable.",
    )
    collect_parser.set_defaults(func=collect_metrics_command)

    catalog_parser = subparsers.add_parser(
        "build-catalog",
        help="Build generated catalog JSON from metric snapshots.",
    )
    catalog_parser.add_argument(
        "--snapshot-dir",
        type=Path,
        default=DEFAULT_SNAPSHOT_DIR,
        help="Directory containing daily JSONL snapshots.",
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
        "--sections",
        type=Path,
        default=DEFAULT_SECTIONS_PATH,
        help="Path to the section registry YAML file.",
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
