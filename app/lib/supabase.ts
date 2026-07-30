type SupabaseConfig = {
  projectUrl: string;
  apiKey: string;
};

export type SupabaseRepository = {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  html_url: string | null;
  status: "pending" | "accepted" | "rejected";
};

export type SupabaseSection = {
  id: string;
  name: string;
  topics: string[];
  sort_order: number;
};

export type SupabaseRepositorySection = {
  repository_id: number;
  section_id: string;
  status: "suggested" | "accepted" | "rejected";
};

export type CurationEventMetadata = {
  stars?: number;
  forks?: number;
  topics?: string[];
  description?: string | null;
  pushed_at?: string | null;
  queries?: string[];
};

export type PendingCandidateRow = {
  id: number;
  repository_id: number;
  status: "pending" | "accepted" | "rejected" | "stale";
  source: string;
  query: string | null;
  suggested_sections: string[];
  matched_topics: string[];
  discovered_at: string;
  repositories: SupabaseRepository | SupabaseRepository[] | null;
};

export type CurationEventRow = {
  repository_id: number;
  metadata: CurationEventMetadata;
  created_at: string;
};

export type RepositoryStatusRow = {
  id: number;
  status: "pending" | "accepted" | "rejected";
};

export function requireCurationToken(request: Request): Response | null {
  const expected = process.env.CURATION_ADMIN_TOKEN;
  if (!expected) {
    return null;
  }

  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
  const headerToken = request.headers.get("x-curation-token") || "";
  const token = headerToken || bearerToken;

  if (token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const result = await supabaseRequestWithHeaders<T>(path, init);
  return result.data;
}

export async function supabaseRequestWithHeaders<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; headers: Headers }> {
  const config = readSupabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", config.apiKey);
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${config.projectUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase request failed: HTTP ${response.status} ${text}`);
  }

  return {
    data: (text ? JSON.parse(text) : null) as T,
    headers: response.headers,
  };
}

export function restPath(table: string, params: Record<string, string>): string {
  return `/rest/v1/${table}?${new URLSearchParams(params).toString()}`;
}

export function normalizeRepository(
  repository: SupabaseRepository | SupabaseRepository[] | null,
): SupabaseRepository | null {
  if (Array.isArray(repository)) {
    return repository[0] || null;
  }
  return repository;
}

function readSupabaseConfig(): SupabaseConfig {
  const projectUrl = process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_URL;
  const apiKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY;

  if (!projectUrl) {
    throw new Error("SUPABASE_PROJECT_URL is required.");
  }
  if (!apiKey) {
    throw new Error("SUPABASE_SECRET_KEY is required.");
  }

  return {
    projectUrl: projectUrl.replace(/\/$/, ""),
    apiKey,
  };
}
