# AGENTS.md

This file defines the working rules for AI coding agents operating in this
repository. Follow these instructions for repository curation in every session.
They supplement the public contribution rules in `CONTRIBUTING.md`.

## Project Purpose

`awesome-agent-oss` is an open-source radar for software used to build, run,
secure, evaluate, and operate AI agents. The catalog is deliberately narrower
than a general AI, developer-tools, or awesome-list directory.

The canonical registry is stored in Supabase. Generated README and section
tables are outputs of the metrics and rendering workflows. Do not manually edit
generated catalog rows to curate a repository.

## Curation Tasks

When the user provides one or more GitHub repositories and asks to classify
them, the default task is research and recommendation only:

1. Inspect each repository using current GitHub data.
2. Decide `Accept`, `Reject`, or, only when evidence is insufficient, `Hold`.
3. For accepted repositories, select one or more existing catalog sections.
4. Explain the decision in one concise, repository-specific sentence.
5. Do not modify Supabase, migrations, YAML, README, or generated files unless
   the user explicitly asks for implementation or data changes.

Never classify a repository from its name, description, topics, or prior chat
memory alone. Read its current README and verify its actual license and recent
maintenance state.

## Required Research

For every repository, verify at least:

- GitHub repository description, topics, star count, archive status, default
  branch, and `pushed_at`.
- The current README, especially product scope, features, installation, and
  architecture sections.
- The actual `LICENSE`, `COPYING`, or equivalent file. GitHub's detected SPDX
  value is a hint, not the final authority.
- Latest release date when releases exist.
- Relevant repository files when a claim needs proof, such as `SKILL.md`, MCP
  manifests, packages, source directories, or deployment artifacts.
- Whether the repository is the original project, a maintained fork, a mirror,
  a template, a paper implementation, or a documentation-only collection.

Use the GitHub API when network access is available. A local token may be loaded
from `environments/env/.env`, but never print, log, quote, or commit its value.
Authenticated requests are preferred because unauthenticated limits are low.
Parallelize independent repository lookups where practical.

If network access fails, retry with an authenticated GitHub API request. Do not
pretend that README inspection was completed. Use `Hold` only when the missing
evidence can materially change the decision and cannot be obtained locally or
through the API.

## Acceptance Standard

Accept a repository when all of the following are true:

- Its primary output is substantive software, infrastructure, an installable
  tool, or a reusable machine-consumable asset directly useful for AI agents.
- The agent relevance is part of the core product, not a marketing label,
  optional integration, example folder, or recently added peripheral feature.
- It has usable source code and enough documentation to understand and install
  or deploy it.
- Its license permits use, modification, and redistribution under an accepted
  open-source license.
- It has meaningful implementation depth and is not merely a concept, demo,
  thin wrapper, or landing page.
- It fits at least one existing section based on core functionality.
- It is reasonably maintained, or is a mature and still-useful standard with a
  defensible reason for infrequent changes.

Popularity is not an acceptance requirement. The discovery workflow's star
threshold is only a search-cost control. Do not reject a manually reviewed,
high-quality repository solely because it has fewer than 1,000 stars.

## Rejection Standard

Reject a repository when any of the following applies:

- It is generic infrastructure or a general developer tool whose connection to
  agents is incidental. A generic database, web framework, parser, monitoring
  system, proxy, note app, or automation tool does not qualify merely because an
  agent can use it.
- It is primarily an `awesome-*` list, link collection, directory, newsletter,
  paper list, prompt list, or catalog of third-party projects.
- It is primarily a course, book, tutorial, interview-preparation repository,
  benchmark dataset, learning exercise, or example collection.
- It only contains model weights, a research artifact, or a paper reproduction
  without reusable agent-stack software.
- It is archived, deprecated, superseded, abandoned, minimally implemented, or
  an unmodified fork/mirror.
- It lacks a license, uses a noncommercial license, prohibits meaningful use or
  redistribution, or uses a custom/source-available license with material
  restrictions beyond an OSI-style open-source license.
- Its claimed agent feature exists only in the roadmap, README marketing, topic
  tags, a single example, or an optional plugin that does not define the product.
- A more specific upstream repository is the real maintained implementation and
  the candidate adds no substantial independent value.

An educational or curated repository is an exception only when its primary
deliverable is itself installable and reusable, such as a maintained collection
of real Agent Skills with valid `SKILL.md` files. The existence of useful text
alone is not enough.

## Maintenance Rules

Use real code activity rather than README edits, bot commits, dependency bumps,
or repository metadata as the maintenance signal.

- Last meaningful code update within one year: normally acceptable.
- Between one and two years: inspect releases, issue activity, project maturity,
  alternatives, and whether the software remains operational.
- More than two years without meaningful code updates: reject by default.
- Archived, explicitly deprecated, or read-only repositories: reject unless the
  repository is an irreplaceable mature specification and the catalog section
  genuinely calls for it.

Recent commits do not automatically make a repository acceptable. Also inspect
whether development is substantive and whether the project is production-ready
enough for the catalog.

## License Rules

Read the license file rather than trusting only the GitHub API.

- Common accepted examples include MIT, Apache-2.0, BSD, ISC, MPL-2.0, GPL,
  AGPL, and LGPL.
- `license: null` usually means GitHub found no recognized license file.
- `NOASSERTION` means GitHub could not confidently identify the license. It may
  still contain a valid custom or unusual license, so inspect the file.
- Reject licenses with noncommercial clauses, field-of-use restrictions,
  restrictions on competing services, mandatory commercial licensing for core
  use, or other source-available limitations.
- When a project announces that future releases will become source-available,
  classify the currently published version from its present license, but mention
  the announced transition as a monitoring risk.
- If different directories or editions use different licenses, determine which
  license covers the core functionality being cataloged.

## Section Assignment

Choose the smallest set of sections that accurately describes the repository's
core product. Prefer one primary section. Add another only when that capability
is independently substantial, implemented in the repository, and central to how
the project is used.

Do not assign a section merely because the README mentions an integration,
compatibility, optional feature, example, or dependency. Three or more sections
should be exceptional and require strong evidence.

Use these section IDs and meanings:

### `frameworks` - Frameworks & SDKs

Libraries, SDKs, runtimes, and orchestration primitives for constructing and
running agents. Use this for reusable developer foundations, not complete end
user applications. An app with an internal agent framework remains primarily an
app unless the framework is a separately usable core deliverable.

### `platforms-apps` - Platforms & Apps

Complete, usually self-hostable agent products, visual builders, workspaces, and
applications. This includes products such as multi-agent workspaces and agent
automation platforms. Do not use it for a small library or a generic non-agent
application with an AI assistant added.

### `ai-gateways` - AI Gateways

Model/LLM gateways whose core purpose includes provider routing, fallback, load
balancing, authentication, policy enforcement, caching, usage control, or model
traffic observability. Generic API gateways qualify only when AI gateway support
is a maintained core product capability, not an example plugin.

### `rag` - RAG

Retrieval, indexing, vector search, ingestion, grounding, reranking, and
retrieval-augmented generation systems for AI applications. Generic databases
do not qualify solely because they can store vectors. The README and APIs should
show direct RAG/AI retrieval usage as a central capability.

### `ocr` - OCR & Parsing

OCR, document extraction, document layout analysis, PDF/document conversion,
and structured content parsing for downstream AI use. Reject generic language
parsers, compiler parsers, HTML utilities, or file readers unless document AI is
their direct purpose.

### `knowledge-graph` - Knowledge Graphs

Knowledge graph construction, graph databases, GraphRAG, entity/relation
extraction, and graph retrieval for AI systems. A general graph database may be
accepted when it is a maintained foundation directly useful to this category,
but generic graph visualization or tutorials do not qualify.

### `memory` - Memory

Short-term, long-term, episodic, semantic, or persistent memory designed for AI
agents. The system must manage agent context or learned experience across turns
or sessions. Do not confuse this with RAM optimization, neural-network memory
architectures, caches, note-taking apps, or ordinary databases.

### `mcp` - MCP

Model Context Protocol servers, clients, SDKs, registries, gateways, inspectors,
and substantial tool integrations. A product should not receive this section
for merely supporting an MCP connector. MCP must be a primary deliverable or a
major independently useful subsystem.

### `skills` - Skills

Installable, shareable Agent Skills or compatible reusable instruction/workflow
packages. Verify actual skill artifacts such as `SKILL.md`, manifests, installer
support, or a documented skill registry. Do not classify generic capabilities,
human skills, model abilities, internal product actions, prompts, or a README's
use of the word "skill" as Agent Skills.

### `coding-agents` - Coding Agents

Agents and agent-specific development tools for writing, reviewing, debugging,
testing, or maintaining code. This includes coding-agent CLIs, code-review
agents, and tools that coordinate or supervise coding agents. Generic IDEs,
linters, compilers, and developer utilities do not qualify without a core agent
workflow.

### `sandboxes` - Sandboxes

Isolated runtimes, code interpreters, containers, virtual machines, or execution
environments specifically designed to run agent-generated code and tools safely.
Do not classify ordinary container tooling or generic cloud runtimes unless the
agent execution use case is central.

### `computer-use` - Computer Use

Browser, desktop, GUI, mobile, or operating-system automation designed for AI
agents. A generic automation/RPA library does not qualify merely because an
agent could call it. The project should expose agent-oriented perception,
planning, control, or integration.

### `voice-realtime` - Voice & Realtime

Speech-to-text, text-to-speech, voice agents, real-time media pipelines, and
multimodal conversational runtimes. Generic audio players, media tools, or a
standalone speech model should be accepted only when they provide reusable
infrastructure directly applicable to conversational agents.

### `guardrails` - Guardrails

Runtime safety, security, privacy, policy, validation, governance, red teaming,
and attack detection for LLM or agent systems. General cybersecurity tools do
not qualify unless they directly test or protect AI/agent behavior. A security
benchmark may fit `evaluation` as well only when both are core deliverables.

### `evaluation` - Evaluation

Evaluation frameworks, benchmarks, test harnesses, scoring, quality measurement,
and experiment systems for LLMs, RAG, or agents. Static benchmark results,
datasets, leaderboards without reusable tooling, and narrow one-off academic
evaluations are normally rejected.

### `observability` - Observability

Tracing, monitoring, debugging, analytics, cost tracking, and production
diagnostics specifically for LLM and agent systems. Generic APM, infrastructure
monitoring, log shipping, and dashboards do not qualify merely because they can
observe an agent deployment.

### `ui-ux` - UI/UX

Reusable interfaces, component libraries, chat surfaces, visual interaction
layers, and workspaces specifically for AI or agent experiences. Complete agent
products belong in `platforms-apps`; add `ui-ux` only when the interface layer is
itself a central, reusable deliverable. Generic frontend frameworks and design
tools are excluded.

## Common Boundary Decisions

- **Frameworks vs Platforms & Apps**: choose `frameworks` for code that
  developers embed; choose `platforms-apps` for a complete product users deploy
  or operate. Use both only if both are maintained first-class deliverables.
- **Platforms & Apps vs UI/UX**: complete applications belong to the former;
  reusable AI interaction components and interface infrastructure belong to the
  latter.
- **Frameworks vs Coding Agents**: a general agent SDK is a framework; a product
  focused on software engineering tasks is a coding agent. A coding-agent
  orchestration SDK can legitimately be both.
- **RAG vs Memory**: retrieval over a knowledge corpus is RAG; persistence of an
  agent's interaction history, user facts, learned experience, or evolving
  context is memory.
- **Knowledge Graphs vs RAG**: graph storage/construction is Knowledge Graphs;
  graph-grounded retrieval may also be RAG when retrieval is a first-class
  product capability.
- **MCP vs Skills**: MCP exposes tools through a protocol; Skills package
  reusable instructions/workflows. Supporting both formats does not justify both
  sections unless both artifact types are substantial.
- **Guardrails vs Evaluation**: runtime prevention/enforcement is Guardrails;
  offline testing and measurement is Evaluation.
- **AI Gateways vs Frameworks**: traffic routing and provider management is a
  gateway; application/agent construction primitives are a framework.
- **Computer Use vs Coding Agents**: operating browsers/desktops is Computer
  Use; editing and maintaining software is Coding Agents.
- **Skills vs internal learned behavior**: a system that internally learns or
  calls capabilities is not a Skills repository unless those capabilities are
  packaged for installation or reuse by compatible agents.

## Duplicate and Prior-State Checks

When applying a decision rather than only recommending one, check Supabase for
an existing repository and section relation first.

- An accepted repository should have one canonical repository record.
- Adding another accepted section updates its section relations; it must not
  create a duplicate repository.
- A repository already accepted in the same section should be reported as an
  existing classification rather than added again.
- A repository rejected globally should not be re-added without evidence that
  its implementation, maintenance, or license materially changed.
- A section-scoped rejection may still allow acceptance into a different,
  clearly appropriate section.

Do not change historical curation state silently. State the conflict and the
evidence supporting any proposed reclassification.

## Output Format

For ordinary classification requests, answer in Korean unless the user asks for
another language. Use this table and keep the explanation concise:

```markdown
| Repository | 결정 | 섹션 | 이유 |
|---|---|---|---|
| `owner/repo` | Accept | Frameworks & SDKs | 구체적인 근거 한 문장입니다. |
| `owner/repo` | Reject | - | 제외 기준에 해당하는 구체적인 이유입니다. |
```

Use catalog display names exactly as defined above. For multiple sections,
separate names with commas. Do not hedge with unsupported guesses. Mention a
material caveat, such as a planned license change or borderline maintenance
state, in the reason.

Use `Hold` sparingly and identify exactly what evidence is missing. `Hold` is not
a substitute for doing the research.

## Working With Repository Files

- Respect existing user changes in the worktree. Never revert unrelated edits.
- Use `rg` for searching and `apply_patch` for manual edits.
- Do not edit generated README tables or files under `sections/` directly.
- Do not expose Supabase service keys, GitHub tokens, or local `.env` contents.
- When adding or changing sections, keep the Supabase section definitions,
  application UI, render pipeline, and documentation consistent, and verify the
  migration strategy before editing existing migrations.
- Run checks appropriate to any code change. Classification-only research does
  not require modifying or testing the codebase.
