import {
  RepositoryStatusRow,
  SupabaseRepositorySection,
  requireCurationToken,
  restPath,
  supabaseRequest,
} from "../../../lib/supabase";

type AcceptBody = {
  repositoryId?: unknown;
  sections?: unknown;
};

export async function POST(request: Request) {
  const unauthorized = requireCurationToken(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as AcceptBody;
    const repositoryId = Number(body.repositoryId);
    const sections = normalizeSections(body.sections);

    if (!Number.isInteger(repositoryId) || repositoryId <= 0) {
      return Response.json({ error: "repositoryId is required." }, { status: 400 });
    }
    if (sections.length === 0) {
      return Response.json({ error: "At least one section is required." }, { status: 400 });
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
          status: "accepted",
          accepted_at: now,
          rejected_at: null,
          rejection_reason: null,
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
          status: "accepted",
          decided_at: now,
          decision_reason: null,
        }),
      },
    );

    await upsertAcceptedSections(repositoryId, sections, now);
    await rejectUnselectedSections(repositoryId, sections, now);

    await supabaseRequest("/rest/v1/curation_events", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        {
          repository_id: repositoryId,
          action: "accepted",
          previous_repository_status: repository.status,
          next_repository_status: "accepted",
          sections,
          metadata: { source: "curation_ui" },
          created_at: now,
        },
      ]),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to accept repository." },
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

async function upsertAcceptedSections(repositoryId: number, sections: string[], now: string) {
  const rows = sections.map((sectionId) => ({
    repository_id: repositoryId,
    section_id: sectionId,
    status: "accepted",
    accepted_at: now,
    rejected_at: null,
    rejection_reason: null,
  }));

  await supabaseRequest(
    restPath("repository_sections", {
      on_conflict: "repository_id,section_id",
    }),
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows),
    },
  );
}

async function rejectUnselectedSections(
  repositoryId: number,
  acceptedSections: string[],
  now: string,
) {
  const accepted = new Set(acceptedSections);
  const existingRows = await supabaseRequest<SupabaseRepositorySection[]>(
    restPath("repository_sections", {
      select: "repository_id,section_id,status",
      repository_id: `eq.${repositoryId}`,
      limit: "10000",
    }),
  );

  const unselectedRows = existingRows.filter((row) => !accepted.has(row.section_id));
  await Promise.all(
    unselectedRows.map((row) =>
      supabaseRequest(
        restPath("repository_sections", {
          repository_id: `eq.${repositoryId}`,
          section_id: `eq.${row.section_id}`,
        }),
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            status: "rejected",
            rejected_at: now,
            rejection_reason: "Not selected during acceptance.",
          }),
        },
      ),
    ),
  );
}

function normalizeSections(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((section) => (typeof section === "string" ? section.trim() : ""))
        .filter(Boolean),
    ),
  );
}
