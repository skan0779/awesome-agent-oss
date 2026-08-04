import {
  CurationEventRow,
  PendingCandidateRow,
  SupabaseSection,
  normalizeRepository,
  requireCurationToken,
  restPath,
  supabaseRequest,
} from "../../lib/supabase";

export const dynamic = "force-dynamic";

type CandidatePayload = {
  id: number;
  repositoryId: number;
  fullName: string;
  htmlUrl: string | null;
  repositoryStatus: string;
  source: string;
  query: string | null;
  suggestedSections: string[];
  matchedTopics: string[];
  discoveredAt: string;
  metadata: CurationEventRow["metadata"];
};

type AcceptedRepositoryRow = {
  id: number;
  full_name: string;
  html_url: string | null;
  accepted_at: string | null;
  created_at: string;
};

type AcceptedSectionRow = {
  repository_id: number;
  section_id: string;
};

type LatestSnapshotRow = {
  repository_id: number;
  description: string | null;
  stars: number | null;
  forks: number | null;
  topics: string[] | null;
  pushed_at: string | null;
};

export async function GET(request: Request) {
  const unauthorized = requireCurationToken(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const url = new URL(request.url);
    const page = boundedInteger(url.searchParams.get("page"), 1, 1, 100000);
    const perPage = boundedInteger(url.searchParams.get("perPage"), 10, 1, 50);
    const status = normalizeStatus(url.searchParams.get("status"));
    const sectionFilter = normalizedParam(url.searchParams.get("section"));
    const searchQuery = normalizedParam(url.searchParams.get("search"));
    const sort = normalizeSort(url.searchParams.get("sort"));

    const [sections, allCandidates] = await Promise.all([
      supabaseRequest<SupabaseSection[]>(
        restPath("sections", {
          select: "id,name,topics,sort_order",
          order: "sort_order.asc,id.asc",
          limit: "10000",
        }),
      ),
      status === "accepted" ? loadAcceptedRepositories() : loadPendingCandidates(),
    ]);

    const filteredCandidates = sortCandidates(
      filterCandidates(allCandidates, sectionFilter, searchQuery),
      sort,
    );
    const totalCount = filteredCandidates.length;
    const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / perPage);
    const normalizedPage = Math.min(page, totalPages);
    const offset = (normalizedPage - 1) * perPage;
    const candidates = filteredCandidates.slice(offset, offset + perPage);

    return Response.json({
      candidates,
      sections,
      pagination: {
        page: normalizedPage,
        perPage,
        pendingCount: status === "pending" ? allCandidates.length : 0,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load candidates." },
      { status: 500 },
    );
  }
}

async function loadPendingCandidates(): Promise<CandidatePayload[]> {
  const candidateRows = await supabaseRequest<PendingCandidateRow[]>(
    restPath("discovery_candidates", {
      select:
        "id,repository_id,status,source,query,suggested_sections,matched_topics,discovered_at,repositories(id,full_name,owner,name,html_url,status)",
      status: "eq.pending",
      order: "discovered_at.desc",
      limit: "10000",
    }),
  );
  const repositoryIds = candidateRows.map((candidate) => candidate.repository_id);
  const metadataByRepositoryId = await loadDiscoveryMetadata(repositoryIds);

  return candidateRows.flatMap((candidate) => {
    const repository = normalizeRepository(candidate.repositories);
    if (!repository) {
      return [];
    }

    return [{
      id: candidate.id,
      repositoryId: candidate.repository_id,
      fullName: repository.full_name,
      htmlUrl: repository.html_url,
      repositoryStatus: repository.status,
      source: candidate.source,
      query: candidate.query,
      suggestedSections: candidate.suggested_sections || [],
      matchedTopics: candidate.matched_topics || [],
      discoveredAt: candidate.discovered_at,
      metadata: metadataByRepositoryId.get(candidate.repository_id) || {},
    }];
  });
}

async function loadAcceptedRepositories(): Promise<CandidatePayload[]> {
  const [repositories, sectionRows] = await Promise.all([
    supabaseRequest<AcceptedRepositoryRow[]>(
      restPath("repositories", {
        select: "id,full_name,html_url,accepted_at,created_at",
        status: "eq.accepted",
        order: "accepted_at.desc,full_name.asc",
        limit: "10000",
      }),
    ),
    supabaseRequest<AcceptedSectionRow[]>(
      restPath("repository_sections", {
        select: "repository_id,section_id",
        status: "eq.accepted",
        limit: "10000",
      }),
    ),
  ]);
  const sectionsByRepository = new Map<number, string[]>();
  for (const row of sectionRows) {
    const sectionIds = sectionsByRepository.get(row.repository_id) || [];
    sectionIds.push(row.section_id);
    sectionsByRepository.set(row.repository_id, sectionIds);
  }
  const metadataByRepositoryId = await loadLatestSnapshotMetadata(repositories.map((row) => row.id));

  return repositories.map((repository) => ({
    id: repository.id,
    repositoryId: repository.id,
    fullName: repository.full_name,
    htmlUrl: repository.html_url,
    repositoryStatus: "accepted",
    source: "accepted",
    query: null,
    suggestedSections: sectionsByRepository.get(repository.id) || [],
    matchedTopics: [],
    discoveredAt: repository.accepted_at || repository.created_at,
    metadata: metadataByRepositoryId.get(repository.id) || {},
  }));
}

function boundedInteger(
  value: string | null,
  fallback: number,
  minValue: number,
  maxValue: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, minValue), maxValue);
}

function normalizedParam(value: string | null) {
  const trimmed = value?.trim() || "";
  return trimmed && trimmed !== "all" ? trimmed : null;
}

function normalizeSort(value: string | null) {
  const allowed = new Set([
    "discovered_desc",
    "stars_desc",
    "forks_desc",
    "pushed_desc",
    "name_asc",
  ]);
  return value && allowed.has(value) ? value : "discovered_desc";
}

function normalizeStatus(value: string | null) {
  return value === "accepted" ? "accepted" : "pending";
}

function filterCandidates(
  candidates: CandidatePayload[],
  sectionFilter: string | null,
  searchQuery: string | null,
) {
  const normalizedSearch = searchQuery?.toLowerCase() || null;
  return candidates.filter((candidate) => {
    if (sectionFilter && !candidate.suggestedSections.includes(sectionFilter)) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }

    const searchableText = [
      candidate.fullName,
      candidate.metadata.description,
      ...(candidate.metadata.topics || []),
      ...candidate.matchedTopics,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchableText.includes(normalizedSearch);
  });
}

function sortCandidates(candidates: CandidatePayload[], sort: string) {
  const sorted = [...candidates];
  sorted.sort((left, right) => {
    if (sort === "stars_desc") {
      return numericValue(right.metadata.stars) - numericValue(left.metadata.stars);
    }
    if (sort === "forks_desc") {
      return numericValue(right.metadata.forks) - numericValue(left.metadata.forks);
    }
    if (sort === "pushed_desc") {
      return dateValue(right.metadata.pushed_at) - dateValue(left.metadata.pushed_at);
    }
    if (sort === "name_asc") {
      return left.fullName.localeCompare(right.fullName);
    }

    return dateValue(right.discoveredAt) - dateValue(left.discoveredAt);
  });
  return sorted;
}

function numericValue(value: unknown) {
  return typeof value === "number" ? value : -1;
}

function dateValue(value: unknown) {
  if (typeof value !== "string") {
    return 0;
  }

  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

async function loadDiscoveryMetadata(repositoryIds: number[]) {
  const metadataByRepositoryId = new Map<number, CurationEventRow["metadata"]>();
  if (repositoryIds.length === 0) {
    return metadataByRepositoryId;
  }

  const rows = await supabaseRequest<CurationEventRow[]>(
    restPath("curation_events", {
      select: "repository_id,metadata,created_at",
      action: "eq.discovered",
      repository_id: `in.(${repositoryIds.join(",")})`,
      order: "created_at.desc",
      limit: "10000",
    }),
  );

  for (const row of rows) {
    if (!metadataByRepositoryId.has(row.repository_id)) {
      metadataByRepositoryId.set(row.repository_id, row.metadata || {});
    }
  }

  return metadataByRepositoryId;
}

async function loadLatestSnapshotMetadata(repositoryIds: number[]) {
  const metadataByRepositoryId = new Map<number, CurationEventRow["metadata"]>();
  if (repositoryIds.length === 0) {
    return metadataByRepositoryId;
  }

  const rows = await supabaseRequest<LatestSnapshotRow[]>(
    restPath("latest_repository_snapshots", {
      select: "repository_id,description,stars,forks,topics,pushed_at",
      repository_id: `in.(${repositoryIds.join(",")})`,
      limit: "10000",
    }),
  );
  for (const row of rows) {
    metadataByRepositoryId.set(row.repository_id, {
      description: row.description,
      stars: row.stars ?? undefined,
      forks: row.forks ?? undefined,
      topics: row.topics || [],
      pushed_at: row.pushed_at,
    });
  }
  return metadataByRepositoryId;
}
