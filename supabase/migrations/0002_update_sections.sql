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
    2
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
      'pdf-parser'
    ]::text[],
    3
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
      'long-term-memory'
    ]::text[],
    5
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
    7
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
      'llm-monitoring'
    ]::text[],
    12
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
      'llm-benchmark'
    ]::text[],
    11
  ),
  (
    'mcp',
    'MCP',
    'Model Context Protocol servers, clients, SDKs, registries, and tool integrations.',
    array[
      'mcp',
      'model-context-protocol',
      'modelcontextprotocol',
      'mcp-server',
      'mcp-servers'
    ]::text[],
    6
  ),
  (
    'frameworks',
    'Frameworks & SDKs',
    'Frameworks and SDKs for building, orchestrating, and running AI agents.',
    array[
      'agent-framework',
      'agentic-framework',
      'agent-sdk'
    ]::text[],
    0
  ),
  (
    'platforms-apps',
    'Platforms & Apps',
    'Self-hosted platforms and applications for building, deploying, and operating AI agents.',
    array[
      'agent-platform',
      'llm-platform'
    ]::text[],
    1
  ),
  (
    'computer-use',
    'Computer Use',
    'Browser, desktop, and GUI automation for agents that operate software.',
    array[
      'computer-use',
      'browser-use',
      'browser-agent'
    ]::text[],
    8
  ),
  (
    'guardrails',
    'Guardrails',
    'Safety, validation, privacy, and security controls for LLM and agent applications.',
    array[
      'llm-safety',
      'llm-security',
      'llm-guardrails',
      'ai-safety',
      'ai-security',
      'ai-guardrails'
    ]::text[],
    10
  ),
  (
    'voice-realtime',
    'Voice & Realtime',
    'Speech, voice, and real-time multimodal systems for conversational AI agents.',
    array[
      'voice-ai',
      'voice-agent',
      'conversational-ai',
      'speech-to-text',
      'text-to-speech'
    ]::text[],
    9
  ),
  (
    'knowledge-graph',
    'Knowledge Graphs',
    'Knowledge graph, graph database, and graph retrieval tools for AI applications.',
    array[
      'knowledge-graph',
      'knowledge-graphs',
      'graph-database'
    ]::text[],
    4
  ),
  (
    'ui-ux',
    'UI/UX',
    'User interfaces, clients, and workspaces for interacting with AI and agent systems.',
    array[
      'llm-ui',
      'ai-ui'
    ]::text[],
    13
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  topics = excluded.topics,
  sort_order = excluded.sort_order;

commit;