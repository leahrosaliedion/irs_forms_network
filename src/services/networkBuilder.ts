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
            // Primary name field - always search this
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
            // Allow searching custom properties
            value = (node as any)[field] || node.properties?.[field];
        }

        if (value !== null && value !== undefined) {
          searchableValues.push(String(value).toLowerCase());
        }
      });

      // Apply AND/OR logic
      if (logic === 'OR') {
        // OR logic: match if ANY term appears in ANY searchable value
        const shouldMatch = normalizedTerms.some(term => {
          return searchableValues.some(searchableValue => 
            searchableValue.includes(term)
          );
        });

        if (shouldMatch) {
          matchedIds.add(node.id);
        }
      } else {
        // AND logic: match if ALL terms appear (in ANY of the searchable values)
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

    // Show sample matched nodes
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
      // Type filter - if empty, allow all
      const typeMatch = allowedNodeTypes.length === 0 || 
                       allowedNodeTypes.includes(node.node_type);
      
      // Category filter - if empty, allow all
      const categoryMatch = allowedCategories.length === 0 || 
                           allowedCategories.includes(node.category);

      // Node must match both filters (if active)
      if (typeMatch && categoryMatch) {
        matchedIds.add(node.id);
      }
    });

    console.log(`Attribute filter matched ${matchedIds.size} nodes`);
    console.log(`  Type filter: ${allowedNodeTypes.length > 0 ? allowedNodeTypes.join(', ') : 'none'}`);
    console.log(`  Category filter: ${allowedCategories.length > 0 ? allowedCategories.join(', ') : 'none'}`);
    
    return matchedIds;
  }

  /**
   * Expand from seed nodes by N hops, limiting neighbors per node
   * Optimized using pre-built adjacency map for O(1) lookups
   */
  expandFromSeeds(
    seedIds: Set<string>,
    depth: number,
    maxNeighborsPerNode: number,
    allowedEdgeTypes: string[]
  ): Set<string> {
    const expanded = new Set<string>(seedIds);
    let currentLayer = new Set<string>(seedIds);

    for (let i = 0; i < depth; i++) {
      const nextLayer = new Set<string>();

      currentLayer.forEach(nodeId => {
        // O(1) lookup instead of filtering all links
        const neighbors = this.adjacencyMap.get(nodeId) || [];
        
        // Filter by edge type if specified
        const filteredNeighbors = allowedEdgeTypes.length === 0
          ? neighbors
          : neighbors.filter(n => allowedEdgeTypes.includes(n.edgeType));
        
        // Limit neighbors if needed
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

      currentLayer = nextLayer;
      if (currentLayer.size === 0) break;
    }

    console.log(`Expansion from ${seedIds.size} seeds resulted in ${expanded.size} nodes`);
    return expanded;
  }

  /**
   * Build network from current filter state
   */
  buildNetwork(state: NetworkBuilderState, searchLogic: 'AND' | 'OR' = 'OR', nodeRankingMode: 'global' | 'subgraph' = 'global'): FilteredGraph {
    const startTime = performance.now();
    console.log('🔍 Starting buildNetwork...');
    console.log('Building network with state:', state);
    console.log('Search logic:', searchLogic);
    console.log('Node ranking mode:', nodeRankingMode);
    
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

    if (shouldFilterSeeds && (state.allowedNodeTypes.length > 0 || state.allowedCategories.length > 0)) {
      // Filter only the seed nodes by type and category
      const seedsAfterFilter = new Set(
        [...seedNodeIds].filter(id => {
          const node = this.allNodes.find(n => n.id === id);
          if (!node) return false;
          
          const typeMatch = state.allowedNodeTypes.length === 0 || 
                           state.allowedNodeTypes.includes(node.node_type);
          const categoryMatch = state.allowedCategories.length === 0 || 
                               state.allowedCategories.includes(node.category);
          
          return typeMatch && categoryMatch;
        })
      );
      
      console.log(`Seed nodes after filters: ${seedNodeIds.size} → ${seedsAfterFilter.size}`);
      
      // Keep all expanded nodes regardless of type/category
      candidateNodeIds = new Set(
        [...candidateNodeIds].filter(id => 
          seedsAfterFilter.has(id) || !seedNodeIds.has(id)
        )
      );
      
      console.log(`After applying filters to seeds only: ${candidateNodeIds.size} nodes`);
    } else {
      console.log('No node filters applied');
    }

    // Step 3: Build graph with candidate nodes
    console.log(`📊 Total candidate nodes: ${candidateNodeIds.size}`);

    // Create Map for O(1) lookup
    const candidateNodeMap = new Map<string, GraphNode>();
    this.allNodes.forEach(n => {
      if (candidateNodeIds.has(n.id)) {
        candidateNodeMap.set(n.id, n);
      }
    });

    const candidateNodes = Array.from(candidateNodeMap.values());

    // Step 4: Filter links (only between candidate nodes)
    const candidateLinks = this.allLinks.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      
      const edgeTypeMatch = state.allowedEdgeTypes.length === 0 || 
                           state.allowedEdgeTypes.includes(link.edge_type);
      
      return edgeTypeMatch && candidateNodeMap.has(sourceId) && candidateNodeMap.has(targetId);
    });

    console.log(`After edge filtering: ${candidateNodes.length} nodes, ${candidateLinks.length} links`);

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
        // SUBGRAPH MODE: Rank by degree in filtered candidate graph
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
        // GLOBAL MODE: Rank by degree in full graph
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

    // Compute degree (number of connections) for each node
    const nodeDegree = new Map<string, number>();
    links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      nodeDegree.set(sourceId, (nodeDegree.get(sourceId) || 0) + 1);
      nodeDegree.set(targetId, (nodeDegree.get(targetId) || 0) + 1);
    });

    // Set val to degree for each node
    nodes.forEach(node => {
      node.val = nodeDegree.get(node.id) || 1;
      node.totalVal = node.val;
    });

    // Find max degree for scaling
    const maxVal = Math.max(...nodes.map(n => n.val || 1), 1);

    // Create strength function (0 to 1 based on connections)
    const strength = (v: number) => Math.pow(v / maxVal, 0.6); // Lower exponent = more dramatic gradient

// Color scales for IRS forms node types - EXPANDED gradients
const formColorScale = (t: number) => {
  // Teal gradient for forms
  const r1 = 0xD9, g1 = 0xEE, b1 = 0xF5; // Very light teal
  const r2 = 0x88, g2 = 0xBA, b2 = 0xCE; // Teal
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
};

const lineColorScale = (t: number) => {
  // Magenta gradient for lines
  const r1 = 0xD9, g1 = 0x9B, b1 = 0xC9; // Very light magenta
  const r2 = 0x9C, g2 = 0x33, b2 = 0x91; // Magenta
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
};

const indexColorScale = (t: number) => {
  // Ink gradient for index nodes
  const r1 = 0x9B, g1 = 0x8B, b1 = 0xCC; // Very light purple
  const r2 = 0x41, g2 = 0x37, b2 = 0x8F; // Ink
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
};

const regulationColorScale = (t: number) => {
  // Lilac gradient for regulations
  const r1 = 0xD9, g1 = 0xC6, b1 = 0xE3; // Very light lilac
  const r2 = 0xA6, g2 = 0x7E, b2 = 0xB3; // Lilac
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
};


// Apply colors to each node based on type and degree strength
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
    color = '#AFBBE8'; // fallback steel color
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

  /**
   * Select top N nodes by degree (number of connections)
   * This maintains graph connectivity when applying node caps
   */
  private selectTopNodesByDegree(nodeIds: Set<string>, maxNodes: number): string[] {
    const nodeDegrees = new Map<string, number>();
    
    // Count connections for each candidate node
    nodeIds.forEach(nodeId => {
      const neighbors = this.adjacencyMap.get(nodeId) || [];
      nodeDegrees.set(nodeId, neighbors.length);
    });
    
    // Sort by degree descending and take top N
    const result = Array.from(nodeDegrees.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxNodes)
      .map(([nodeId]) => nodeId);
    
    console.log(`🔝 selectTopNodesByDegree: requested ${maxNodes}, returning ${result.length}`);
    
    return result;
  }
}
