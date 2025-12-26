// src/types.ts

export type NodeType = 'form' | 'line' | 'index' | 'regulation'; // ✅ CHANGED: 'section' → 'index'

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;          // e.g. "form:individual:1040", "line:corporation:Form_1120_Line_1", "index:26_USC_162"
  name: string;        // human-readable label (e.g., "Form 1040", "26 USC 162")
  val?: number;         // used for node size (degree) - computed at runtime
  totalVal?: number;   // degree before filtering - computed at runtime
  color?: string;      // computed at runtime based on type + degree
  baseColor?: string;  // computed at runtime
  node_type: NodeType; // Required: 'form' | 'line' | 'index' | 'regulation'

  // IRS Forms-specific metadata
  category?: 'individual' | 'corporation'; // ✅ UPDATED: Optional (index nodes don't have category)
  
  // Line-specific properties
  amount?: number;      // ✅ NEW: dollar amount for line items
  num_forms?: number;   // ✅ NEW: number of forms with this line
  amount_per_form?: number | null;
  total_amount?: number | null;
  total_num_forms?: number | null;
  num_lines?: number;

  // Properties object containing additional data
  properties?: {
    full_name?: string;
    text?: string;
    definition?: string;
    embedding?: number[];
    [key: string]: any;        // Allow any other properties
  };

  // Legacy display properties (can be populated from properties if needed)
  display_label?: string | null;
  full_name?: string;
  text?: string;
  definition?: string;

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
  edge_type: 'belongs_to' | 'cites_section' | 'cites_regulation'; // Note: 'cites_section' still refers to USC sections (index nodes)
  action?: string;              // Optional: 'belongs to', 'cites', etc.
  
  // Optional edge properties
  definition?: string;
  location?: string;
  timestamp?: string;
  weight?: number;
  count?: number;
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
  actor_category?: 'individual' | 'corporation'; // ✅ NEW: for filtering
  target_category?: 'individual' | 'corporation'; // ✅ NEW: for filtering
  
  definition?: string;    // For definition relationships
  edge_type?: string;     // ✅ ADDED: type of edge for filtering
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
  
  // IRS Forms fields
  full_name?: string;
  text?: string;
  form_name?: string;
  line_name?: string;
  section_name?: string;
  regulation_name?: string;
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
  searchFields: ('name' | 'full_name' | 'definition' | 'text')[]; // ✅ UPDATED: Simplified for IRS forms
  
  // Node type filters
  allowedNodeTypes: ('form' | 'line' | 'index' | 'regulation')[]; // ✅ UPDATED: 'section' → 'index'
  
  // Edge type filters
  allowedEdgeTypes: ('belongs_to' | 'cites_section' | 'cites_regulation')[]; // Note: edge names unchanged (they still reference sections)
  
  // Category filter (individual vs corporation)
  allowedCategories: ('individual' | 'corporation')[]; // ✅ NEW: taxpayer type filter
  
  // Form-specific filters (for future use)
  allowedForms: string[]; // e.g., ['Form 1040', 'Form 1120']
  
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
