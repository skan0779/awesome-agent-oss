"""Registry loading helpers."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml


DEFAULT_REGISTRY_PATH = Path("data/registry/accepted.yml")


class RegistryError(RuntimeError):
    """Raised when registry data cannot be loaded."""


@dataclass(frozen=True)
class AcceptedRepository:
    """A repository accepted into the catalog."""

    full_name: str
    sections: tuple[str, ...]


def load_accepted_repositories(path: Path = DEFAULT_REGISTRY_PATH) -> list[AcceptedRepository]:
    """Load accepted repositories from the registry YAML file."""
    if yaml is None:
        raise RegistryError("PyYAML is required to read registry YAML files.")

    if not path.exists():
        raise RegistryError(f"Accepted registry file does not exist: {path}")

    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not isinstance(raw, list):
        raise RegistryError("accepted.yml must contain a top-level list.")

    repositories: list[AcceptedRepository] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise RegistryError(f"accepted.yml entry #{index + 1} must be a mapping.")

        full_name = item.get("full_name")
        sections = item.get("sections")

        if not isinstance(full_name, str) or "/" not in full_name:
            raise RegistryError(
                f"accepted.yml entry #{index + 1} must include full_name as owner/repo."
            )

        if not isinstance(sections, list) or not sections:
            raise RegistryError(
                f"accepted.yml entry #{index + 1} must include at least one section."
            )

        repositories.append(
            AcceptedRepository(
                full_name=full_name,
                sections=tuple(str(section) for section in sections),
            )
        )

    return repositories
