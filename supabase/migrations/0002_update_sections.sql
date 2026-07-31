begin;

insert into sections (
  id,
  name,
  description,
  topics,
  sort_order
)
values
  (
    'rag',
    'RAG',
    'Retrieval, indexing, and generation tools for grounding AI applications in external knowledge.',
    array[
      'rag',
      'retrieval-augmented-generation',
      'ai-rag',
      'agent-rag',
      'agentic-rag',
      'graphrag'
    ]::text[],
    1
  ),
  (
    'ocr',
    'OCR & Parsing',
    'OCR, document extraction, layout analysis, and structured document conversion.',
    array[
      'ocr',
      'ocr-engine',
      'vlm-ocr',
      'document-ocr',
      'optical-character-recognition',
      'parser',
      'document-parsing',
      'document-parser',
      'document-understanding',
      'document-ai',
      'pdf-parser',
      'pdf-extraction',
      'pdf-to-markdown',
      'layout-analysis',
      'table-extraction'
    ]::text[],
    2
  ),
  (
    'memory',
    'Memory',
    'Short-term, long-term, and persistent memory systems for AI agents.',
    array[
      'memory',
      'ai-memory',
      'agent-memory',
      'agentic-memory',
      'long-term-memory',
      'persistent-memory',
      'memory-management',
      'short-term-memory'
    ]::text[],
    4
  ),
  (
    'skills',
    'Skills',
    'Reusable skills, instructions, and workflow packages for AI agents.',
    array[
      'skills',
      'ai-skills',
      'agent-skills'
    ]::text[],
    6
  ),
  (
    'observability',
    'Observability',
    'Tracing, monitoring, and production analytics for LLM and agent systems.',
    array[
      'observability',
      'llm-observability',
      'ai-observability',
      'agent-observability',
      'llm-tracing',
      'llm-monitoring',
      'ai-monitoring'
    ]::text[],
    10
  ),
  (
    'evaluation',
    'Evaluation',
    'Evaluation, benchmarking, testing, and scoring for LLM and agent systems.',
    array[
      'llm-evaluation',
      'llm-eval',
      'agent-evaluation',
      'rag-evaluation',
      'ai-evaluation',
      'evaluation-framework',
      'evals',
      'llm-benchmark'
    ]::text[],
    9
  ),
  (
    'mcp',
    'MCP',
    'Model Context Protocol servers, clients, SDKs, registries, and tool integrations.',
    array[
      'mcp',
      'model-context-protocol',
      'mcp-server',
      'mcp-servers',
      'mcp-client',
      'mcp-sdk',
      'mcp-tools',
      'agent-tools'
    ]::text[],
    5
  ),
  (
    'frameworks',
    'Frameworks & SDKs',
    'Frameworks and SDKs for building, orchestrating, and running AI agents.',
    array[
      'agent-framework',
      'agentic-framework',
      'agent-sdk',
      'agent-orchestration',
      'agent-runtime',
      'langchain',
      'langgraph',
      'semantic-kernel',
      'autogen',
      'crewai',
      'pydantic-ai',
      'smolagents'
    ]::text[],
    0
  ),
  (
    'computer-use',
    'Computer Use',
    'Browser, desktop, and GUI automation for agents that operate software.',
    array[
      'computer-use',
      'browser-use',
      'browser-agent',
      'browser-automation',
      'web-agent',
      'web-agents',
      'gui-automation',
      'desktop-automation'
    ]::text[],
    7
  ),
  (
    'guardrails',
    'Guardrails',
    'Safety, validation, privacy, and security controls for LLM and agent applications.',
    array[
      'llm-guardrails',
      'ai-guardrails',
      'guardrails-ai',
      'llm-safety',
      'agent-safety',
      'prompt-injection',
      'content-safety',
      'llm-security',
      'ai-security'
    ]::text[],
    8
  ),
  (
    'knowledge-graph',
    'Knowledge Graphs',
    'Knowledge graph, graph database, and graph retrieval tools for AI applications.',
    array[
      'knowledge-graph',
      'knowledge-graphs',
      'graph-database',
      'graph-rag',
      'graphrag',
      'knowledge-representation',
      'entity-resolution'
    ]::text[],
    3
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  topics = excluded.topics,
  sort_order = excluded.sort_order;

commit;
