"""GitHub REST API client helpers."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


DEFAULT_SEARCH_INTERVAL_SECONDS = 2.1
DEFAULT_RATE_LIMIT_RETRIES = 3


class GitHubClientError(RuntimeError):
    """Raised when GitHub API requests fail."""


class GitHubClient:
    """Small GitHub REST API client for repository metadata."""

    def __init__(
        self,
        token: str | None = None,
        search_interval_seconds: float = DEFAULT_SEARCH_INTERVAL_SECONDS,
        rate_limit_retries: int = DEFAULT_RATE_LIMIT_RETRIES,
    ) -> None:
        self.token = token or os.getenv("GITHUB_TOKEN")
        self.search_interval_seconds = max(0.0, search_interval_seconds)
        self.rate_limit_retries = max(0, rate_limit_retries)
        self._last_search_at: float | None = None

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
        self._pace_search_request()
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

    def _pace_search_request(self) -> None:
        """Keep repository search requests within GitHub's per-minute limit."""
        now = time.monotonic()
        if self._last_search_at is not None:
            remaining = self.search_interval_seconds - (now - self._last_search_at)
            if remaining > 0:
                time.sleep(remaining)
        self._last_search_at = time.monotonic()

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

        for attempt in range(self.rate_limit_retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                body = error.read().decode("utf-8", errors="replace")
                if self._is_rate_limit_error(error, body) and attempt < self.rate_limit_retries:
                    delay = self._rate_limit_delay(error)
                    print(
                        f"GitHub API rate limit reached; retrying in {delay:.1f} seconds.",
                        file=sys.stderr,
                    )
                    time.sleep(delay)
                    continue
                raise GitHubClientError(
                    f"GitHub API HTTP {error.code} for {url}: {body}"
                ) from error
            except urllib.error.URLError as error:
                raise GitHubClientError(f"GitHub API request failed for {url}: {error}") from error

        raise GitHubClientError(f"GitHub API request retries exhausted for {url}")

    @staticmethod
    def _is_rate_limit_error(error: urllib.error.HTTPError, body: str) -> bool:
        if error.code == 429:
            return True
        remaining = error.headers.get("X-RateLimit-Remaining")
        return error.code == 403 and (remaining == "0" or "rate limit" in body.lower())

    @staticmethod
    def _rate_limit_delay(error: urllib.error.HTTPError) -> float:
        retry_after = error.headers.get("Retry-After")
        if retry_after:
            try:
                return max(1.0, float(retry_after) + 1.0)
            except ValueError:
                pass

        reset_at = error.headers.get("X-RateLimit-Reset")
        if reset_at:
            try:
                return max(1.0, float(reset_at) - time.time() + 1.0)
            except ValueError:
                pass

        return 60.0
