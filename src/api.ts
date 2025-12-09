// src/api.ts

import type { 
  Stats, 
  Relationship, 
  Actor, 
  TagCluster, 
  GraphData, 
  GraphNode, 
  GraphLink,
  Document 
} from './types';

let cachedGraph: GraphData | null = null;

// Mock stats (you can update this based on your actual data later)
export async function fetchStats(): Promise<Stats> {
  return {
    totalDocuments: { count: 9718 },  // Number of index nodes
    totalTriples: { count: 44967 },   // Total links
    totalActors: { count: 9292 },     // Number of term nodes
    categories: [
      { category: 'definition', count: 478 },
      { category: 'reference', count: 34772 },
      { category: 'hierarchy', count: 9717 },
    ],
  };
}

export async function fetchTagClusters(): Promise<TagCluster[]> {
  // Return empty for now - you can populate this later if needed
  return [];
}

export async function loadGraph(): Promise<GraphData> {
  const res = await fetch('/title26_graph.json');
  if (!res.ok) {
    throw new Error('Failed to load graph data');
  }
  const raw = (await res.json()) as { nodes: any[]; links: any[] };

  // Compute degree for each node
  const degreeMap = new Map<string, number>();
  raw.links.forEach((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + 1);
    degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1);
  });

  const maxDegree = Math.max(...Array.from(degreeMap.values()), 1);

  // Build nodes with colors based on type and degree
  const nodes: GraphNode[] = raw.nodes.map((n) => {
    const degree = degreeMap.get(n.id) || 0;
    const normalizedDegree = degree / maxDegree;

    let baseColor: string;
    if (n.node_type === 'section') {
      baseColor = '#3b82f6'; // blue for sections
    } else if (n.node_type === 'entity') {
      baseColor = '#f97316'; // orange for entities
    } else {
      baseColor = '#a855f7'; // purple for concepts (was tags)
    }

    return {
      id: n.id,
      name: n.name,
      node_type: n.node_type,
      val: degree,
      totalVal: degree,
      
      // New index/section fields
      index_type: n.index_type,
      title: n.title,
      part: n.part,
      chapter: n.chapter,
      subchapter: n.subchapter,
      section: n.section,
      full_name: n.full_name,
      text: n.text,
      
      // New term fields
      term_type: n.term_type,
      
      // Legacy fields (for backward compatibility)
      section_num: n.section_num,
      section_heading: n.section_heading,
      section_text: n.text,  // Map 'text' to 'section_text' for compatibility
      title_num: n.title ? parseInt(n.title) : undefined,
      title_heading: n.title_heading,
      department: n.department ?? null,
      total_mentions: n.total_mentions ?? null,
      entity: n.entity ?? null,
      tag: n.tag ?? null,
      tags: n.tags ?? null,
      terms: n.terms ?? null,
      
      color: baseColor,
      baseColor,
    };
  });

  const links: GraphLink[] = raw.links.map((l) => {
    const edgeType = l.edge_type ?? 'reference';
    return {
      source: l.source,
      target: l.target,
      action: l.action || edgeType,
      edge_type: edgeType,
      weight: l.weight ?? 1,
      definition: l.definition,  // Include definition text if present
    };
  });

  cachedGraph = { nodes, links };
  return cachedGraph;
}

export async function fetchRelationships(
  limit: number,
  clusterIds: number[],
  categories: string[],
  yearRange: [number, number],
  includeUndated: boolean,
  keywords: string,
  maxHops: number | null
): Promise<{ relationships: Relationship[]; totalBeforeLimit: number }> {
  if (!cachedGraph) {
    await loadGraph();
  }

  if (!cachedGraph) {
    return { relationships: [], totalBeforeLimit: 0 };
  }

  // Filter links by categories (edge types)
  let filteredLinks = cachedGraph.links;
  if (categories.length > 0) {
    filteredLinks = filteredLinks.filter((link) =>
      categories.includes(link.edge_type)
    );
  }

  // Build node map for lookups
  const nodeMap = new Map(cachedGraph.nodes.map((n) => [n.id, n]));

  // Convert links to relationships
  const relationships: Relationship[] = filteredLinks.slice(0, limit).map((link, idx) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);

    return {
      id: idx,
      doc_id: sourceId,
      timestamp: link.timestamp || null,
      actor: sourceNode?.name || sourceId,
      action: link.action,
      target: targetNode?.name || targetId,
      location: link.location || null,
      tags: [],
      actor_type: sourceNode?.node_type,
      target_type: targetNode?.node_type,
      actor_id: sourceId,
      target_id: targetId,
      definition: link.definition,  // Include definition if present
    };
  });

  return {
    relationships,
    totalBeforeLimit: filteredLinks.length,
  };
}

export async function fetchActorRelationships(
  actorName: string,
  clusterIds: number[],
  categories: string[],
  yearRange: [number, number],
  includeUndated: boolean,
  keywords: string,
  maxHops: number | null
): Promise<{ relationships: Relationship[]; totalBeforeFilter: number }> {
  if (!cachedGraph) {
    await loadGraph();
  }

  if (!cachedGraph) {
    return { relationships: [], totalBeforeFilter: 0 };
  }

  const nodeMap = new Map(cachedGraph.nodes.map((n) => [n.id, n]));
  const actorNode = Array.from(nodeMap.values()).find((n) => n.name === actorName);

  if (!actorNode) {
    return { relationships: [], totalBeforeFilter: 0 };
  }

  // Find all links involving this node
  let relatedLinks = cachedGraph.links.filter((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    return sourceId === actorNode.id || targetId === actorNode.id;
  });

  // Filter by categories
  if (categories.length > 0) {
    relatedLinks = relatedLinks.filter((link) =>
      categories.includes(link.edge_type)
    );
  }

  const relationships: Relationship[] = relatedLinks.map((link, idx) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);

    return {
      id: idx,
      doc_id: sourceId,
      timestamp: link.timestamp || null,
      actor: sourceNode?.name || sourceId,
      action: link.action,
      target: targetNode?.name || targetId,
      location: link.location || null,
      tags: [],
      actor_type: sourceNode?.node_type,
      target_type: targetNode?.node_type,
      actor_id: sourceId,
      target_id: targetId,
      definition: link.definition,
    };
  });

  return {
    relationships,
    totalBeforeFilter: relatedLinks.length,
  };
}

export async function fetchActorCounts(limit: number): Promise<Record<string, number>> {
  if (!cachedGraph) {
    await loadGraph();
  }

  if (!cachedGraph) {
    return {};
  }

  const counts: Record<string, number> = {};
  cachedGraph.nodes.forEach((node) => {
    counts[node.name] = node.val || 0;
  });

  return counts;
}

export async function searchActors(query: string): Promise<Actor[]> {
  if (!cachedGraph) {
    await loadGraph();
  }

  if (!cachedGraph) {
    return [];
  }

  const lowerQuery = query.toLowerCase();
  const matches = cachedGraph.nodes
    .filter((node) => node.name.toLowerCase().includes(lowerQuery))
    .map((node) => ({
      name: node.name,
      connection_count: node.val || 0,
    }))
    .sort((a, b) => b.connection_count - a.connection_count)
    .slice(0, 20);

  return matches;
}

export async function fetchDocument(docId: string): Promise<Document> {
  if (!cachedGraph) {
    await loadGraph();
  }

  const node = cachedGraph?.nodes.find((n) => n.id === docId);

  return {
    doc_id: docId,
    file_path: '',
    one_sentence_summary: `US Code node ${docId}`,
    paragraph_summary: 'Details for this node are derived from the US Code network data.',
    category: 'US Code',
    date_range_earliest: null,
    date_range_latest: null,
    full_name: node?.full_name,
    text: node?.text,
    title: node?.title,
    part: node?.part,
    chapter: node?.chapter,
    subchapter: node?.subchapter,
    section: node?.section,
  };
}

export async function fetchDocumentText(docId: string): Promise<{ text: string }> {
  if (!cachedGraph) {
    await loadGraph();
  }

  const node = cachedGraph?.nodes.find((n) => n.id === docId);
  
  // Use 'text' field, fallback to 'section_text' for compatibility
  const text = node?.text || node?.section_text || 'No text available for this node.';

  return { text };
}

export async function fetchNodeDetails(nodeId: string): Promise<any> {
  if (!cachedGraph) {
    await loadGraph();
  }

  const node = cachedGraph?.nodes.find((n) => n.id === nodeId);
  return node || null;
}
