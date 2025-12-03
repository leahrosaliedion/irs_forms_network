// src/types.ts

export type NodeType = 'section' | 'entity' | 'tag';

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;          // e.g. "section:26-1", "entity:123", "tag:income tax"
  name: string;        // human-readable label (e.g. section_num, entity name, tag)
  val: number;         // used for node size (degree)
  totalVal?: number;   // degree before filtering
  color?: string;
  baseColor?: string;
  node_type: NodeType; // Made required for proper typing

  // Section-specific metadata (optional for non-section nodes)
  section_num?: string | number;
  section_heading?: string | null;
  title?: string | number;
  title_num?: number;  // Added for title filtering
  title_heading?: string | null;
  terms?: string | null;
  tags?: string | null;
  aux_verbs?: string | null;
  section_text?: string | null;

  // Entity-specific metadata (optional for non-entity nodes)
  department?: string | null;
  total_mentions?: number | null;
  entity?: string | null;

  // Tag-specific metadata
  tag?: string | null;

  // D3 simulation properties (from d3.SimulationNodeDatum)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;  // Updated to allow both string and object (D3 transforms these)
  target: string | GraphNode;  // Updated to allow both string and object
  action: string;              // used in UI; mirrors edge_type
  location?: string;
  timestamp?: string;

  edge_type: string;           // Made required: 'citation' | 'section_entity' | 'section_tag', etc.
  weight?: number;
  count?: number;              // Added for aggregated edge counts
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Relationship objects for lists / right sidebar.
export interface Relationship {
  id: number;
  doc_id: string;
  timestamp: string | null;
  actor: string;          // label of source node
  action: string;
  target: string;         // label of target node
  location: string | null;
  tags: string[];

  actor_type?: NodeType;
  target_type?: NodeType;
  actor_id?: string;      // underlying node id, e.g. "section:26-1"
  target_id?: string;
}

export interface Actor {
  name: string;
  connection_count: number;
}

export interface Stats {
  totalDocuments: { count: number }; // e.g. total sections
  totalTriples: { count: number };   // total links
  totalActors: { count: number };    // e.g. total entities + tags
  categories: { category: string; count: number }[];
}

export interface Document {
  doc_id: string;
  file_path: string;
  one_sentence_summary: string;
  paragraph_summary: string;
  category: string;
  date_range_earliest: string | null;
  date_range_latest: string | null;
}

export interface TagCluster {
  id: number;
  name: string;
  exemplars: string[];
  tagCount: number;
}

export interface NetworkBuilderState {
  // Keyword search
  searchTerms: string[];
  searchFields: ('section_text' | 'section_heading' | 'section_num' | 'entity' | 'tag')[];
  
  // Node type filters
  allowedNodeTypes: ('section' | 'entity' | 'tag')[];
  
  // Edge type filters
  allowedEdgeTypes: ('citation' | 'section_entity' | 'section_tag')[];
  
  // Title/section filters
  allowedTitles: number[];
  allowedSections: string[];
  
  // Expansion settings
  seedNodeIds: string[];
  expansionDepth: number;
  maxNodesPerExpansion: number;
  
  // Overall cap
  maxTotalNodes: number;
}

export interface FilteredGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  truncated: boolean;
  matchedCount: number;
}
