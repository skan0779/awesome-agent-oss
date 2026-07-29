"""GitHub REST API client helpers."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class GitHubClientError(RuntimeError):
    """Raised when GitHub API requests fail."""


class GitHubClient:
    """Small GitHub REST API client for repository metadata."""

    def __init__(self, token: str | None = None) -> None:
        self.token = token or os.getenv("GITHUB_TOKEN")

    def get_repository(self, full_name: str) -> dict[str, Any]:
        return self._request(f"/repos/{full_name}")

    def get_latest_release(self, full_name: str) -> dict[str, Any] | None:
        try:
            return self._request(f"/repos/{full_name}/releases/latest")
        except GitHubClientError as error:
            if "HTTP 404" in str(error):
                return None
            raise

    def search_repositories(
        self,
        query: str,
        sort: str = "stars",
        order: str = "desc",
        per_page: int = 30,
        page: int = 1,
    ) -> dict[str, Any]:
        params = urllib.parse.urlencode(
            {
                "q": query,
                "sort": sort,
                "order": order,
                "per_page": per_page,
                "page": page,
            }
        )
        return self._request(f"/search/repositories?{params}")

    def _request(self, path: str) -> dict[str, Any]:
        url = urllib.parse.urljoin("https://api.github.com", path)
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "awesome-agent-oss-metrics",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            raise GitHubClientError(f"GitHub API HTTP {error.code} for {url}: {body}") from error
        except urllib.error.URLError as error:
            raise GitHubClientError(f"GitHub API request failed for {url}: {error}") from error
