// src/types.ts

export type NodeType = 'section' | 'entity' | 'concept';  // Changed 'tag' to 'concept'

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;          // e.g. "section:26-1", "entity:123", "term:income"
  name: string;        // human-readable label
  val: number;         // used for node size (degree) - computed at runtime
  totalVal?: number;   // degree before filtering - computed at runtime
  color?: string;      // computed at runtime based on type + degree
  baseColor?: string;  // computed at runtime
  node_type: NodeType; // Required

  // NEW: Index/Section-specific metadata (from indexes_output.csv)
  index_type?: string;       // 'Index'
  title?: string | null;     // parsed from name (e.g., "26")
  part?: string | null;      // parsed from name
  chapter?: string | null;   // parsed from name
  subchapter?: string | null;// parsed from name
  section?: string | null;   // parsed from name (NOT the same as section_num)
  full_name?: string;        // e.g., "TITLE 26—INTERNAL REVENUE CODE"
  text?: string;             // section text content

  // NEW: Term-specific metadata (from terms_output.csv)
  term_type?: string;        // 'Entity' or 'Concept'

  // LEGACY: Old section fields (keep for backward compatibility)
  section_num?: string | number;
  section_heading?: string | null;
  title_num?: number;
  title_heading?: string | null;
  section_text?: string | null;
  terms?: string | null;
  tags?: string | null;
  aux_verbs?: string | null;

  // LEGACY: Entity-specific metadata
  department?: string | null;
  total_mentions?: number | null;
  entity?: string | null;

  // LEGACY: Tag-specific metadata
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
  source: string | GraphNode;
  target: string | GraphNode;
  action: string;              // e.g., 'defines', 'references', 'part_of'
  location?: string;
  timestamp?: string;

  edge_type: string;           // 'definition', 'reference', 'hierarchy'
  weight?: number;
  count?: number;
  
  // NEW: For definition edges
  definition?: string;         // The actual definition text
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
  actor_id?: string;
  target_id?: string;
  
  // NEW: For definition relationships
  definition?: string;
}

export interface Actor {
  name: string;
  connection_count: number;
}

export interface Stats {
  totalDocuments: { count: number };
  totalTriples: { count: number };
  totalActors: { count: number };
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
  
  // NEW: Add fields from new data structure
  full_name?: string;
  text?: string;
  title?: string | null;
  part?: string | null;
  chapter?: string | null;
  subchapter?: string | null;
  section?: string | null;
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
  searchFields: ('section_text' | 'section_heading' | 'section_num' | 'entity' | 'tag' | 'text' | 'full_name')[];  // Added new fields
  
  // Node type filters
  allowedNodeTypes: ('section' | 'entity' | 'concept')[];  // Changed 'tag' to 'concept'
  
  // Edge type filters
  allowedEdgeTypes: ('definition' | 'reference' | 'hierarchy')[];  // Updated edge types
  
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
