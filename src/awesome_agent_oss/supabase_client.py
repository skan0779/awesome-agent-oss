"""Small Supabase PostgREST client used by automation commands."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class SupabaseClientError(RuntimeError):
    """Raised when Supabase configuration or requests fail."""


@dataclass(frozen=True)
class SupabaseClient:
    """Minimal client for Supabase table reads and writes."""

    project_url: str
    api_key: str

    @classmethod
    def from_env(
        cls,
        project_url: str | None = None,
        api_key: str | None = None,
    ) -> "SupabaseClient":
        resolved_url = (
            project_url
            or os.environ.get("SUPABASE_PROJECT_URL")
            or os.environ.get("SUPABASE_URL")
        )
        resolved_key = (
            api_key
            or os.environ.get("SUPABASE_SECRET_KEY")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            or os.environ.get("SUPABASE_KEY")
        )

        if not resolved_url:
            raise SupabaseClientError(
                "Supabase project URL is required. Set SUPABASE_PROJECT_URL."
            )
        if not resolved_key:
            raise SupabaseClientError(
                "Supabase secret key is required. Set SUPABASE_SECRET_KEY."
            )

        return cls(project_url=resolved_url.rstrip("/"), api_key=resolved_key)

    def upsert(
        self,
        table: str,
        rows: list[dict[str, Any]],
        on_conflict: str,
    ) -> list[dict[str, Any]]:
        """Upsert rows and return the stored representation."""
        if not rows:
            return []

        stored_rows: list[dict[str, Any]] = []
        for batch in group_rows_by_keys(rows):
            stored = self.request(
                "POST",
                f"/rest/v1/{table}",
                params={"on_conflict": on_conflict},
                body=batch,
                extra_headers={
                    "Prefer": "resolution=merge-duplicates,return=representation",
                },
            )
            if isinstance(stored, list):
                stored_rows.extend(stored)

        return stored_rows

    def insert(
        self,
        table: str,
        rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Insert rows and return the stored representation."""
        if not rows:
            return []

        stored_rows: list[dict[str, Any]] = []
        for batch in group_rows_by_keys(rows):
            stored = self.request(
                "POST",
                f"/rest/v1/{table}",
                body=batch,
                extra_headers={"Prefer": "return=representation"},
            )
            if isinstance(stored, list):
                stored_rows.extend(stored)

        return stored_rows

    def select(
        self,
        table: str,
        columns: str = "*",
        params: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        """Select rows from a Supabase table or view."""
        request_params = {"select": columns}
        if params:
            request_params.update(params)

        result = self.request("GET", f"/rest/v1/{table}", params=request_params)
        if isinstance(result, list):
            return result
        raise SupabaseClientError(f"Supabase select returned an unexpected payload: {result!r}")

    def select_all(
        self,
        table: str,
        columns: str = "*",
        params: dict[str, str] | None = None,
        page_size: int = 1000,
    ) -> list[dict[str, Any]]:
        """Select every matching row using PostgREST offset pagination."""
        if page_size < 1:
            raise ValueError("page_size must be positive.")

        base_params = dict(params or {})
        base_offset = int(base_params.pop("offset", "0"))
        rows: list[dict[str, Any]] = []

        while True:
            page_params = {
                **base_params,
                "limit": str(page_size),
                "offset": str(base_offset + len(rows)),
            }
            page = self.select(table, columns=columns, params=page_params)
            if not page:
                return rows
            rows.extend(page)

    def request(
        self,
        method: str,
        path: str,
        params: dict[str, str] | None = None,
        body: Any | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> Any:
        """Send a JSON request to Supabase PostgREST."""
        query = f"?{urlencode(params, safe=',')}" if params else ""
        url = f"{self.project_url}{path}{query}"
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")

        headers = {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if extra_headers:
            headers.update(extra_headers)

        request = Request(url, data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                payload = response.read().decode("utf-8")
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise SupabaseClientError(
                f"Supabase request failed: HTTP {error.code} {detail}"
            ) from error
        except URLError as error:
            raise SupabaseClientError(f"Supabase request failed: {error.reason}") from error

        if not payload:
            return None
        return json.loads(payload)


def group_rows_by_keys(rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group rows so every PostgREST bulk request has matching object keys."""
    batches: dict[tuple[str, ...], list[dict[str, Any]]] = {}
    for row in rows:
        key = tuple(sorted(row))
        batches.setdefault(key, []).append(row)
    return list(batches.values())
