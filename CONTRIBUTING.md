# Contributing to awesome-agent-oss

Thanks for helping improve the open-source radar for AI agent stacks. Contributions can suggest repositories, correct catalog data, or improve the application and collection pipeline.

## Suggest a Repository

Use the [repository suggestion form](https://github.com/skan0779/awesome-agent-oss/issues/new?template=repository-suggestion.yml). The Supabase registry is maintained by the project owner, so repository suggestions should not edit generated Markdown or database records directly.

The 1,000-star threshold used by automated discovery limits GitHub Search traffic. It is not a strict acceptance requirement for manually suggested repositories.

## Inclusion Criteria

A repository should:

- Provide software, infrastructure, reusable assets, or tooling directly useful for building or operating AI agents.
- Publish substantive source code with a license that permits use, modification, and redistribution.
- Explain its purpose and basic usage in its README or documentation.
- Show meaningful implementation beyond a concept-only demo.
- Fit at least one catalog section based on its core functionality.
- Be an original project rather than an unmodified fork.

Recent maintenance is preferred. Stable projects with infrequent updates may still qualify when they remain useful and supported.

## Exclusion Criteria

Repositories are generally excluded when they are:

- Link collections or `awesome-*` lists.
- Courses, books, tutorials, paper collections, or learning-only examples.
- Generic software without a direct role in an AI agent stack.
- Archived, abandoned, placeholder, or minimally implemented projects.
- Model weights or research artifacts distributed under non-open or use-restricted terms.
- Missing a license, or using custom terms that materially restrict use, modification, or redistribution.
- Primarily promotional copies, mirrors, or unmodified forks of another project.

An educational or curated repository can be considered when its primary output is an installable, reusable artifact, such as a maintained package of agent skills. Custom licenses are reviewed case by case.

## Catalog Sections

- **Frameworks & SDKs**: Libraries and runtimes for constructing and orchestrating agents.
- **Platforms & Apps**: Self-hosted platforms and complete agent applications.
- **RAG**: Retrieval, indexing, vector search, and grounded generation.
- **OCR & Parsing**: OCR, document extraction, layout analysis, and conversion.
- **Knowledge Graphs**: Knowledge graphs, graph databases, and graph retrieval.
- **Memory**: Short-term, long-term, and persistent agent memory.
- **MCP**: Model Context Protocol servers, clients, SDKs, and integrations.
- **Skills**: Reusable agent skills, instructions, and workflow packages.
- **Computer Use**: Browser, desktop, mobile, and GUI automation for agents.
- **Voice & Realtime**: Speech and real-time multimodal conversational systems.
- **Guardrails**: Safety, security, privacy, validation, and governance controls.
- **Evaluation**: Evaluation, benchmarking, testing, and scoring.
- **Observability**: Tracing, monitoring, analytics, and production diagnostics.
- **UI/UX**: Interfaces, clients, and workspaces for interacting with agents.

Choose the section that best represents the repository's primary function. Multiple sections are appropriate only when each capability is a substantial part of the project, not merely an integration or optional feature.

## Review Process

Each suggestion is reviewed for:

1. Existing accepted, pending, or rejected records.
2. README and documentation claims.
3. The actual license file and any additional use restrictions.
4. Maintenance status, archive state, and repository originality.
5. Direct relevance to agent development and section fit.
6. Duplication or significant overlap with an upstream project.

The maintainer makes the final acceptance and classification decision. Rejected projects may be reconsidered after substantial changes to their scope, implementation, maintenance status, or license.

## Corrections and Removal Requests

Open a regular GitHub issue for incorrect metadata, classification changes, renamed or transferred repositories, license changes, archived projects, or removal requests. Include supporting links so the change can be verified.

Generated README tables and files under `sections/` are updated by the metrics workflow. Do not edit generated catalog content manually.

## Code and Documentation Changes

Keep changes focused and avoid committing local credentials or generated intermediates. Before opening a pull request, run the checks relevant to your change:

```bash
uv run python -m compileall -q src
npm run build
```

Explain the behavior changed, the verification performed, and any database or workflow impact in the pull request.
