// src/services/networkBuilder.ts

import type { GraphNode, GraphLink, NetworkBuilderState, FilteredGraph } from '../types';

export class NetworkBuilder {
  private allNodes: GraphNode[];
  private allLinks: GraphLink[];
  private adjacencyMap: Map<string, Array<{ neighborId: string; edgeType: string }>>;

  constructor(nodes: GraphNode[], links: GraphLink[]) {
    this.allNodes = nodes;
    this.allLinks = links;
    
    // Build adjacency map for O(1) neighbor lookups
    console.log('🔧 Building adjacency map for fast graph traversal...');
    const startTime = performance.now();
    
    this.adjacencyMap = new Map();
    
    links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      const edgeType = link.edge_type;
      
      // Initialize arrays if needed
      if (!this.adjacencyMap.has(sourceId)) {
        this.adjacencyMap.set(sourceId, []);
      }
      if (!this.adjacencyMap.has(targetId)) {
        this.adjacencyMap.set(targetId, []);
      }
      
      // Add bidirectional edges
      this.adjacencyMap.get(sourceId)!.push({ neighborId: targetId, edgeType });
      this.adjacencyMap.get(targetId)!.push({ neighborId: sourceId, edgeType });
    });
    
    console.log(`✅ Adjacency map built in ${(performance.now() - startTime).toFixed(2)}ms`);
    
    const edgeTypeCount = new Map<string, number>();
    links.forEach(link => {
      const count = edgeTypeCount.get(link.edge_type) || 0;
      edgeTypeCount.set(link.edge_type, count + 1);
    });
    console.log('📊 Edge types in graph:', Object.fromEntries(edgeTypeCount));
  }

  /**
   * Multi-field keyword search with case-insensitive matching and AND/OR logic
   * Updated for IRS forms data structure
   */
  searchNodes(searchTerms: string[], searchFields: string[], logic: 'AND' | 'OR' = 'OR'): Set<string> {
    const matchedIds = new Set<string>();
    const normalizedTerms = searchTerms.map(t => t.toLowerCase().trim());

    console.log('Searching for terms:', normalizedTerms);
    console.log('Searching in fields:', searchFields);
    console.log('Search logic:', logic);

    this.allNodes.forEach(node => {
      const searchableValues: string[] = [];
      
      // Collect all searchable string values based on selected fields
      searchFields.forEach(field => {
        let value: any;
        
        switch(field) {
          case 'name':
            value = node.name;
            break;
          case 'full_name':
            value = node.properties?.full_name || node.full_name;
            break;
          case 'definition':
            value = node.properties?.definition || node.definition;
            break;
          case 'text':
            value = node.properties?.text || node.text;
            break;
          default:
            value = (node as any)[field] || node.properties?.[field];
        }

        if (value !== null && value !== undefined) {
          searchableValues.push(String(value).toLowerCase());
        }
      });

      // Apply AND/OR logic
      if (logic === 'OR') {
        const shouldMatch = normalizedTerms.some(term => {
          return searchableValues.some(searchableValue => 
            searchableValue.includes(term)
          );
        });

        if (shouldMatch) {
          matchedIds.add(node.id);
        }
      } else {
        const allTermsMatch = normalizedTerms.every(term => {
          return searchableValues.some(searchableValue => 
            searchableValue.includes(term)
          );
        });

        if (allTermsMatch) {
          matchedIds.add(node.id);
        }
      }
    });

    console.log(`Found ${matchedIds.size} matching nodes using ${logic} logic`);

    if (matchedIds.size > 0) {
      const sampleMatches = Array.from(matchedIds).slice(0, 5);
      console.log('Sample matched node IDs:', sampleMatches);
      console.log('Sample matched nodes:', sampleMatches.map(id => {
        const node = this.allNodes.find(n => n.id === id);
        return { id: node?.id, name: node?.name, type: node?.node_type, category: node?.category };
      }));
    }
    
    return matchedIds;
  }

  /**
   * Filter nodes by type and category (individual/corporation)
   */
  filterByAttributes(
    allowedNodeTypes: string[],
    allowedCategories: string[]
  ): Set<string> {
    const matchedIds = new Set<string>();

    this.allNodes.forEach(node => {
      // ✅ FIXED: Empty array means "allow nothing", not "allow all"
      const typeMatch = allowedNodeTypes.length === 0 ? false : 
                       allowedNodeTypes.includes(node.node_type);
      
      // ✅ FIXED: Empty array means "allow nothing", not "allow all"
      // Exception: Index nodes are category-agnostic and always pass category filter
      const categoryMatch = node.node_type === 'index' || 
                           (allowedCategories.length > 0 && allowedCategories.includes(node.category || ''));

      // Node must match both filters
      if (typeMatch && categoryMatch) {
        matchedIds.add(node.id);
      }
    });

    console.log(`Attribute filter matched ${matchedIds.size} nodes`);
    console.log(`  Type filter: ${allowedNodeTypes.length > 0 ? allowedNodeTypes.join(', ') : 'NONE (blocking all)'}`);
    console.log(`  Category filter: ${allowedCategories.length > 0 ? allowedCategories.join(', ') : 'NONE (blocking all non-index)'}`);
    
    return matchedIds;
  }

  /**
   * Expand from seed nodes by N hops, limiting neighbors per node
   * Optimized using pre-built adjacency map for O(1) lookups
   * ✅ UPDATED: Now supports filtering by edge types including hierarchy and reference
   */
  expandFromSeeds(
    seedIds: Set<string>,
    depth: number,
    maxNeighborsPerNode: number,
    allowedEdgeTypes: string[]
  ): Set<string> {
    const expanded = new Set<string>(seedIds);
    let currentLayer = new Set<string>(seedIds);

    console.log(`🔍 Expanding from ${seedIds.size} seeds, depth=${depth}, allowed edges:`, allowedEdgeTypes);

    for (let i = 0; i < depth; i++) {
      const nextLayer = new Set<string>();

      currentLayer.forEach(nodeId => {
        const neighbors = this.adjacencyMap.get(nodeId) || [];
        
        // ✅ FIXED: Empty allowedEdgeTypes means "no expansion allowed"
        const filteredNeighbors = allowedEdgeTypes.length === 0
          ? [] // No edge types allowed = no expansion
          : neighbors.filter(n => allowedEdgeTypes.includes(n.edgeType));
        
        const limitedNeighbors = maxNeighborsPerNode > 0 
          ? filteredNeighbors.slice(0, maxNeighborsPerNode)
          : filteredNeighbors;

        limitedNeighbors.forEach(({ neighborId }) => {
          if (!expanded.has(neighborId)) {
            nextLayer.add(neighborId);
            expanded.add(neighborId);
          }
        });
      });

      console.log(`  Layer ${i + 1}: added ${nextLayer.size} new nodes (filtered by edge types: ${allowedEdgeTypes.join(', ') || 'NONE'})`);
      currentLayer = nextLayer;
      if (currentLayer.size === 0) break;
    }

    console.log(`Expansion from ${seedIds.size} seeds resulted in ${expanded.size} nodes`);
    return expanded;
  }

  /**
   * Build network from current filter state
   * ✅ UPDATED: Fixed edge type filtering to properly handle empty arrays
   */
  buildNetwork(state: NetworkBuilderState, searchLogic: 'AND' | 'OR' = 'OR', nodeRankingMode: 'global' | 'subgraph' = 'global'): FilteredGraph {
    const startTime = performance.now();
    console.log('🔍 Starting buildNetwork...');
    console.log('Building network with state:', state);
    console.log('Search logic:', searchLogic);
    console.log('Node ranking mode:', nodeRankingMode);
    console.log('Allowed edge types:', state.allowedEdgeTypes);
    
    let candidateNodeIds = new Set<string>();
    let seedNodeIds = new Set<string>();

    // Step 1: Apply keyword search if present
const step1Start = performance.now();
if (state.searchTerms.length > 0 && state.searchFields.length > 0) {
  seedNodeIds = this.searchNodes(state.searchTerms, state.searchFields, searchLogic);
  console.log(`⏱️ Step 1 (searchNodes): ${(performance.now() - step1Start).toFixed(2)}ms`);

  if (seedNodeIds.size === 0) {
    console.warn('No nodes matched the search terms!');
    return {
      nodes: [],
      links: [],
      truncated: false,
      matchedCount: 0
    };
  }
  
  console.log(`Found ${seedNodeIds.size} seed nodes from search`);
  
  // Step 1b: Expand from seed nodes if expansion depth > 0
  const expandStart = performance.now();

  if (state.expansionDepth > 0) {
    console.log(`Expanding ${state.expansionDepth} degree(s) from seed nodes...`);
    candidateNodeIds = this.expandFromSeeds(
      seedNodeIds,
      state.expansionDepth,
      state.maxNodesPerExpansion,
      state.allowedEdgeTypes
    );
    console.log(`⏱️ Step 1b (expandFromSeeds): ${(performance.now() - expandStart).toFixed(2)}ms`);
    
    // ✅ UPDATED: Also filter expanded nodes by type AND category
    if (state.allowedNodeTypes.length > 0 || state.allowedCategories.length > 0) {
      const beforeFilter = candidateNodeIds.size;
      candidateNodeIds = new Set(
        [...candidateNodeIds].filter(id => {
          const node = this.allNodes.find(n => n.id === id);
          if (!node) return false;
          
          // Keep seed nodes regardless (already filtered in Step 2)
          if (seedNodeIds.has(id)) return true;
          
          // Filter expanded nodes by type
          const typeMatch = state.allowedNodeTypes.length === 0 || 
                           state.allowedNodeTypes.includes(node.node_type);
          
          // ✅ NEW: Filter expanded nodes by category
          let categoryMatch = true;
          if (node.node_type === 'form' || node.node_type === 'line') {
            // Forms and lines must match category filter
            categoryMatch = state.allowedCategories.length === 0 || 
                           state.allowedCategories.includes(node.category || '');
          }
          // Index and regulation nodes always pass category check
          
          return typeMatch && categoryMatch;
        })
      );
      console.log(`Filtered expanded nodes by type/category: ${beforeFilter} → ${candidateNodeIds.size}`);
    }
  } else {
    // No expansion, just use the seed nodes
    candidateNodeIds = new Set(seedNodeIds);
  }
} else {
  // Start with all nodes if no search
  candidateNodeIds = new Set(this.allNodes.map(n => n.id));
  console.log('No search terms, starting with all nodes:', candidateNodeIds.size);
}


 // Step 2: Apply attribute filters ONLY to seed nodes, not expanded nodes
const shouldFilterSeeds = state.searchTerms.length > 0 && state.searchFields.length > 0;

if (shouldFilterSeeds) {
  // ✅ UPDATED: Always filter seed nodes by type and category when in search mode
  const seedsAfterFilter = new Set(
    [...seedNodeIds].filter(id => {
      const node = this.allNodes.find(n => n.id === id);
      if (!node) return false;
      
      // ✅ Type must be in allowed list (empty = allow nothing)
      const typeMatch = state.allowedNodeTypes.length > 0 && 
                       state.allowedNodeTypes.includes(node.node_type);
      
      // ✅ FIXED: Category matching
      let categoryMatch = true;
      if (node.node_type === 'form' || node.node_type === 'line') {
        // Forms and lines have categories - must match allowedCategories
        // ✅ CHANGED: No longer allow all if empty - must match specified categories
        categoryMatch = state.allowedCategories.length > 0 && 
                       state.allowedCategories.includes(node.category || '');
      }
      // Index and regulation nodes don't have categories, so they always pass category check
      
      return typeMatch && categoryMatch;
    })
  );
  
  console.log(`Seed nodes after filters: ${seedNodeIds.size} → ${seedsAfterFilter.size}`);
  console.log('Allowed node types:', state.allowedNodeTypes);
  console.log('Allowed categories:', state.allowedCategories);
  
  // ✅ UPDATED: If no seeds pass the filter, return empty result
  if (seedsAfterFilter.size === 0) {
    console.warn('No seed nodes passed the type/category filters');
    return {
      nodes: [],
      links: [],
      truncated: false,
      matchedCount: 0
    };
  }
  
  // Keep all expanded nodes regardless of type/category
  candidateNodeIds = new Set(
    [...candidateNodeIds].filter(id => 
      seedsAfterFilter.has(id) || !seedNodeIds.has(id)
    )
  );
  
  // ✅ Update seedNodeIds to filtered set for expansion
  seedNodeIds = seedsAfterFilter;
  
  console.log(`After applying filters to seeds only: ${candidateNodeIds.size} nodes`);
} else {
  console.log('No node filters applied (not in search mode)');
}



    // Step 3: Build graph with candidate nodes
    console.log(`📊 Total candidate nodes: ${candidateNodeIds.size}`);

    const candidateNodeMap = new Map<string, GraphNode>();
    this.allNodes.forEach(n => {
      if (candidateNodeIds.has(n.id)) {
        candidateNodeMap.set(n.id, n);
      }
    });

    const candidateNodes = Array.from(candidateNodeMap.values());

    // Step 4: Filter links (only between candidate nodes)
    // ✅ FIXED: Empty allowedEdgeTypes now means "show NO edges"
    const candidateLinks = this.allLinks.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      
      // ✅ CRITICAL FIX: If allowedEdgeTypes is empty, NO edges pass
      const edgeTypeMatch = state.allowedEdgeTypes.length > 0 && 
                           state.allowedEdgeTypes.includes(link.edge_type);
      
      return edgeTypeMatch && candidateNodeMap.has(sourceId) && candidateNodeMap.has(targetId);
    });

    const filteredEdgeTypeCount = new Map<string, number>();
    candidateLinks.forEach(link => {
      const count = filteredEdgeTypeCount.get(link.edge_type) || 0;
      filteredEdgeTypeCount.set(link.edge_type, count + 1);
    });
    console.log(`After edge filtering: ${candidateNodes.length} nodes, ${candidateLinks.length} links`);
    console.log('Edge type breakdown:', Object.fromEntries(filteredEdgeTypeCount));

    // ✅ NEW: If no edges are allowed, return only matched seed nodes (disconnected)
    if (state.allowedEdgeTypes.length === 0 && state.expansionDepth === 0) {
      console.log('⚠️ No edge types enabled and depth=0: returning only seed nodes (disconnected)');
      return {
        nodes: candidateNodes,
        links: [],
        truncated: false,
        matchedCount: candidateNodes.length
      };
    }

    // Step 5: Remove isolated nodes (nodes with no edges)
    const nodesWithEdges = new Set<string>();
    candidateLinks.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      nodesWithEdges.add(sourceId);
      nodesWithEdges.add(targetId);
    });

    const connectedNodeIds = new Set(
      candidateNodes.filter(n => nodesWithEdges.has(n.id)).map(n => n.id)
    );

    console.log(`After removing isolates: ${connectedNodeIds.size} connected nodes`);
    console.log(`Removed ${candidateNodes.length - connectedNodeIds.size} isolated nodes`);

    // Step 6: Apply node cap to connected nodes
    const totalMatches = connectedNodeIds.size;
    const truncated = totalMatches > state.maxTotalNodes;

    console.log('=== Node Ranking Decision ===');
    console.log('Connected nodes:', totalMatches);
    console.log('Max allowed:', state.maxTotalNodes);
    console.log('Will truncate?', truncated);
    console.log('Node ranking mode:', nodeRankingMode);

    let finalNodeIds: Set<string>;

    if (truncated) {
      if (nodeRankingMode === 'subgraph') {
        const nodeDegrees = new Map<string, number>();
        
        candidateLinks.forEach(link => {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          
          nodeDegrees.set(sourceId, (nodeDegrees.get(sourceId) || 0) + 1);
          nodeDegrees.set(targetId, (nodeDegrees.get(targetId) || 0) + 1);
        });
        
        const topNodes = Array.from(connectedNodeIds)
          .filter(nodeId => nodeDegrees.has(nodeId))
          .sort((a, b) => (nodeDegrees.get(b) || 0) - (nodeDegrees.get(a) || 0))
          .slice(0, state.maxTotalNodes);
        
        finalNodeIds = new Set(topNodes);
        console.log(`🔝 Selected top ${finalNodeIds.size} nodes by SUBGRAPH degree`);
        
      } else {
        finalNodeIds = new Set(this.selectTopNodesByDegree(connectedNodeIds, state.maxTotalNodes));
        console.log(`🔝 Selected top ${finalNodeIds.size} nodes by GLOBAL degree`);
      }
    } else {
      finalNodeIds = connectedNodeIds;
    }

    console.log(`Final node count after cap: ${finalNodeIds.size} (truncated: ${truncated}, max: ${state.maxTotalNodes})`);

    // Step 7: Build final nodes and links with capped set
    const selectedNodeMap = new Map<string, GraphNode>();
    this.allNodes.forEach(n => {
      if (finalNodeIds.has(n.id)) {
        selectedNodeMap.set(n.id, n);
      }
    });

    const nodes = Array.from(selectedNodeMap.values());

    const links = candidateLinks.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return selectedNodeMap.has(sourceId) && selectedNodeMap.has(targetId);
    });

    console.log(`Built graph with ${nodes.length} nodes and ${links.length} links`);

    // Step 8: Compute colors by node type and degree
    console.log('🎨 Computing colors for IRS forms graph...');

    const colorStart = performance.now();

    const nodeDegree = new Map<string, number>();
    links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      nodeDegree.set(sourceId, (nodeDegree.get(sourceId) || 0) + 1);
      nodeDegree.set(targetId, (nodeDegree.get(targetId) || 0) + 1);
    });

    nodes.forEach(node => {
      node.val = nodeDegree.get(node.id) || 1;
      node.totalVal = node.val;
    });

    const maxVal = Math.max(...nodes.map(n => n.val || 1), 1);
    const strength = (v: number) => Math.pow(v / maxVal, 0.6);

    const formColorScale = (t: number) => {
      const r1 = 0xD9, g1 = 0xEE, b1 = 0xF5;
      const r2 = 0x88, g2 = 0xBA, b2 = 0xCE;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r}, ${g}, ${b})`;
    };

    const lineColorScale = (t: number) => {
      const r1 = 0xD9, g1 = 0x9B, b1 = 0xC9;
      const r2 = 0x9C, g2 = 0x33, b2 = 0x91;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r}, ${g}, ${b})`;
    };

    const indexColorScale = (t: number) => {
      const r1 = 0x9B, g1 = 0x8B, b1 = 0xCC;
      const r2 = 0x41, g2 = 0x37, b2 = 0x8F;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r}, ${g}, ${b})`;
    };

    const regulationColorScale = (t: number) => {
      const r1 = 0xD9, g1 = 0xC6, b1 = 0xE3;
      const r2 = 0xA6, g2 = 0x7E, b2 = 0xB3;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r}, ${g}, ${b})`;
    };

    nodes.forEach(node => {
      const t = strength(node.val || 1);
      let color: string;

      if (node.node_type === 'form') {
        color = formColorScale(t);
      } else if (node.node_type === 'line') {
        color = lineColorScale(t);
      } else if (node.node_type === 'index') {
        color = indexColorScale(t);
      } else if (node.node_type === 'regulation') {
        color = regulationColorScale(t);
      } else {
        color = '#AFBBE8';
      }

      node.color = color;
      node.baseColor = color;
    });

    console.log(`⏱️ Step 8 (color computation): ${(performance.now() - colorStart).toFixed(2)}ms`);
    console.log('🎨 Color computation complete. Sample colored nodes:');

    console.log(nodes.slice(0, 5).map(n => ({
      id: n.id,
      name: n.name,
      type: n.node_type,
      category: n.category,
      degree: n.val,
      color: n.color
    })));

    console.log(`⏱️ TOTAL buildNetwork time: ${(performance.now() - startTime).toFixed(2)}ms`);

    return {
      nodes: nodes,
      links,
      truncated: truncated,
      matchedCount: totalMatches
    };
  }

  private selectTopNodesByDegree(nodeIds: Set<string>, maxNodes: number): string[] {
    const nodeDegrees = new Map<string, number>();
    
    nodeIds.forEach(nodeId => {
      const neighbors = this.adjacencyMap.get(nodeId) || [];
      nodeDegrees.set(nodeId, neighbors.length);
    });
    
    const result = Array.from(nodeDegrees.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxNodes)
      .map(([nodeId]) => nodeId);
    
    console.log(`🔝 selectTopNodesByDegree: requested ${maxNodes}, returning ${result.length}`);
    
    return result;
  }
}
