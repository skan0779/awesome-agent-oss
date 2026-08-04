"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Code2, Pencil, Plus, Search, X } from "lucide-react";

type Section = {
  id: string;
  name: string;
  topics: string[];
  sort_order: number;
};

type Candidate = {
  id: number;
  repositoryId: number;
  fullName: string;
  htmlUrl: string | null;
  repositoryStatus: string;
  source: string;
  query: string | null;
  suggestedSections: string[];
  matchedTopics: string[];
  discoveredAt: string;
  metadata: {
    stars?: number;
    forks?: number;
    topics?: string[];
    description?: string | null;
    pushed_at?: string | null;
  };
};

type CandidatesResponse = {
  candidates: Candidate[];
  sections: Section[];
  pagination: {
    page: number;
    perPage: number;
    pendingCount: number;
    totalCount: number;
    totalPages: number;
  };
};

const TOKEN_STORAGE_KEY = "awesome-agent-oss-curation-token";
const COLLAPSED_TOPIC_LIMIT = 8;
const CANDIDATES_PER_PAGE = 10;

export default function CurationPage() {
  const [token, setToken] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSections, setSelectedSections] = useState<Record<number, string[]>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [expandedTopics, setExpandedTopics] = useState<Record<number, boolean>>({});
  const [busyRepositoryId, setBusyRepositoryId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPendingCount, setTotalPendingCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sectionFilter, setSectionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("discovered_desc");
  const [repositoryView, setRepositoryView] = useState<"pending" | "accepted">("pending");
  const [manualRepository, setManualRepository] = useState("");
  const [manualSections, setManualSections] = useState<string[]>([]);
  const [addingRepository, setAddingRepository] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
    setToken(storedToken);
    void loadCandidates(storedToken, 1);
  }, []);

  const sectionById = useMemo(() => {
    return new Map(sections.map((section) => [section.id, section]));
  }, [sections]);

  async function loadCandidates(nextToken = token, nextPage = page) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        perPage: String(CANDIDATES_PER_PAGE),
        section: sectionFilter,
        search: searchQuery,
        sort: sortMode,
        status: repositoryView,
      });
      const response = await fetch(`/api/candidates?${params.toString()}`, {
        headers: curationHeaders(nextToken),
      });
      const payload = (await response.json()) as CandidatesResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load candidates.");
      }

      if (
        payload.candidates.length === 0 &&
        payload.pagination.totalCount > 0 &&
        nextPage > payload.pagination.totalPages
      ) {
        await loadCandidates(nextToken, payload.pagination.totalPages);
        return;
      }

      setCandidates(payload.candidates);
      setSections(payload.sections);
      setPage(payload.pagination.page);
      setTotalPendingCount(payload.pagination.pendingCount);
      setFilteredCount(payload.pagination.totalCount);
      setTotalPages(payload.pagination.totalPages);
      setSelectedSections((current) => {
        const next = { ...current };
        for (const candidate of payload.candidates) {
          if (!next[candidate.repositoryId]) {
            next[candidate.repositoryId] = candidate.suggestedSections;
          }
        }
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load candidates.");
    } finally {
      setLoading(false);
    }
  }

  function saveToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    void loadCandidates(token, 1);
  }

  async function appendRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const repository = manualRepository.trim();
    if (!repository) {
      setError("Enter a GitHub URL or owner/repo value.");
      return;
    }
    if (manualSections.length === 0) {
      setError("Select at least one suggested section.");
      return;
    }

    setAddingRepository(true);
    setError(null);
    try {
      const response = await fetch("/api/candidates/manual", {
        method: "POST",
        headers: {
          ...curationHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repository, sections: manualSections }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to append repository.");
      }

      setManualRepository("");
      setManualSections([]);
      await loadCandidates(token, 1);
    } catch (appendError) {
      setError(
        appendError instanceof Error ? appendError.message : "Failed to append repository.",
      );
    } finally {
      setAddingRepository(false);
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCandidates(token, 1);
  }

  function resetFilters() {
    setSectionFilter("all");
    setSearchQuery("");
    setSortMode("discovered_desc");
    void loadCandidatesWithFilters({
      section: "all",
      search: "",
      sort: "discovered_desc",
      page: 1,
      status: repositoryView,
    });
  }

  function updateSectionFilter(section: string) {
    setSectionFilter(section);
    void loadCandidatesWithFilters({
      section,
      search: searchQuery,
      sort: sortMode,
      page: 1,
      status: repositoryView,
    });
  }

  function updateSortMode(sort: string) {
    setSortMode(sort);
    void loadCandidatesWithFilters({
      section: sectionFilter,
      search: searchQuery,
      sort,
      page: 1,
      status: repositoryView,
    });
  }

  function updateRepositoryView(status: "pending" | "accepted") {
    if (status === repositoryView) {
      return;
    }
    setRepositoryView(status);
    void loadCandidatesWithFilters({
      section: sectionFilter,
      search: searchQuery,
      sort: sortMode,
      page: 1,
      status,
    });
  }

  async function loadCandidatesWithFilters({
    section,
    search,
    sort,
    page: nextPage,
    status,
  }: {
    section: string;
    search: string;
    sort: string;
    page: number;
    status: "pending" | "accepted";
  }) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        perPage: String(CANDIDATES_PER_PAGE),
        section,
        search,
        sort,
        status,
      });
      const response = await fetch(`/api/candidates?${params.toString()}`, {
        headers: curationHeaders(token),
      });
      const payload = (await response.json()) as CandidatesResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load candidates.");
      }

      setCandidates(payload.candidates);
      setSections(payload.sections);
      setPage(payload.pagination.page);
      setTotalPendingCount(payload.pagination.pendingCount);
      setFilteredCount(payload.pagination.totalCount);
      setTotalPages(payload.pagination.totalPages);
      setSelectedSections((current) => {
        const next = { ...current };
        for (const candidate of payload.candidates) {
          if (!next[candidate.repositoryId]) {
            next[candidate.repositoryId] = candidate.suggestedSections;
          }
        }
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load candidates.");
    } finally {
      setLoading(false);
    }
  }

  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) {
      return;
    }

    void loadCandidatesWithFilters({
      section: sectionFilter,
      search: searchQuery,
      sort: sortMode,
      page: nextPage,
      status: repositoryView,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleSection(repositoryId: number, sectionId: string) {
    setSelectedSections((current) => {
      const values = current[repositoryId] || [];
      const exists = values.includes(sectionId);
      return {
        ...current,
        [repositoryId]: exists
          ? values.filter((value) => value !== sectionId)
          : [...values, sectionId],
      };
    });
  }

  function toggleTopics(repositoryId: number) {
    setExpandedTopics((current) => ({
      ...current,
      [repositoryId]: !current[repositoryId],
    }));
  }

  function toggleManualSection(sectionId: string) {
    setManualSections((current) =>
      current.includes(sectionId)
        ? current.filter((value) => value !== sectionId)
        : [...current, sectionId],
    );
  }

  async function acceptCandidate(candidate: Candidate) {
    const sectionsForRepo = selectedSections[candidate.repositoryId] || [];
    if (sectionsForRepo.length === 0) {
      setError("Select at least one section before accepting.");
      return;
    }

    await curate("/api/curate/accept", {
      repositoryId: candidate.repositoryId,
      sections: sectionsForRepo,
    });
  }

  async function rejectCandidate(candidate: Candidate) {
    await curate("/api/curate/reject", {
      repositoryId: candidate.repositoryId,
      reason: reasons[candidate.repositoryId] || "",
    });
  }

  async function updateAcceptedSections(candidate: Candidate) {
    const sectionsForRepo = selectedSections[candidate.repositoryId] || [];
    if (sectionsForRepo.length === 0) {
      setError("Accepted repositories must have at least one section.");
      return;
    }

    await curate("/api/curate/sections", {
      repositoryId: candidate.repositoryId,
      sections: sectionsForRepo,
    });
  }

  async function curate(path: string, body: Record<string, unknown>) {
    const repositoryId = Number(body.repositoryId);
    setBusyRepositoryId(repositoryId);
    setError(null);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          ...curationHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Curation request failed.");
      }

      await loadCandidatesWithFilters({
        section: sectionFilter,
        search: searchQuery,
        sort: sortMode,
        page,
        status: repositoryView,
      });
    } catch (curationError) {
      setError(
        curationError instanceof Error ? curationError.message : "Curation request failed.",
      );
    } finally {
      setBusyRepositoryId(null);
    }
  }

  return (
    <main className="shell adminShell">
      <nav className="adminNav" aria-label="Admin navigation">
        <a href="/"><ArrowLeft size={16} /> Back to catalog</a>
        <a href="https://github.com/skan0779/awesome-agent-oss" target="_blank" rel="noreferrer">
          <Code2 size={17} /> GitHub
        </a>
      </nav>
      <header className="masthead">
        <div>
          <p className="eyebrow">awesome-agent-oss</p>
          <h1>Curation</h1>
        </div>
        <div className="counter">
          <span>{repositoryView === "pending" ? totalPendingCount : filteredCount}</span>
          <small>{repositoryView}</small>
        </div>
      </header>

      <div className="curationMode" role="tablist" aria-label="Repository status">
        <button
          aria-selected={repositoryView === "pending"}
          className={repositoryView === "pending" ? "active" : ""}
          type="button"
          onClick={() => updateRepositoryView("pending")}
        >
          Pending
        </button>
        <button
          aria-selected={repositoryView === "accepted"}
          className={repositoryView === "accepted" ? "active" : ""}
          type="button"
          onClick={() => updateRepositoryView("accepted")}
        >
          Accepted
        </button>
      </div>

      <form className="toolbar" onSubmit={saveToken}>
        <input
          aria-label="Admin token"
          autoComplete="off"
          inputMode="text"
          placeholder="Admin token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <button type="submit">Refresh</button>
      </form>

      {repositoryView === "pending" ? <form className="appendPanel" onSubmit={appendRepository}>
        <div className="filterField appendField">
          <label htmlFor="manual-repository">Append</label>
          <input
            id="manual-repository"
            placeholder="GitHub URL or owner/repo"
            type="text"
            value={manualRepository}
            onChange={(event) => setManualRepository(event.target.value)}
          />
        </div>
        <fieldset className="manualSectionPicker">
          <legend>Suggested sections</legend>
          <div className="sectionOptions">
            {sections.map((section) => (
              <label className="sectionOption" key={section.id}>
                <input
                  checked={manualSections.includes(section.id)}
                  type="checkbox"
                  onChange={() => toggleManualSection(section.id)}
                />
                <span>{section.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="appendButton" disabled={addingRepository} type="submit">
          <Plus size={17} /> {addingRepository ? "Adding" : "Add pending"}
        </button>
      </form> : null}

      <form className="filters" onSubmit={applyFilters}>
        <div className="filterField searchField">
          <label htmlFor="repo-search">Search</label>
          <input
            id="repo-search"
            placeholder="Repository, topic, description"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <div className="filterField">
          <label htmlFor="section-filter">Section</label>
          <select
            id="section-filter"
            value={sectionFilter}
            onChange={(event) => updateSectionFilter(event.target.value)}
          >
            <option value="all">All sections</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filterField">
          <label htmlFor="sort-mode">Sort</label>
          <select
            id="sort-mode"
            value={sortMode}
            onChange={(event) => updateSortMode(event.target.value)}
          >
            <option value="discovered_desc">Recently discovered</option>
            <option value="stars_desc">Most stars</option>
            <option value="forks_desc">Most forks</option>
            <option value="pushed_desc">Recently pushed</option>
            <option value="name_asc">Repository name</option>
          </select>
        </div>
        <div className="filterActions">
          <button className="filterButton" type="submit">
            <Search size={17} /> Search
          </button>
          <button className="resetButton" type="button" onClick={resetFilters}>
            Reset
          </button>
        </div>
      </form>

      {error ? <div className="notice">{error}</div> : null}

      {loading ? (
        <div className="empty">Loading {repositoryView} repositories.</div>
      ) : candidates.length === 0 ? (
        <div className="empty">
          {repositoryView === "pending" && totalPendingCount === 0
            ? "No pending repositories."
            : "No repositories match the current filters."}
        </div>
      ) : (
        <>
          <div className="pageSummary">
            Page {page} of {totalPages} - {filteredCount} matching
          </div>
          <section className="candidateGrid" aria-label={`${repositoryView} repositories`}>
            {candidates.map((candidate) => {
              const selected = selectedSections[candidate.repositoryId] || [];
              const topics = candidate.metadata.topics?.length
                ? candidate.metadata.topics
                : candidate.matchedTopics;
              const topicsExpanded = expandedTopics[candidate.repositoryId] === true;
              const visibleTopics = topicsExpanded
                ? topics
                : topics.slice(0, COLLAPSED_TOPIC_LIMIT);
              const hiddenTopicCount = Math.max(0, topics.length - COLLAPSED_TOPIC_LIMIT);
              const isBusy = busyRepositoryId === candidate.repositoryId;

              return (
                <article className="candidateCard" key={candidate.repositoryId}>
                  <div className="cardHeader">
                    <div>
                      <a
                        className="repoName"
                        href={candidate.htmlUrl || "#"}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {candidate.fullName}
                      </a>
                      <p className="description">
                        {candidate.metadata.description || "No description captured."}
                      </p>
                    </div>
                  </div>

                  <div className="stats">
                    <Metric label="Stars" value={formatNumber(candidate.metadata.stars)} />
                    <Metric label="Forks" value={formatNumber(candidate.metadata.forks)} />
                    <Metric label="Found" value={formatDate(candidate.discoveredAt)} />
                  </div>

                  <div className="pills" aria-label="Topics">
                    {visibleTopics.map((topic) => (
                      <span className="pill" key={topic}>
                        {topic}
                      </span>
                    ))}
                    {hiddenTopicCount > 0 ? (
                      <button
                        className="pillToggle"
                        type="button"
                        onClick={() => toggleTopics(candidate.repositoryId)}
                      >
                        {topicsExpanded ? "Show less" : `+${hiddenTopicCount} more`}
                      </button>
                    ) : null}
                  </div>

                  <fieldset className="sectionPicker">
                    <legend>Sections</legend>
                    <div className="sectionOptions">
                      {sections.map((section) => (
                        <label className="sectionOption" key={section.id}>
                          <input
                            checked={selected.includes(section.id)}
                            type="checkbox"
                            onChange={() => toggleSection(candidate.repositoryId, section.id)}
                          />
                          <span>{sectionById.get(section.id)?.name || section.id}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {repositoryView === "pending" ? (
                    <>
                      <input
                        className="reasonInput"
                        placeholder="Reject reason"
                        value={reasons[candidate.repositoryId] || ""}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [candidate.repositoryId]: event.target.value,
                          }))
                        }
                      />

                      <div className="actions">
                        <button
                          className="rejectButton"
                          disabled={isBusy}
                          type="button"
                          onClick={() => void rejectCandidate(candidate)}
                        >
                          <X size={17} /> Reject
                        </button>
                        <button
                          className="acceptButton"
                          disabled={isBusy}
                          type="button"
                          onClick={() => void acceptCandidate(candidate)}
                        >
                          <Check size={17} /> Accept
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      className="updateSectionsButton"
                      disabled={isBusy}
                      type="button"
                      onClick={() => void updateAcceptedSections(candidate)}
                    >
                      <Pencil size={17} /> Save sections
                    </button>
                  )}
                </article>
              );
            })}
          </section>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={goToPage}
          />
        </>
      )}
    </main>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const items = paginationItems(currentPage, totalPages);

  return (
    <nav className="pagination" aria-label="Pending repositories pagination">
      <button
        className="pageButton"
        disabled={currentPage <= 1}
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
      >
        Prev
      </button>
      {items.map((item, index) =>
        item === "ellipsis" ? (
          <span className="pageEllipsis" key={`ellipsis-${index}`}>
            ...
          </span>
        ) : (
          <button
            aria-current={item === currentPage ? "page" : undefined}
            className="pageButton"
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        className="pageButton"
        disabled={currentPage >= totalPages}
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </button>
    </nav>
  );
}

function paginationItems(currentPage: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages]);
  for (let pageNumber = currentPage - 1; pageNumber <= currentPage + 1; pageNumber += 1) {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      pages.add(pageNumber);
    }
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  for (const pageNumber of sortedPages) {
    const previous = items.at(-1);
    if (typeof previous === "number" && pageNumber - previous > 1) {
      items.push("ellipsis");
    }
    items.push(pageNumber);
  }

  return items;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{value}</span>
      <small>{label}</small>
    </div>
  );
}

function curationHeaders(token: string): HeadersInit {
  return token ? { "x-curation-token": token } : {};
}

function formatNumber(value: number | undefined) {
  if (typeof value !== "number") {
    return "-";
  }
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}
