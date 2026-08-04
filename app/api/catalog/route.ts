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

type RadarInput = {
  stars: number;
  stars1d: number | null;
  stars3d: number | null;
  stars7d: number | null;
  stars30d: number | null;
  stars60d: number | null;
  historyDays: number;
};

const RADAR_WINDOWS = [1, 3, 7, 30, 60] as const;
type RadarWindow = typeof RADAR_WINDOWS[number];
const RADAR_VELOCITY_WEIGHTS: Record<RadarWindow, number> = {
  1: 0.05,
  3: 0.2,
  7: 0.3,
  30: 0.2,
  60: 0.1,
} as const;
const RADAR_RELATIVE_GROWTH_WEIGHT = 0.1;
const RADAR_ADOPTION_WEIGHT = 0.05;
const RADAR_FULL_CONFIDENCE_DAYS = 14;

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
    const catalog = applyRadarScores(repositories.map((repository) =>
      buildCatalogRepository(repository, snapshotsByRepository.get(repository.id) || []),
    ));
    catalog.sort((left, right) => right.radarScore - left.radarScore || right.stars - left.stars);

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
  const stars1d = delta(rows, "stars", 1);
  const stars3d = delta(rows, "stars", 3);
  const stars7d = delta(rows, "stars", 7);
  const stars30d = delta(rows, "stars", 30);
  const stars60d = delta(rows, "stars", 60);
  const forks7d = delta(rows, "forks", 7);
  const forks30d = delta(rows, "forks", 30);
  const forks60d = delta(rows, "forks", 60);
  const score = Math.round(
    (stars + forks * 2 + (stars7d || 0) * 24 + (stars30d || 0) * 12 + (stars60d || 0) * 4 +
      (forks7d || 0) * 16 + (forks30d || 0) * 8) * 100,
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
    stars1d,
    stars3d,
    stars7d,
    stars30d,
    stars60d,
    forks7d,
    forks30d,
    forks60d,
    score,
    historyDays: snapshotHistoryDays(rows),
    license: normalizeLicense(latest?.license, latest?.license_name),
    language: latest?.language || null,
    pushedAt: latest?.pushed_at || null,
    latestReleaseTag: latest?.latest_release_tag || null,
    latestReleasePublishedAt: latest?.latest_release_published_at || null,
  };
}

function delta(rows: SnapshotRow[], field: "stars" | "forks", days: number): number | null {
  const latest = rows.at(-1);
  if (!latest || latest[field] === null) {
    return null;
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
    ? null
    : (latest[field] || 0) - baseline[field];
}

function snapshotHistoryDays(rows: SnapshotRow[]) {
  const first = rows[0];
  const latest = rows.at(-1);
  if (!first || !latest) return 0;
  const firstDate = new Date(`${first.snapshot_date}T00:00:00Z`);
  const latestDate = new Date(`${latest.snapshot_date}T00:00:00Z`);
  return Math.max(0, Math.round((latestDate.getTime() - firstDate.getTime()) / 86_400_000));
}

function applyRadarScores<T extends RadarInput>(repositories: T[]) {
  const adoptionScores = percentileRanks(repositories.map((repository) => Math.log1p(repository.stars)));
  const velocityScores = Object.fromEntries(
    RADAR_WINDOWS.map((days) => {
      return [
        days,
        percentileRanks(repositories.map((repository) => dailyVelocity(repository[`stars${days}d` as keyof T], days))),
      ];
    }),
  ) as Record<RadarWindow, Array<number | null>>;
  const relativeScores = percentileRanks(repositories.map(relativeGrowth));

  return repositories.map((repository, index) => {
    const adoptionScore = adoptionScores[index] || 0;
    const velocityComponents: Array<{ weight: number; score: number }> = [];
    for (const days of RADAR_WINDOWS) {
      const score = velocityScores[days][index];
      if (score !== null) {
        velocityComponents.push({ weight: RADAR_VELOCITY_WEIGHTS[days], score });
      }
    }
    const confidence = Math.min(1, repository.historyDays / RADAR_FULL_CONFIDENCE_DAYS);

    if (velocityComponents.length === 0 || repository.historyDays < 3) {
      return { ...repository, radarScore: Math.round(adoptionScore * 100) / 100, radarConfidence: Math.round(confidence * 100) / 100 };
    }

    const totalWeight = velocityComponents.reduce((total, component) => total + component.weight, 0);
    const velocityScore = velocityComponents.reduce(
      (total, component) => total + component.weight * component.score,
      0,
    ) / totalWeight;
    const relativeScore = relativeScores[index] ?? adoptionScore;
    const momentumScore =
      (1 - RADAR_RELATIVE_GROWTH_WEIGHT - RADAR_ADOPTION_WEIGHT) * velocityScore +
      RADAR_RELATIVE_GROWTH_WEIGHT * relativeScore +
      RADAR_ADOPTION_WEIGHT * adoptionScore;
    const radarScore = confidence * momentumScore + (1 - confidence) * adoptionScore;

    return {
      ...repository,
      radarScore: Math.round(radarScore * 100) / 100,
      radarConfidence: Math.round(confidence * 100) / 100,
    };
  });
}

function dailyVelocity(value: unknown, days: number) {
  return typeof value === "number" ? value / days : null;
}

function relativeGrowth(repository: RadarInput) {
  for (const days of [7, 3, 1, 30, 60] as const) {
    const delta = repository[`stars${days}d`];
    if (delta === null) continue;
    return delta / Math.max(repository.stars - delta, 1000);
  }
  return null;
}

function percentileRanks(values: Array<number | null>) {
  const ranked = values
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== null)
    .sort((left, right) => left.value - right.value);
  const scores: Array<number | null> = Array(values.length).fill(null);
  if (ranked.length === 1) {
    scores[ranked[0].index] = 50;
    return scores;
  }

  for (let start = 0; start < ranked.length;) {
    let end = start;
    while (end + 1 < ranked.length && ranked[end + 1].value === ranked[start].value) end += 1;
    const percentile = 100 * ((start + end) / 2) / (ranked.length - 1);
    for (let index = start; index <= end; index += 1) scores[ranked[index].index] = percentile;
    start = end + 1;
  }

  return scores;
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
