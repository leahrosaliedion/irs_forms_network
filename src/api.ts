// src/api.ts
import type {
  GraphData,
  GraphNode,
  GraphLink,
  Relationship,
  Stats,
  TagCluster,
  Actor,
  Document,
  NodeType,
} from './types';

const GRAPH_URL = `${import.meta.env.BASE_URL}title26_graph.json`;

// Shape of the raw JSON coming from Python
interface RawNode {
  id: string;
  label?: string;
  node_type?: string;       // 'section' | 'entity' | 'tag'
  section_num?: string | number;
  section_heading?: string;
  title?: string | number;
  title_heading?: string;
  terms?: string;
  tags?: string;
  aux_verbs?: string;
  section_text?: string;

  // entity metadata from CSV
  department?: string;
  total_mentions?: number;
  entity?: string;
}

interface RawLink {
  source: string;
  target: string;
  edge_type?: string;       // 'citation' | 'section_entity' | 'section_tag' | etc.
  weight?: number;
}

interface RawGraphData {
  nodes: RawNode[];
  links: RawLink[];
}

// In-memory cache so we only fetch once
let cachedGraph: GraphData | null = null;

// Color helper by node type
function colorForType(t?: NodeType): string {
  switch (t) {
    case 'section':
      return '#60a5fa'; // blue
    case 'entity':
      return '#f97316'; // orange
    case 'tag':
      return '#a855f7'; // purple
    default:
      return '#6b7280'; // gray
  }
}

// Load and normalize the graph from JSON into GraphNode/GraphLink
async function loadGraph(): Promise<GraphData> {
  if (cachedGraph) return cachedGraph;

  const res = await fetch(GRAPH_URL);
  if (!res.ok) {
    throw new Error(`Failed to load graph data from ${GRAPH_URL}: ${res.status}`);
  }

  const raw = (await res.json()) as RawGraphData;

  const nodes: GraphNode[] = raw.nodes.map((n: RawNode & Record<string, unknown>) => {
    const nodeType = n.node_type as NodeType | undefined;

    // Prefer section_num as label for sections, otherwise label/id
    let name: string;
    if (nodeType === 'section' && n.section_num != null) {
      name = String(n.section_num);
    } else {
      name = n.label ?? n.id;
    }

    const baseColor = colorForType(nodeType);

    return {
      id: n.id,
      name,
      val: 1,
      node_type: nodeType,
      section_num: n.section_num,
      section_heading: n.section_heading ?? null,
      title: n.title,
      title_heading: n.title_heading ?? null,
      terms: n.terms ?? null,
      tags: n.tags ?? null,
      aux_verbs: n.aux_verbs ?? null,
      section_text: n.section_text ?? null,
      department: n.department ?? null,
      total_mentions: n.total_mentions ?? null,
      entity: n.entity ?? null,
      color: baseColor,
      baseColor,
    };
  });

  const links: GraphLink[] = raw.links.map((l) => {
    const edgeType = l.edge_type ?? 'relationship';
    return {
      source: l.source,
      target: l.target,
      action: edgeType,
      edge_type: edgeType,
      weight: l.weight ?? 1,
    };
  });

  cachedGraph = { nodes, links };
  return cachedGraph;
}

// Helper to build a lookup map from node id -> GraphNode
async function getNodeMap(): Promise<Map<string, GraphNode>> {
  const graph = await loadGraph();
  const map = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    map.set(node.id, node);
  }
  return map;
}

// Helper: convert links to Relationship objects (for lists, sidebars, etc.)
async function buildRelationshipsFromLinks(
  links: GraphLink[],
): Promise<Relationship[]> {
  const nodeMap = await getNodeMap();

  return links.map((link, idx) => {
    const sourceNode = nodeMap.get(link.source);
    const targetNode = nodeMap.get(link.target);

    const actor_id = sourceNode?.id ?? String(link.source);
    const target_id = targetNode?.id ?? String(link.target);

    const actorLabel = sourceNode?.name ?? String(link.source);
    const targetLabel = targetNode?.name ?? String(link.target);

    return {
      id: idx,
      doc_id: actor_id, // generic id, RightSidebar uses neighbor node id for full text
      timestamp: null,
      actor: actorLabel,
      action: link.action ?? link.edge_type ?? 'relationship',
      target: targetLabel,
      location: null,
      tags: [],
      actor_type: sourceNode?.node_type,
      target_type: targetNode?.node_type,
      actor_id,
      target_id,
    };
  });
}

// --- Public API functions ---

export async function fetchStats(): Promise<Stats> {
  const graph = await loadGraph();

  const totalDocumentsCount =
    graph.nodes.filter((n) => n.node_type === 'section').length ||
    graph.nodes.length;

  const totalActorsCount =
    graph.nodes.filter((n) => n.node_type === 'entity' || n.node_type === 'tag').length ||
    graph.nodes.length;

  const totalTriplesCount = graph.links.length;

  const countsByEdgeType: Record<string, number> = {};
  for (const link of graph.links) {
    const key = link.edge_type ?? link.action ?? 'relationship';
    countsByEdgeType[key] = (countsByEdgeType[key] || 0) + 1;
  }

  const categories = Object.entries(countsByEdgeType).map(([category, count]) => ({
    category,
    count,
  }));

  return {
    totalDocuments: { count: totalDocumentsCount },
    totalTriples: { count: totalTriplesCount },
    totalActors: { count: totalActorsCount },
    categories,
  };
}

export async function fetchTagClusters(): Promise<TagCluster[]> {
  const graph = await loadGraph();
  const tagNodes = graph.nodes.filter((n) => n.node_type === 'tag');

  const exemplars = tagNodes.slice(0, 10).map((n) => n.name);

  const clusters: TagCluster[] = [
    {
      id: 1,
      name: 'Tags',
      exemplars,
      tagCount: tagNodes.length,
    },
  ];

  return clusters;
}

export async function fetchRelationships(
  limit: number,
  clusterIds: number[],
  categories: string[],
  yearRange: [number, number],
  includeUndated: boolean,
  keywords: string,
  maxHops: number | null,
): Promise<{ relationships: Relationship[]; totalBeforeLimit: number }> {
  const graph = await loadGraph();

  let links = graph.links;

  if (categories.length > 0) {
    const catSet = new Set(categories);
    links = links.filter((l) => {
      const key = l.edge_type ?? l.action ?? 'relationship';
      return catSet.has(key);
    });
  }

  const allRelationships = await buildRelationshipsFromLinks(links);
  const totalBeforeLimit = allRelationships.length;
  const relationships = allRelationships.slice(0, limit);

  return { relationships, totalBeforeLimit };
}

export async function fetchActorCounts(
  topN: number,
): Promise<Record<string, number>> {
  const graph = await loadGraph();
  const nodeMap = await getNodeMap();

  const degreeByName: Record<string, number> = {};

  for (const link of graph.links) {
    const sourceNode = nodeMap.get(link.source);
    const targetNode = nodeMap.get(link.target);

    const sourceName = sourceNode?.name ?? String(link.source);
    const targetName = targetNode?.name ?? String(link.target);

    degreeByName[sourceName] = (degreeByName[sourceName] || 0) + 1;
    degreeByName[targetName] = (degreeByName[targetName] || 0) + 1;
  }

  const sorted = Object.entries(degreeByName)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN);

  const result: Record<string, number> = {};
  for (const [name, count] of sorted) {
    result[name] = count;
  }

  return result;
}

export async function fetchActorRelationships(
  actorName: string,
  clusterIds: number[],
  categories: string[],
  yearRange: [number, number],
  includeUndated: boolean,
  keywords: string,
  maxHops: number | null,
): Promise<{ relationships: Relationship[]; totalBeforeFilter: number }> {
  const graph = await loadGraph();

  let links = graph.links;

  if (categories.length > 0) {
    const catSet = new Set(categories);
    links = links.filter((l) => {
      const key = l.edge_type ?? l.action ?? 'relationship';
      return catSet.has(key);
    });
  }

  const allRelationships = await buildRelationshipsFromLinks(links);

  const filtered = allRelationships.filter(
    (r) => r.actor === actorName || r.target === actorName,
  );

  const totalBeforeFilter = filtered.length;

  return { relationships: filtered, totalBeforeFilter };
}

export async function searchActors(query: string): Promise<Actor[]> {
  const graph = await loadGraph();

  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: Actor[] = [];

  for (const node of graph.nodes) {
    const name = node.name ?? node.id;
    if (name.toLowerCase().includes(q)) {
      const degree = graph.links.reduce((acc, link) => {
        if (link.source === node.id || link.target === node.id) {
          return acc + 1;
        }
        return acc;
      }, 0);

      matches.push({
        name,
        connection_count: degree,
      });
    }
  }

  matches.sort((a, b) => b.connection_count - a.connection_count);
  return matches.slice(0, 50);
}

export async function fetchActorCount(name: string): Promise<number> {
  const counts = await fetchActorCounts(10000);
  return counts[name] ?? 0;
}

// Node details for right sidebar (section/entity/tag metadata)
export async function fetchNodeDetails(nodeId: string): Promise<GraphNode | null> {
  const graph = await loadGraph();
  const node = graph.nodes.find(n => n.id === nodeId);
  return node ?? null;
}

// Stub document metadata (not heavily used in US Code view)
export async function fetchDocument(docId: string): Promise<Document> {
  return {
    doc_id: docId,
    file_path: '',
    one_sentence_summary: `US Code node ${docId}`,
    paragraph_summary:
      'Details for this node are derived from the US Code network data.',
    category: 'US Code',
    date_range_earliest: null,
    date_range_latest: null,
  };
}

// Full text for a section node
export async function fetchDocumentText(
  docId: string,
): Promise<{ text: string }> {
  const graph = await loadGraph();
  const node = graph.nodes.find(n => n.id === docId);

  if (node && node.node_type === 'section' && node.section_text) {
    return { text: String(node.section_text) };
  }

  return {
    text: 'Full text is not available for this node in this demo.',
  };
}

export { loadGraph };
