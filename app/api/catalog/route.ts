import { restPath, supabaseRequest } from "../../lib/supabase";

export const dynamic = "force-dynamic";

type AcceptedRepositoryRow = {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  sections: string[];
};

type SnapshotRow = {
  repository_id: number;
  snapshot_date: string;
  html_url: string | null;
  description: string | null;
  topics: string[];
  stars: number | null;
  forks: number | null;
  open_issues: number | null;
  license: string | null;
  license_name: string | null;
  language: string | null;
  pushed_at: string | null;
  latest_release_tag: string | null;
  latest_release_published_at: string | null;
};

type SectionRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
};

const SNAPSHOT_COLUMNS = [
  "repository_id",
  "snapshot_date",
  "html_url",
  "description",
  "topics",
  "stars",
  "forks",
  "open_issues",
  "license",
  "license_name",
  "language",
  "pushed_at",
  "latest_release_tag",
  "latest_release_published_at",
].join(",");

export async function GET() {
  try {
    const [repositories, sections, latestRows] = await Promise.all([
      supabaseRequest<AcceptedRepositoryRow[]>(
        restPath("accepted_repositories", {
          select: "id,full_name,owner,name,sections",
          order: "full_name.asc",
          limit: "10000",
        }),
      ),
      supabaseRequest<SectionRow[]>(
        restPath("sections", {
          select: "id,name,description,sort_order",
          order: "sort_order.asc,id.asc",
          limit: "10000",
        }),
      ),
      supabaseRequest<Pick<SnapshotRow, "snapshot_date">[]>(
        restPath("repository_snapshots", {
          select: "snapshot_date",
          order: "snapshot_date.desc",
          limit: "1",
        }),
      ),
    ]);

    const snapshotDate = latestRows[0]?.snapshot_date || null;
    const snapshots = snapshotDate
      ? await loadSnapshots(repositories, subtractDays(snapshotDate, 75))
      : [];
    const snapshotsByRepository = groupSnapshots(snapshots);
    const catalog = repositories.map((repository) =>
      buildCatalogRepository(repository, snapshotsByRepository.get(repository.id) || []),
    );
    catalog.sort((left, right) => right.score - left.score || right.stars - left.stars);

    return Response.json({
      repositories: catalog,
      sections,
      snapshotDate,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load catalog." },
      { status: 500 },
    );
  }
}

async function loadSnapshots(repositories: AcceptedRepositoryRow[], cutoff: string) {
  const chunks = chunk(repositories.map((repository) => repository.id), 50);
  const rows = await Promise.all(
    chunks.map((ids) =>
      supabaseRequest<SnapshotRow[]>(
        restPath("repository_snapshots", {
          select: SNAPSHOT_COLUMNS,
          repository_id: `in.(${ids.join(",")})`,
          snapshot_date: `gte.${cutoff}`,
          order: "snapshot_date.asc,repository_id.asc",
          limit: "10000",
        }),
      ),
    ),
  );
  return rows.flat();
}

function groupSnapshots(rows: SnapshotRow[]) {
  const grouped = new Map<number, SnapshotRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.repository_id) || [];
    current.push(row);
    grouped.set(row.repository_id, current);
  }
  return grouped;
}

function buildCatalogRepository(repository: AcceptedRepositoryRow, rows: SnapshotRow[]) {
  const latest = rows.at(-1);
  const stars = latest?.stars || 0;
  const forks = latest?.forks || 0;
  const stars7d = delta(rows, "stars", 7);
  const stars30d = delta(rows, "stars", 30);
  const stars60d = delta(rows, "stars", 60);
  const forks7d = delta(rows, "forks", 7);
  const forks30d = delta(rows, "forks", 30);
  const forks60d = delta(rows, "forks", 60);
  const score = Math.round(
    (stars + forks * 2 + stars7d * 24 + stars30d * 12 + stars60d * 4 +
      forks7d * 16 + forks30d * 8) * 100,
  ) / 100;

  return {
    id: repository.id,
    fullName: repository.full_name,
    owner: repository.owner,
    name: repository.name,
    sections: repository.sections,
    htmlUrl: latest?.html_url || `https://github.com/${repository.full_name}`,
    description: latest?.description || null,
    topics: latest?.topics || [],
    stars,
    forks,
    openIssues: latest?.open_issues || 0,
    stars7d,
    stars30d,
    stars60d,
    forks7d,
    forks30d,
    forks60d,
    score,
    license: normalizeLicense(latest?.license, latest?.license_name),
    language: latest?.language || null,
    pushedAt: latest?.pushed_at || null,
    latestReleaseTag: latest?.latest_release_tag || null,
    latestReleasePublishedAt: latest?.latest_release_published_at || null,
  };
}

function delta(rows: SnapshotRow[], field: "stars" | "forks", days: number) {
  const latest = rows.at(-1);
  if (!latest || latest[field] === null) {
    return 0;
  }
  const target = new Date(`${latest.snapshot_date}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() - days);
  let baseline: SnapshotRow | undefined;
  for (const row of rows) {
    if (new Date(`${row.snapshot_date}T00:00:00Z`) <= target) {
      baseline = row;
    } else {
      break;
    }
  }
  return baseline?.[field] === null || baseline?.[field] === undefined
    ? 0
    : Math.max(0, (latest[field] || 0) - baseline[field]);
}

function normalizeLicense(license: string | null | undefined, name: string | null | undefined) {
  if (!license) {
    return "-";
  }
  if (license === "NOASSERTION") {
    return "Other";
  }
  return license || name || "-";
}

function subtractDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
