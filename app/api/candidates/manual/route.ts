import {
  RepositoryStatusRow,
  requireCurationToken,
  restPath,
  supabaseRequest,
} from "../../../lib/supabase";

type ManualCandidateBody = {
  repository?: unknown;
};

type GitHubRepository = {
  full_name: string;
  owner: {
    login: string;
  };
  name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string | null;
  topics?: string[];
  archived: boolean;
  fork: boolean;
};

type StoredRepositoryRow = RepositoryStatusRow & {
  full_name: string;
  owner: string;
  name: string;
  html_url: string | null;
};

type PendingRepositoryResult = {
  repository: StoredRepositoryRow;
  created: boolean;
};

export async function POST(request: Request) {
  const unauthorized = requireCurationToken(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as ManualCandidateBody;
    const repositoryInput = typeof body.repository === "string" ? body.repository : "";
    const fullName = parseRepositoryFullName(repositoryInput);
    if (!fullName) {
      return Response.json(
        { error: "Enter a GitHub URL or owner/repo value." },
        { status: 400 },
      );
    }

    const githubRepository = await fetchGitHubRepository(fullName);
    if (githubRepository.archived) {
      return Response.json({ error: "Archived repositories cannot be added." }, { status: 400 });
    }
    if (githubRepository.fork) {
      return Response.json({ error: "Fork repositories cannot be added." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { repository, created } = await ensurePendingRepository(githubRepository, now);
    if (created) {
      await upsertDiscoveryCandidate(repository.id, now);
    }
    await insertDiscoveryEvent(repository.id, githubRepository, now);

    return Response.json({
      ok: true,
      repository: {
        id: repository.id,
        fullName: repository.full_name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add repository.";
    const status = message.includes("already accepted") || message.includes("already rejected")
      ? 409
      : 500;
    return Response.json({ error: message }, { status });
  }
}

function parseRepositoryFullName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withoutGitSuffix = trimmed.replace(/\.git$/i, "");
  const githubUrlMatch = withoutGitSuffix.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/#?\s]+)/i,
  );
  if (githubUrlMatch) {
    return `${githubUrlMatch[1]}/${githubUrlMatch[2]}`;
  }

  const fullNameMatch = withoutGitSuffix.match(/^([^/\s]+)\/([^/#?\s]+)$/);
  if (fullNameMatch) {
    return `${fullNameMatch[1]}/${fullNameMatch[2]}`;
  }

  return null;
}

async function fetchGitHubRepository(fullName: string): Promise<GitHubRepository> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    headers.set("Authorization", `Bearer ${githubToken}`);
  }

  const response = await fetch(`https://api.github.com/repos/${fullName}`, {
    headers,
    cache: "no-store",
  });
  const text = await response.text();
  if (response.status === 404) {
    throw new Error(`GitHub repository not found: ${fullName}`);
  }
  if (!response.ok) {
    throw new Error(`GitHub request failed: HTTP ${response.status} ${text}`);
  }

  return JSON.parse(text) as GitHubRepository;
}

async function ensurePendingRepository(
  githubRepository: GitHubRepository,
  now: string,
): Promise<PendingRepositoryResult> {
  const existingRows = await supabaseRequest<StoredRepositoryRow[]>(
    restPath("repositories", {
      select: "id,full_name,owner,name,html_url,status",
      full_name: `eq.${githubRepository.full_name}`,
      limit: "1",
    }),
  );
  const existing = existingRows[0];
  if (existing) {
    if (existing.status === "accepted") {
      throw new Error(`${existing.full_name} is already accepted.`);
    }
    if (existing.status === "rejected") {
      throw new Error(`${existing.full_name} is already rejected.`);
    }

    await supabaseRequest(
      restPath("repositories", {
        id: `eq.${existing.id}`,
      }),
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          html_url: githubRepository.html_url,
        }),
      },
    );
    return { repository: existing, created: false };
  }

  const storedRows = await supabaseRequest<StoredRepositoryRow[]>("/rest/v1/repositories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        full_name: githubRepository.full_name,
        owner: githubRepository.owner.login,
        name: githubRepository.name,
        html_url: githubRepository.html_url,
        status: "pending",
        first_seen_at: now,
      },
    ]),
  });
  const stored = storedRows[0];
  if (!stored) {
    throw new Error(`Repository was not stored: ${githubRepository.full_name}`);
  }

  return { repository: stored, created: true };
}

async function upsertDiscoveryCandidate(repositoryId: number, now: string) {
  await supabaseRequest(
    restPath("discovery_candidates", {
      on_conflict: "repository_id",
    }),
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([
        {
          repository_id: repositoryId,
          status: "pending",
          source: "manual",
          query: null,
          suggested_sections: [],
          matched_topics: [],
          discovered_at: now,
          decided_at: null,
          decision_reason: null,
        },
      ]),
    },
  );
}

async function insertDiscoveryEvent(
  repositoryId: number,
  githubRepository: GitHubRepository,
  now: string,
) {
  await supabaseRequest("/rest/v1/curation_events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        repository_id: repositoryId,
        action: "discovered",
        next_repository_status: "pending",
        sections: [],
        metadata: {
          source: "manual",
          stars: githubRepository.stargazers_count,
          forks: githubRepository.forks_count,
          description: githubRepository.description,
          pushed_at: githubRepository.pushed_at,
          topics: githubRepository.topics || [],
          queries: [],
        },
        created_at: now,
      },
    ]),
  });
}
