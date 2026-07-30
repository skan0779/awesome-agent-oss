import {
  CurationEventRow,
  PendingCandidateRow,
  SupabaseSection,
  normalizeRepository,
  requireCurationToken,
  restPath,
  supabaseRequest,
  supabaseRequestWithHeaders,
} from "../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireCurationToken(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const url = new URL(request.url);
    const page = boundedInteger(url.searchParams.get("page"), 1, 1, 100000);
    const perPage = boundedInteger(url.searchParams.get("perPage"), 10, 1, 50);
    const offset = (page - 1) * perPage;
    const rangeEnd = offset + perPage - 1;

    const [candidateResult, sections] = await Promise.all([
      supabaseRequestWithHeaders<PendingCandidateRow[]>(
        restPath("discovery_candidates", {
          select:
            "id,repository_id,status,source,query,suggested_sections,matched_topics,discovered_at,repositories(id,full_name,owner,name,html_url,status)",
          status: "eq.pending",
          order: "discovered_at.desc",
          limit: String(perPage),
          offset: String(offset),
        }),
        {
          headers: {
            Prefer: "count=exact",
            Range: `${offset}-${rangeEnd}`,
            "Range-Unit": "items",
          },
        },
      ),
      supabaseRequest<SupabaseSection[]>(
        restPath("sections", {
          select: "id,name,topics,sort_order",
          order: "sort_order.asc,id.asc",
          limit: "10000",
        }),
      ),
    ]);

    const candidateRows = candidateResult.data;
    const totalCount = parseContentRangeTotal(candidateResult.headers.get("content-range"));
    const repositoryIds = candidateRows.map((candidate) => candidate.repository_id);
    const metadataByRepositoryId = await loadDiscoveryMetadata(repositoryIds);

    const candidates = candidateRows.flatMap((candidate) => {
      const repository = normalizeRepository(candidate.repositories);
      if (!repository) {
        return [];
      }

      return [
        {
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
        },
      ];
    });

    return Response.json({
      candidates,
      sections,
      pagination: {
        page,
        perPage,
        totalCount,
        totalPages: totalCount === 0 ? 1 : Math.ceil(totalCount / perPage),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load candidates." },
      { status: 500 },
    );
  }
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

function parseContentRangeTotal(contentRange: string | null) {
  if (!contentRange) {
    return 0;
  }

  const total = contentRange.split("/").at(-1);
  if (!total || total === "*") {
    return 0;
  }

  const parsed = Number(total);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
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
