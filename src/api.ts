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

// Stats based on IRS forms network
export async function fetchStats(): Promise<Stats> {
  return {
    totalDocuments: { count: 4422 },  // Total nodes
    totalTriples: { count: 8210 },    // Total links
    totalActors: { count: 4422 },     // All nodes are "actors"
    categories: [
      { category: 'belongs_to', count: 1542 },
      { category: 'cites_section', count: 5216 },
      { category: 'cites_regulation', count: 1452 },
    ],
  };
}

export async function fetchTagClusters(): Promise<TagCluster[]> {
  // Return empty for now - you can populate this later if needed
  return [];
}

export async function loadGraph(): Promise<{ nodes: GraphNode[], links: GraphLink[] }> {
  const res = await fetch(`${import.meta.env.BASE_URL}merged_title26_irs_khop.json`);
  if (!res.ok) {
    throw new Error('Failed to load graph data');
  }
  const raw = (await res.json()) as { nodes: any[]; links: any[] };

  console.log('📊 Loading merged IRS + Title 26 graph...');
  console.log(`Raw data: ${raw.nodes.length} nodes, ${raw.links.length} links`);

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

    // Color assignment with new palette
    let baseColor: string;
    if (n.node_type === 'form') {
      baseColor = '#677CC2'; // blue for forms
    } else if (n.node_type === 'line') {
      baseColor = '#A67EB3'; // lilac for lines
    } else if (n.node_type === 'index') {
      baseColor = '#41378F'; // ink for index nodes (Title 26 + IRS)
    } else if (n.node_type === 'regulation') {
      baseColor = '#88BACE'; // teal for regulations
    } else {
      baseColor = '#AFBBE8'; // fallback steel color
    }

    return {
      id: n.id,
      name: n.name,
      node_type: n.node_type,
      category: n.category, // undefined for index nodes (shared)
      val: degree,
      totalVal: degree,
      amount: n.amount,
      num_forms: n.num_forms,
      properties: {
        full_name: n.full_name,
        text: n.text,
        definition: n.definition,
        ...n.properties,
      },
      full_name: n.full_name,
      text: n.text ?? n.properties?.text, // Title 26 text is in properties.text
      definition: n.definition,
      color: baseColor,
      baseColor,
    };
  });

  const links: GraphLink[] = raw.links.map((l) => {
    const edgeType = l.type || 'reference';
    
    let action: string;
    if (edgeType === 'belongs_to') {
      action = 'belongs to';
    } else if (edgeType === 'cites_section') {
      action = 'cites section';
    } else if (edgeType === 'cites_regulation') {
      action = 'cites regulation';
    } else {
      action = edgeType;
    }

    return {
      source: l.source,
      target: l.target,
      action: action,
      edge_type: edgeType,
      weight: l.weight ?? 1,
      definition: l.definition,
    };
  });

  console.log(`✅ Loaded ${nodes.length} nodes, ${links.length} links`);
  console.log('Node type breakdown:', 
    nodes.reduce((acc, n) => {
      acc[n.node_type] = (acc[n.node_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  );

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

  let filteredLinks = cachedGraph.links;
  if (categories.length > 0) {
    filteredLinks = filteredLinks.filter((link) =>
      categories.includes(link.edge_type)
    );
  }

  const nodeMap = new Map(cachedGraph.nodes.map((n) => [n.id, n]));

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
      definition: link.definition,
      edge_type: link.edge_type,
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

  let relatedLinks = cachedGraph.links.filter((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    return sourceId === actorNode.id || targetId === actorNode.id;
  });

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
      edge_type: link.edge_type,
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
    one_sentence_summary: node ? `${node.node_type} node: ${node.name}` : `Node ${docId}`,
    paragraph_summary: `Details for ${node?.name || docId}${node?.category ? ` (${node.category} taxpayer type)` : ''}`,
    category: node?.node_type || 'unknown',
    date_range_earliest: null,
    date_range_latest: null,
    full_name: node?.full_name,
    text: node?.text,
    form_name: node?.node_type === 'form' ? node.name : undefined,
    line_name: node?.node_type === 'line' ? node.name : undefined,
    section_name: node?.node_type === 'index' ? node.name : undefined, // changed from 'section'
    regulation_name: node?.node_type === 'regulation' ? node.name : undefined,
  };
}

export async function fetchDocumentText(docId: string): Promise<{ text: string }> {
  if (!cachedGraph) {
    await loadGraph();
  }

  const node = cachedGraph?.nodes.find((n) => n.id === docId);
  
  console.log('=== fetchDocumentText DEBUG ===');
  console.log('docId:', docId);
  console.log('node found:', !!node);
  console.log('node.name:', node?.name);
  console.log('node.type:', node?.node_type);
  console.log('node.category:', node?.category);
  
  let text = '';
  
  if (node) {
    text += `**${node.name}**\n\n`;
    text += `Type: ${node.node_type}\n`;
    
    if (node.category) {
      text += `Category: ${node.category} taxpayer\n\n`;
    } else {
      text += '\n';
    }
    
    if (node.node_type === 'line' && (node.amount || node.num_forms)) {
      if (node.amount) {
        text += `Amount: $${node.amount.toLocaleString()}\n`;
      }
      if (node.num_forms) {
        text += `Number of forms: ${node.num_forms.toLocaleString()}\n`;
      }
      text += '\n';
    }
    
    if (node.text) {
      text += `${node.text}\n\n`;
    }
    
    if (node.full_name) {
      text += `Full name: ${node.full_name}\n\n`;
    }
    
    if (node.definition) {
      text += `Definition: ${node.definition}\n\n`;
    }
  }
  
  if (!text) {
    text = 'No text available for this node.';
  }

  console.log('Final text length:', text.length);

  return { text };
}

export async function fetchNodeDetails(nodeId: string): Promise<any> {
  if (!cachedGraph) {
    await loadGraph();
  }

  let node = cachedGraph?.nodes.find((n) => n.id === nodeId);
  
  if (!node) {
    node = cachedGraph?.nodes.find((n) => n.name === nodeId);
  }
  
  if (!node) {
    console.log('❌ Node not found. Searched for:', nodeId);
    console.log('Available nodes sample:', cachedGraph?.nodes.slice(0, 3).map(n => ({ id: n.id, name: n.name })));
    return null;
  }
  
  console.log('✅ Found node:', node.id, node.name, node.node_type, node.category);
  
  return {
    ...node,
    ...(node as any).properties,
  };
}
