"use client";

import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Flame,
  GitFork,
  LayoutGrid,
  LoaderCircle,
  Radar,
  Search,
  Star,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CatalogSection = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
};

type CatalogRepository = {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  sections: string[];
  htmlUrl: string;
  description: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  stars1d: number | null;
  stars3d: number | null;
  stars7d: number | null;
  stars30d: number | null;
  stars60d: number | null;
  forks7d: number | null;
  forks30d: number | null;
  forks60d: number | null;
  score: number;
  radarScore: number;
  license: string;
  language: string | null;
  pushedAt: string | null;
  latestReleaseTag: string | null;
  latestReleasePublishedAt: string | null;
};

type CatalogResponse = {
  repositories: CatalogRepository[];
  sections: CatalogSection[];
  snapshotDate: string | null;
  error?: string;
};

type TrendMode = "stars" | "forks";
type TrendingPeriod = 1 | 7 | 30;

type TrendPoint = {
  date: string;
  stars: number | null;
  forks: number | null;
};

type TrendResponse = {
  points: TrendPoint[];
  error?: string;
};

const PAGE_SIZE = 12;
const TRENDING_LIMIT = 6;
const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "awesome-agent-oss",
  url: "https://awesomeagent.vercel.app",
  description:
    "A curated open-source radar for discovering AI agent stacks and tracking repository growth.",
  inLanguage: "en",
  publisher: {
    "@type": "Person",
    name: "skan0779",
    url: "https://github.com/skan0779",
  },
};

export default function CatalogPage() {
  const [repositories, setRepositories] = useState<CatalogRepository[]>([]);
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("radar");
  const [trendingPeriod, setTrendingPeriod] = useState<TrendingPeriod>(7);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const response = await fetch("/api/catalog");
        const payload = (await response.json()) as CatalogResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load the catalog.");
        }
        setRepositories(payload.repositories);
        setSections(payload.sections);
        setSnapshotDate(payload.snapshotDate);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load the catalog.");
      } finally {
        setLoading(false);
      }
    }
    void loadCatalog();
  }, []);

  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );

  const filteredRepositories = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = repositories.filter((repository) => {
      if (activeSection !== "all" && !repository.sections.includes(activeSection)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        repository.fullName,
        repository.description,
        repository.language,
        ...repository.topics,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    return filtered.sort((left, right) => {
      if (sort === "stars") return right.stars - left.stars;
      if (sort === "growth1") return compareGrowth(left, right, 1);
      if (sort === "growth3") return compareGrowth(left, right, 3);
      if (sort === "growth7") return compareGrowth(left, right, 7);
      if (sort === "growth30") return compareGrowth(left, right, 30);
      if (sort === "growth60") return compareGrowth(left, right, 60);
      if (sort === "updated") return dateValue(right.pushedAt) - dateValue(left.pushedAt);
      if (sort === "name") return left.fullName.localeCompare(right.fullName);
      return right.radarScore - left.radarScore || right.stars - left.stars;
    });
  }, [activeSection, repositories, search, sort]);

  const trendingRepositories = useMemo(() => {
    return repositories
      .filter((repository) => growthValue(repository, trendingPeriod) !== null)
      .sort((left, right) => compareGrowth(left, right, trendingPeriod))
      .slice(0, TRENDING_LIMIT);
  }, [repositories, trendingPeriod]);

  const totalPages = Math.max(1, Math.ceil(filteredRepositories.length / PAGE_SIZE));
  const normalizedPage = Math.min(page, totalPages);
  const visibleRepositories = filteredRepositories.slice(
    (normalizedPage - 1) * PAGE_SIZE,
    normalizedPage * PAGE_SIZE,
  );

  function selectSection(section: string) {
    setActiveSection(section);
    setPage(1);
  }

  function openFullTrendingRanking() {
    setActiveSection("all");
    setSearch("");
    setSort(`growth${trendingPeriod}`);
    setPage(1);
    document.getElementById("catalog-heading")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="catalogPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <header className="siteHeader">
        <a className="brand" href="/" aria-label="awesome-agent-oss home">
          <span className="brandMark"><Radar size={19} strokeWidth={2.2} /></span>
          <span>awesome-agent-oss</span>
        </a>
        <nav className="siteNav" aria-label="Primary navigation">
          <a className="navLink" href="#trending">Trending</a>
          <a className="navLink active" href="#catalog-heading">Explore</a>
          <a className="navLink" href="/admin">Admin</a>
          <a
            className="iconLink"
            href="https://github.com/skan0779/awesome-agent-oss"
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
          >
            <img
              className="githubMark"
              src="https://github.githubassets.com/favicons/favicon.svg"
              alt=""
              width="20"
              height="20"
            />
          </a>
        </nav>
      </header>

      <main className="catalogShell">
        <section className="catalogIntro">
          <div className="introCopy">
            <p className="kicker"><TrendingUp size={14} /> Open-source agent radar</p>
            <h1>
              Find the <span>open-source stacks</span> you need to build AI agents.
            </h1>
          </div>
          <div className="catalogStats" aria-label="Catalog summary">
            <SummaryStat value={formatNumber(repositories.length)} label="repositories" />
            <SummaryStat value={formatNumber(sections.length)} label="sections" />
            <SummaryStat value={formatSnapshot(snapshotDate)} label="snapshot" compact />
          </div>
        </section>

        <section className="trendingSection" id="trending" aria-labelledby="trending-heading">
          <div className="trendingHeader">
            <div>
              <p className="eyebrow"><Flame size={13} aria-hidden="true" /> Momentum</p>
              <h2 id="trending-heading">Trending repositories</h2>
              <p>Open-source agent stacks gaining the most stars right now.</p>
            </div>
            <div className="periodControl" aria-label="Trending period">
              {([1, 7, 30] as TrendingPeriod[]).map((period) => (
                <button
                  className={trendingPeriod === period ? "active" : ""}
                  key={period}
                  type="button"
                  aria-pressed={trendingPeriod === period}
                  onClick={() => setTrendingPeriod(period)}
                >
                  {period === 1 ? "Today" : `${period} days`}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="trendingList" aria-label="Loading trending repositories">
              {Array.from({ length: TRENDING_LIMIT }, (_, index) => (
                <div className="trendingRow trendingSkeleton" key={index} />
              ))}
            </div>
          ) : error ? (
            <div className="trendingEmpty error">Trending data is temporarily unavailable.</div>
          ) : trendingRepositories.length === 0 ? (
            <div className="trendingEmpty">Not enough snapshot history for this period yet.</div>
          ) : (
            <div className="trendingList">
              {trendingRepositories.map((repository, index) => (
                <TrendingRepositoryRow
                  key={repository.id}
                  repository={repository}
                  rank={index + 1}
                  period={trendingPeriod}
                  sectionById={sectionById}
                />
              ))}
            </div>
          )}

          <button
            className="fullRankingButton"
            type="button"
            disabled={loading || Boolean(error) || trendingRepositories.length === 0}
            onClick={openFullTrendingRanking}
          >
            View full {trendingPeriod === 1 ? "daily" : `${trendingPeriod}-day`} ranking
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </section>

        <section className="exploreSection" aria-labelledby="catalog-heading">
          <div className="sectionHeading">
            <div>
              <p className="eyebrow">Live catalog</p>
              <h2 id="catalog-heading">Explore repositories</h2>
            </div>
            <span className="resultCount">{filteredRepositories.length} results</span>
          </div>

          <div className="sectionTabs" role="tablist" aria-label="Repository sections">
            <button
              className={activeSection === "all" ? "sectionTab active" : "sectionTab"}
              type="button"
              role="tab"
              aria-selected={activeSection === "all"}
              onClick={() => selectSection("all")}
            >
              All
            </button>
            {sections.map((section) => (
              <button
                className={activeSection === section.id ? "sectionTab active" : "sectionTab"}
                key={section.id}
                type="button"
                role="tab"
                aria-selected={activeSection === section.id}
                onClick={() => selectSection(section.id)}
              >
                {section.name}
              </button>
            ))}
          </div>

          <label className="catalogSectionSelect">
            <LayoutGrid size={18} aria-hidden="true" />
            <span className="srOnly">Repository section</span>
            <select
              aria-label="Repository section"
              value={activeSection}
              onChange={(event) => selectSection(event.target.value)}
            >
              <option value="all">All sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>

          <div className="catalogControls">
            <label className="searchControl">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search repositories, topics, language..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="sortControl">
              <span>Sort by</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                }}
              >
                <option value="radar">Radar score</option>
                <option value="growth1">1-day growth</option>
                <option value="growth3">3-day growth</option>
                <option value="growth7">7-day growth</option>
                <option value="growth30">30-day growth</option>
                <option value="growth60">60-day growth</option>
                <option value="stars">Most stars</option>
                <option value="updated">Recently updated</option>
                <option value="name">Repository name</option>
              </select>
            </label>
          </div>

          {error ? <div className="statePanel errorState">{error}</div> : null}
          {loading ? (
            <div className="repositoryGrid" aria-label="Loading repositories">
              {Array.from({ length: 6 }, (_, index) => <div className="repoCard skeleton" key={index} />)}
            </div>
          ) : visibleRepositories.length === 0 ? (
            <div className="statePanel">
              <BookOpen size={22} />
              <strong>No repositories found</strong>
              <span>Try another section or search term.</span>
            </div>
          ) : (
            <div className="repositoryGrid">
              {visibleRepositories.map((repository, index) => (
                <RepositoryCard
                  key={repository.id}
                  repository={repository}
                  rank={(normalizedPage - 1) * PAGE_SIZE + index + 1}
                  sectionById={sectionById}
                />
              ))}
            </div>
          )}

          {!loading && totalPages > 1 ? (
            <nav className="catalogPagination" aria-label="Catalog pagination">
              <button disabled={normalizedPage === 1} onClick={() => setPage(normalizedPage - 1)}>
                Previous
              </button>
              <span>{normalizedPage} / {totalPages}</span>
              <button disabled={normalizedPage === totalPages} onClick={() => setPage(normalizedPage + 1)}>
                Next
              </button>
            </nav>
          ) : null}
        </section>
      </main>

      <footer className="siteFooter">
        <span>Open-source intelligence for agent builders.</span>
        <span>Updated daily from GitHub.</span>
      </footer>
    </div>
  );
}

function RepositoryCard({
  repository,
  rank,
  sectionById,
}: {
  repository: CatalogRepository;
  rank: number;
  sectionById: Map<string, CatalogSection>;
}) {
  const [trendMode, setTrendMode] = useState<TrendMode | null>(null);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[] | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  async function toggleTrend(mode: TrendMode) {
    if (trendMode === mode) {
      setTrendMode(null);
      return;
    }
    setTrendMode(mode);
    if (trendPoints) {
      return;
    }

    setTrendLoading(true);
    setTrendError(null);
    try {
      const response = await fetch(`/api/repositories/${repository.id}/trend`);
      const payload = (await response.json()) as TrendResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load trend data.");
      }
      setTrendPoints(payload.points);
    } catch (loadError) {
      setTrendError(loadError instanceof Error ? loadError.message : "Failed to load trend data.");
    } finally {
      setTrendLoading(false);
    }
  }

  return (
    <article className="repoCard">
      <div className="repoCardTop">
        <span className="rank">#{rank}</span>
        <div className="repoIdentity">
          <img
            className="ownerAvatar"
            src={`https://github.com/${repository.owner}.png?size=80`}
            alt=""
            width="40"
            height="40"
            loading="lazy"
          />
          <div>
            <span className="ownerName">{repository.owner}</span>
            <a href={repository.htmlUrl} target="_blank" rel="noreferrer">
              {repository.name}<ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>

      <p className="repoDescription">{repository.description || "No description available."}</p>

      <div className="repoSections">
        {repository.sections.map((section) => (
          <span key={section}>{sectionById.get(section)?.name || section}</span>
        ))}
      </div>

      <div className="repoDataBlock">
        <div className="repoMetrics">
          <div><Star size={15} /><strong>{formatNumber(repository.stars)}</strong><span>stars</span></div>
          <div><TrendingUp size={15} /><strong>{formatDelta(repository.stars7d)}</strong><span>7 days</span></div>
          <div><GitFork size={15} /><strong>{formatNumber(repository.forks)}</strong><span>forks</span></div>
        </div>

        <div className="trendControls" aria-label={`${repository.fullName} trend details`}>
          <button
            className={trendMode === "stars" ? "active" : ""}
            type="button"
            aria-expanded={trendMode === "stars"}
            onClick={() => void toggleTrend("stars")}
          >
            <Star size={13} aria-hidden="true" />
            <span>Stars trend</span>
            <TrendingUp size={13} aria-hidden="true" />
          </button>
          <button
            className={trendMode === "forks" ? "active" : ""}
            type="button"
            aria-expanded={trendMode === "forks"}
            onClick={() => void toggleTrend("forks")}
          >
            <GitFork size={13} aria-hidden="true" />
            <span>Forks trend</span>
            <TrendingUp size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {trendMode ? (
        <TrendChart
          mode={trendMode}
          points={trendPoints || []}
          loading={trendLoading}
          error={trendError}
        />
      ) : null}

      <div className="repoFooter">
        <div className="repoMeta">
          {repository.language ? <span><i className="languageDot" />{repository.language}</span> : null}
          <span>{repository.license}</span>
        </div>
        <span className="scoreBadge">Radar {formatNumber(repository.radarScore)}</span>
      </div>
    </article>
  );
}

function TrendingRepositoryRow({
  repository,
  rank,
  period,
  sectionById,
}: {
  repository: CatalogRepository;
  rank: number;
  period: TrendingPeriod;
  sectionById: Map<string, CatalogSection>;
}) {
  const growth = growthValue(repository, period);
  const primarySection = repository.sections[0];

  return (
    <a
      className={rank === 1 ? "trendingRow leading" : "trendingRow"}
      href={repository.htmlUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`${repository.fullName}, ${formatSignedDelta(growth)} stars in ${period} days`}
    >
      <span className="trendingRank">{String(rank).padStart(2, "0")}</span>
      <img
        className="trendingAvatar"
        src={`https://github.com/${repository.owner}.png?size=72`}
        alt=""
        width="36"
        height="36"
        loading="lazy"
      />
      <span className="trendingIdentity">
        <strong>{repository.fullName}</strong>
        <small>{primarySection ? sectionById.get(primarySection)?.name || primarySection : "Uncategorized"}</small>
      </span>
      <span className="trendingTotal">
        <Star size={14} aria-hidden="true" />
        <strong>{formatNumber(repository.stars)}</strong>
        <small>total</small>
      </span>
      <span className="trendingGrowth">
        <TrendingUp size={15} aria-hidden="true" />
        <strong>{formatSignedDelta(growth)}</strong>
        <small>{period === 1 ? "today" : `${period} days`}</small>
      </span>
      <ArrowUpRight className="trendingLinkIcon" size={16} aria-hidden="true" />
    </a>
  );
}

function TrendChart({
  mode,
  points,
  loading,
  error,
}: {
  mode: TrendMode;
  points: TrendPoint[];
  loading: boolean;
  error: string | null;
}) {
  const label = mode === "stars" ? "Stars" : "Forks";
  const values = points
    .map((point) => point[mode])
    .filter((value): value is number => typeof value === "number");
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  const padding = Math.max(1, Math.ceil((maximum - minimum) * 0.15));
  const domain: [number, number] = [Math.max(0, minimum - padding), maximum + padding];

  return (
    <div className="trendPanel">
      <div className="trendHeader">
        <div>
          <strong>{label} over time</strong>
          <span>Recorded from daily snapshots</span>
        </div>
        <span>30 days</span>
      </div>
      {loading ? (
        <div className="trendState"><LoaderCircle className="spin" size={20} /> Loading trend</div>
      ) : error ? (
        <div className="trendState error">{error}</div>
      ) : points.length === 0 ? (
        <div className="trendState">Not enough snapshot data yet.</div>
      ) : (
        <div className="trendChart" role="img" aria-label={`${label} count for the last 30 days`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 6, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#e4e7e2" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                minTickGap={24}
                tick={{ fill: "#7b847f", fontSize: 10 }}
                tickFormatter={formatChartDate}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                domain={domain}
                tickLine={false}
                tick={{ fill: "#7b847f", fontSize: 10 }}
                tickFormatter={(value) => formatNumber(Number(value))}
              />
              <Tooltip
                cursor={{ stroke: "#aeb6af", strokeDasharray: "3 3" }}
                contentStyle={{
                  border: "1px solid #d9ddd8",
                  borderRadius: 7,
                  boxShadow: "0 10px 28px rgba(22, 32, 28, 0.1)",
                  fontSize: 12,
                }}
                labelFormatter={(value) => formatChartTooltipDate(String(value))}
                formatter={(value) => [formatNumber(Number(value)), label]}
              />
              <Line
                type="monotone"
                dataKey={mode}
                stroke={mode === "stars" ? "#16764a" : "#b96a16"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ value, label, compact = false }: { value: string; label: string; compact?: boolean }) {
  return (
    <div className={compact ? "summaryStat compact" : "summaryStat"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatDelta(value: number | null) {
  if (value === null) return "—";
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function formatSignedDelta(value: number | null) {
  if (value === null) return "—";
  if (value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}

function growthValue(repository: CatalogRepository, period: TrendingPeriod) {
  if (period === 1) return repository.stars1d;
  if (period === 7) return repository.stars7d;
  return repository.stars30d;
}

function sortableGrowthValue(repository: CatalogRepository, period: 1 | 3 | 7 | 30 | 60) {
  if (period === 1) return repository.stars1d;
  if (period === 3) return repository.stars3d;
  if (period === 7) return repository.stars7d;
  if (period === 30) return repository.stars30d;
  return repository.stars60d;
}

function compareGrowth(
  left: CatalogRepository,
  right: CatalogRepository,
  period: 1 | 3 | 7 | 30 | 60,
) {
  const leftGrowth = sortableGrowthValue(left, period);
  const rightGrowth = sortableGrowthValue(right, period);
  if (leftGrowth === null && rightGrowth === null) return right.stars - left.stars;
  if (leftGrowth === null) return 1;
  if (rightGrowth === null) return -1;
  return rightGrowth - leftGrowth || right.stars - left.stars;
}

function formatChartDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatChartTooltipDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatSnapshot(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function dateValue(value: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}
