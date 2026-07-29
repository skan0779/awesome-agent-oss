"""Render README and section markdown from generated catalog data."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from awesome_agent_oss.ranking.catalog import DEFAULT_CATALOG_PATH
from awesome_agent_oss.registry import DEFAULT_REGISTRY_PATH


DEFAULT_SECTIONS_PATH = DEFAULT_REGISTRY_PATH.with_name("sections.yml")
DEFAULT_README_PATH = Path("README.md")
DEFAULT_SECTIONS_DIR = Path("sections")
README_START = "<!-- AWESOME_AGENT_OSS:START -->"
README_END = "<!-- AWESOME_AGENT_OSS:END -->"


class RenderError(RuntimeError):
    """Raised when markdown files cannot be rendered."""


@dataclass(frozen=True)
class Section:
    """A catalog section definition."""

    id: str
    name: str
    description: str


def render_markdown(
    catalog_path: Path = DEFAULT_CATALOG_PATH,
    sections_path: Path = DEFAULT_SECTIONS_PATH,
    readme_path: Path = DEFAULT_README_PATH,
    sections_dir: Path = DEFAULT_SECTIONS_DIR,
) -> None:
    """Render README and section markdown files from generated catalog data."""
    catalog = load_catalog(catalog_path)
    sections = load_catalog_sections(catalog) or load_sections(sections_path)
    repositories_by_section = catalog.get("sections") or {}

    sections_dir.mkdir(parents=True, exist_ok=True)
    for section in sections:
        rows = repositories_by_section.get(section.id, [])
        render_section_file(section, rows, sections_dir / f"{section.id}.md", catalog)

    readme_body = render_readme_body(sections, repositories_by_section, catalog)
    update_readme(readme_path, readme_body)


def load_catalog(path: Path) -> dict[str, Any]:
    """Load generated catalog JSON."""
    if not path.exists():
        raise RenderError(f"Catalog file does not exist: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_catalog_sections(catalog: dict[str, Any]) -> list[Section]:
    """Load section definitions embedded in generated catalog data."""
    raw = catalog.get("section_definitions")
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise RenderError("catalog section_definitions must be a list.")

    sections: list[Section] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise RenderError(f"catalog section_definitions entry #{index + 1} must be a mapping.")

        section_id = item.get("id")
        name = item.get("name")
        description = item.get("description")
        if not isinstance(section_id, str) or not section_id:
            raise RenderError(
                f"catalog section_definitions entry #{index + 1} must include id."
            )
        if not isinstance(name, str) or not name:
            raise RenderError(
                f"catalog section_definitions entry #{index + 1} must include name."
            )

        sections.append(
            Section(
                id=section_id,
                name=name,
                description=description if isinstance(description, str) else "",
            )
        )

    return sections


def load_sections(path: Path) -> list[Section]:
    """Load section definitions from registry YAML."""
    if not path.exists():
        raise RenderError(f"Sections registry file does not exist: {path}")

    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not isinstance(raw, list):
        raise RenderError("sections.yml must contain a top-level list.")

    sections: list[Section] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise RenderError(f"sections.yml entry #{index + 1} must be a mapping.")

        section_id = item.get("id")
        name = item.get("name")
        description = item.get("description")
        if not isinstance(section_id, str) or not section_id:
            raise RenderError(f"sections.yml entry #{index + 1} must include id.")
        if not isinstance(name, str) or not name:
            raise RenderError(f"sections.yml entry #{index + 1} must include name.")

        sections.append(
            Section(
                id=section_id,
                name=name,
                description=description if isinstance(description, str) else "",
            )
        )

    return sections


def render_readme_body(
    sections: list[Section],
    repositories_by_section: dict[str, Any],
    catalog: dict[str, Any],
) -> str:
    """Render the generated section of README.md."""
    lines = [
        f"_Generated from snapshot `{catalog.get('snapshot_date', 'unknown')}`._",
        "",
    ]

    for section in sections:
        rows = repositories_by_section.get(section.id, [])
        lines.extend(
            [
                f"## [{section.name}](./sections/{section.id}.md)",
                "",
                section.description,
                "",
                render_readme_table(rows[:10]),
                "",
            ]
        )

    return "\n".join(lines).rstrip() + "\n"


def render_section_file(
    section: Section,
    rows: list[dict[str, Any]],
    output_path: Path,
    catalog: dict[str, Any],
) -> None:
    """Render one section markdown file."""
    lines = [
        f"# {section.name}",
        "",
        section.description,
        "",
        f"_Generated from snapshot `{catalog.get('snapshot_date', 'unknown')}`._",
        "",
        render_section_table(rows),
        "",
        "[Back to README](../README.md)",
        "",
    ]
    output_path.write_text("\n".join(lines), encoding="utf-8")


def update_readme(readme_path: Path, generated_body: str) -> None:
    """Insert or replace the generated README section."""
    if readme_path.exists():
        existing = readme_path.read_text(encoding="utf-8").rstrip()
    else:
        existing = "# awesome-agent-oss\nTrack open-source repositories for AI agent stacks by category and trend."

    generated_section = f"{README_START}\n{generated_body}{README_END}"
    if README_START in existing and README_END in existing:
        before = existing.split(README_START, 1)[0].rstrip()
        after = existing.split(README_END, 1)[1].lstrip()
        parts = [before, generated_section]
        if after:
            parts.append(after)
        content = "\n\n".join(parts)
    else:
        content = f"{existing}\n\n{generated_section}"

    readme_path.write_text(content.rstrip() + "\n", encoding="utf-8")


def render_readme_table(rows: list[dict[str, Any]]) -> str:
    """Render a compact repository table for README.md."""
    header = "| Rank | Repository | Stars | Forks | Updated | Latest release | License |"
    separator = "| ---: | --- | ---: | ---: | --- | --- | --- |"
    if not rows:
        return "\n".join(
            [
                header,
                separator,
                "| - | No accepted repositories yet. |  |  |  |  |  |",
            ]
        )

    rendered_rows = [header, separator]
    for rank, row in enumerate(rows, start=1):
        rendered_rows.append(
            " | ".join(
                [
                    f"| {rank}",
                    repository_link(row),
                    format_number(row.get("stars")),
                    format_number(row.get("forks")),
                    format_date(row.get("pushed_at")),
                    format_release(row),
                    format_license(row.get("license")),
                ]
            )
            + " |"
        )

    return "\n".join(rendered_rows)


def render_section_table(rows: list[dict[str, Any]]) -> str:
    """Render a detailed repository table for section pages."""
    header = (
        "| Rank | Repository | Score | Stars | Stars 7d | Stars 30d | Stars 60d | "
        "Forks | Forks 7d | Forks 30d | Forks 60d | Updated | Latest release | License |"
    )
    separator = "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |"
    if not rows:
        return "\n".join(
            [
                header,
                separator,
                "| - | No accepted repositories yet. |  |  |  |  |  |  |  |  |  |  |  |  |",
            ]
        )

    rendered_rows = [header, separator]
    for rank, row in enumerate(rows, start=1):
        rendered_rows.append(
            " | ".join(
                [
                    f"| {rank}",
                    repository_link(row),
                    format_number(row.get("score")),
                    format_number(row.get("stars")),
                    format_number(row.get("stars_7d")),
                    format_number(row.get("stars_30d")),
                    format_number(row.get("stars_60d")),
                    format_number(row.get("forks")),
                    format_number(row.get("forks_7d")),
                    format_number(row.get("forks_30d")),
                    format_number(row.get("forks_60d")),
                    format_date(row.get("pushed_at")),
                    format_release(row),
                    format_license(row.get("license")),
                ]
            )
            + " |"
        )

    return "\n".join(rendered_rows)


def repository_link(row: dict[str, Any]) -> str:
    """Return a markdown link for a repository."""
    full_name = str(row.get("full_name") or "")
    html_url = row.get("html_url")
    if isinstance(html_url, str) and html_url:
        return f"[{escape_markdown(full_name)}]({html_url})"
    return escape_markdown(full_name)


def format_release(row: dict[str, Any]) -> str:
    """Return compact release text."""
    tag = row.get("latest_release_tag")
    published_at = format_date(row.get("latest_release_published_at"))
    if tag and published_at:
        return f"{escape_markdown(str(tag))} ({published_at})"
    if tag:
        return escape_markdown(str(tag))
    return "-"


def format_license(value: Any) -> str:
    """Format a repository license value."""
    if not isinstance(value, str) or not value:
        return "-"
    if value.upper() == "NOASSERTION":
        return "Other"
    return escape_markdown(value)


def format_number(value: Any) -> str:
    """Format numeric values for markdown tables."""
    if isinstance(value, bool) or value is None:
        return "-"
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, float):
        return f"{value:,.0f}"
    return "-"


def format_date(value: Any) -> str:
    """Format an ISO timestamp as YYYY-MM-DD."""
    if not isinstance(value, str) or not value:
        return "-"
    return value[:10]


def escape_markdown(value: str) -> str:
    """Escape markdown table separators."""
    return value.replace("|", "\\|")
