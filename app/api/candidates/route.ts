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

export async function GET(request: Request) {
  const unauthorized = requireCurationToken(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const [candidateRows, sections] = await Promise.all([
      supabaseRequest<PendingCandidateRow[]>(
        restPath("discovery_candidates", {
          select:
            "id,repository_id,status,source,query,suggested_sections,matched_topics,discovered_at,repositories(id,full_name,owner,name,html_url,status)",
          status: "eq.pending",
          order: "discovered_at.desc",
          limit: "100",
        }),
      ),
      supabaseRequest<SupabaseSection[]>(
        restPath("sections", {
          select: "id,name,topics,sort_order",
          order: "sort_order.asc,id.asc",
          limit: "10000",
        }),
      ),
    ]);

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

    return Response.json({ candidates, sections });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load candidates." },
      { status: 500 },
    );
  }
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
