import {
  RepositoryStatusRow,
  requireCurationToken,
  restPath,
  supabaseRequest,
} from "../../../lib/supabase";

type RejectBody = {
  repositoryId?: unknown;
  reason?: unknown;
};

export async function POST(request: Request) {
  const unauthorized = requireCurationToken(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as RejectBody;
    const repositoryId = Number(body.repositoryId);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!Number.isInteger(repositoryId) || repositoryId <= 0) {
      return Response.json({ error: "repositoryId is required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const repository = await loadRepository(repositoryId);
    if (!repository) {
      return Response.json({ error: "Repository not found." }, { status: 404 });
    }

    await supabaseRequest(
      restPath("repositories", {
        id: `eq.${repositoryId}`,
      }),
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: "rejected",
          rejected_at: now,
          rejection_reason: reason || null,
        }),
      },
    );

    await supabaseRequest(
      restPath("discovery_candidates", {
        repository_id: `eq.${repositoryId}`,
      }),
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: "rejected",
          decided_at: now,
          decision_reason: reason || null,
        }),
      },
    );

    await supabaseRequest(
      restPath("repository_sections", {
        repository_id: `eq.${repositoryId}`,
      }),
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: "rejected",
          rejected_at: now,
          rejection_reason: reason || null,
        }),
      },
    );

    await supabaseRequest("/rest/v1/curation_events", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        {
          repository_id: repositoryId,
          action: "rejected",
          previous_repository_status: repository.status,
          next_repository_status: "rejected",
          sections: [],
          reason: reason || null,
          metadata: { source: "curation_ui" },
          created_at: now,
        },
      ]),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to reject repository." },
      { status: 500 },
    );
  }
}

async function loadRepository(repositoryId: number) {
  const rows = await supabaseRequest<RepositoryStatusRow[]>(
    restPath("repositories", {
      select: "id,status",
      id: `eq.${repositoryId}`,
      limit: "1",
    }),
  );
  return rows[0] || null;
}
