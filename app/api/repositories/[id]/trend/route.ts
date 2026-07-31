import { restPath, supabaseRequest } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

type RepositoryRow = {
  id: number;
  status: "pending" | "accepted" | "rejected";
};

type TrendSnapshotRow = {
  snapshot_date: string;
  stars: number | null;
  forks: number | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const repositoryId = Number(id);
    if (!Number.isInteger(repositoryId) || repositoryId <= 0) {
      return Response.json({ error: "Invalid repository id." }, { status: 400 });
    }

    const repositories = await supabaseRequest<RepositoryRow[]>(
      restPath("repositories", {
        select: "id,status",
        id: `eq.${repositoryId}`,
        status: "eq.accepted",
        limit: "1",
      }),
    );
    if (!repositories[0]) {
      return Response.json({ error: "Accepted repository not found." }, { status: 404 });
    }

    const snapshots = await supabaseRequest<TrendSnapshotRow[]>(
      restPath("repository_snapshots", {
        select: "snapshot_date,stars,forks",
        repository_id: `eq.${repositoryId}`,
        order: "snapshot_date.desc",
        limit: "30",
      }),
    );
    snapshots.reverse();

    const points = snapshots.map((snapshot) => ({
      date: snapshot.snapshot_date,
      stars: snapshot.stars,
      forks: snapshot.forks,
    }));

    return Response.json({ repositoryId, points });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load repository trend." },
      { status: 500 },
    );
  }
}
