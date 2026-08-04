import {
  RepositoryStatusRow,
  SupabaseRepositorySection,
  requireCurationToken,
  restPath,
  supabaseRequest,
} from "../../../lib/supabase";

type UpdateSectionsBody = {
  repositoryId?: unknown;
  sections?: unknown;
};

export async function POST(request: Request) {
  const unauthorized = requireCurationToken(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as UpdateSectionsBody;
    const repositoryId = Number(body.repositoryId);
    const sections = normalizeSections(body.sections);

    if (!Number.isInteger(repositoryId) || repositoryId <= 0) {
      return Response.json({ error: "repositoryId is required." }, { status: 400 });
    }
    if (sections.length === 0) {
      return Response.json(
        { error: "Accepted repositories must have at least one section." },
        { status: 400 },
      );
    }

    const repository = await loadRepository(repositoryId);
    if (!repository) {
      return Response.json({ error: "Repository not found." }, { status: 404 });
    }
    if (repository.status !== "accepted") {
      return Response.json(
        { error: "Only accepted repositories can have their sections updated." },
        { status: 409 },
      );
    }

    await validateSections(sections);
    const now = new Date().toISOString();
    await upsertAcceptedSections(repositoryId, sections, now);
    await rejectUnselectedSections(repositoryId, sections, now);
    await insertSectionUpdateEvent(repositoryId, sections, now);

    return Response.json({ ok: true, sections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update sections.";
    return Response.json(
      { error: message },
      { status: message.startsWith("Unknown sections") ? 400 : 500 },
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

async function validateSections(sectionIds: string[]) {
  const rows = await supabaseRequest<Array<{ id: string }>>(
    restPath("sections", {
      select: "id",
      id: `in.(${sectionIds.join(",")})`,
      limit: "10000",
    }),
  );
  const knownIds = new Set(rows.map((row) => row.id));
  const unknownIds = sectionIds.filter((sectionId) => !knownIds.has(sectionId));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown sections: ${unknownIds.join(", ")}.`);
  }
}

async function upsertAcceptedSections(repositoryId: number, sections: string[], now: string) {
  await supabaseRequest(
    restPath("repository_sections", {
      on_conflict: "repository_id,section_id",
    }),
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(
        sections.map((sectionId) => ({
          repository_id: repositoryId,
          section_id: sectionId,
          status: "accepted",
          accepted_at: now,
          rejected_at: null,
          rejection_reason: null,
        })),
      ),
    },
  );
}

async function rejectUnselectedSections(
  repositoryId: number,
  acceptedSections: string[],
  now: string,
) {
  const existingRows = await supabaseRequest<SupabaseRepositorySection[]>(
    restPath("repository_sections", {
      select: "repository_id,section_id,status",
      repository_id: `eq.${repositoryId}`,
      limit: "10000",
    }),
  );
  const accepted = new Set(acceptedSections);
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
            rejection_reason: "Removed during section update.",
          }),
        },
      ),
    ),
  );
}

async function insertSectionUpdateEvent(repositoryId: number, sections: string[], now: string) {
  await supabaseRequest("/rest/v1/curation_events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        repository_id: repositoryId,
        action: "metadata_updated",
        previous_repository_status: "accepted",
        next_repository_status: "accepted",
        sections,
        metadata: { source: "curation_ui", update: "sections" },
        created_at: now,
      },
    ]),
  });
}

function normalizeSections(value: unknown) {
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
