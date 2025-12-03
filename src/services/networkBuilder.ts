// src/services/networkBuilder.ts

import type { GraphNode, GraphLink, NetworkBuilderState, FilteredGraph } from '../types';

export class NetworkBuilder {
  private allNodes: GraphNode[];
  private allLinks: GraphLink[];

  constructor(nodes: GraphNode[], links: GraphLink[]) {
    this.allNodes = nodes;
    this.allLinks = links;
    
    // Debug: log what we're working with
    console.log('NetworkBuilder initialized with:', {
      nodeCount: nodes.length,
      linkCount: links.length,
      sampleNode: nodes[0],
      nodeFields: nodes[0] ? Object.keys(nodes[0]) : []
    });
  }

  /**
 * Multi-field keyword search with case-insensitive matching and AND/OR logic
 */
searchNodes(searchTerms: string[], searchFields: string[], logic: 'AND' | 'OR' = 'OR'): Set<string> {
  const matchedIds = new Set<string>();
  const normalizedTerms = searchTerms.map(t => t.toLowerCase().trim());

  console.log('Searching for terms:', normalizedTerms);
  console.log('Searching in fields:', searchFields);
  console.log('Search logic:', logic);

  this.allNodes.forEach(node => {
    if (logic === 'OR') {
      // OR logic: match if ANY term appears in ANY field
      const shouldMatch = normalizedTerms.some(term => {
        return searchFields.some(field => {
          let value: any;
          
          switch(field) {
            case 'section_text':
              value = node.section_text;
              break;
            case 'section_heading':
              value = node.section_heading;
              break;
            case 'section_num':
              value = node.section_num;
              break;
            case 'entity':
              value = node.node_type === 'entity' ? (node.entity || node.name) : null;
              break;
            case 'tag':
              value = node.node_type === 'tag' ? (node.tag || node.name) : null;
              break;
            default:
              value = (node as any)[field];
          }

          if (value === null || value === undefined) {
            return false;
          }

          const stringValue = String(value).toLowerCase();
          return stringValue.includes(term);
        });
      });

      if (shouldMatch) {
        matchedIds.add(node.id);
      }
    } else {
      // AND logic: match if ALL terms appear (in ANY of the allowed fields)
      const allTermsMatch = normalizedTerms.every(term => {
        return searchFields.some(field => {
          let value: any;
          
          switch(field) {
            case 'section_text':
              value = node.section_text;
              break;
            case 'section_heading':
              value = node.section_heading;
              break;
            case 'section_num':
              value = node.section_num;
              break;
            case 'entity':
              value = node.node_type === 'entity' ? (node.entity || node.name) : null;
              break;
            case 'tag':
              value = node.node_type === 'tag' ? (node.tag || node.name) : null;
              break;
            default:
              value = (node as any)[field];
          }

          if (value === null || value === undefined) {
            return false;
          }

          const stringValue = String(value).toLowerCase();
          return stringValue.includes(term);
        });
      });

      if (allTermsMatch) {
        matchedIds.add(node.id);
      }
    }
  });

  console.log(`Found ${matchedIds.size} matching nodes using ${logic} logic`);
  return matchedIds;
}


  /**
   * Filter nodes by type, title, or section
   */
  filterByAttributes(
    allowedNodeTypes: string[],
    allowedTitles: number[],
    allowedSections: string[]
  ): Set<string> {
    const matchedIds = new Set<string>();

    this.allNodes.forEach(node => {
      // Type filter - if empty, allow all
      const typeMatch = allowedNodeTypes.length === 0 || 
                       allowedNodeTypes.includes(node.node_type);
      
      // Title filter - if empty, allow all
      const titleMatch = allowedTitles.length === 0 || 
                        (node.node_type === 'section' && 
                         node.title_num && 
                         allowedTitles.includes(node.title_num));
      
      // Section number filter - if empty, allow all
      const sectionMatch = allowedSections.length === 0 || 
                          (node.section_num && 
                           allowedSections.some(s => 
                             String(node.section_num).toLowerCase().includes(String(s).toLowerCase())
                           ));

      // If type filter is active, use it; otherwise check title/section
      if (allowedNodeTypes.length > 0) {
        if (typeMatch) {
          matchedIds.add(node.id);
        }
      } else {
        // No type filter, so check title and section
        if (allowedTitles.length === 0 && allowedSections.length === 0) {
          // No filters at all, include everything
          matchedIds.add(node.id);
        } else if (titleMatch || sectionMatch) {
          matchedIds.add(node.id);
        }
      }
    });

    console.log(`Attribute filter matched ${matchedIds.size} nodes`);
    return matchedIds;
  }

  /**
   * Expand from seed nodes by N hops, limiting neighbors per node
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
        // Find edges connected to this node
        const connectedEdges = this.allLinks.filter(link => {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          
          const edgeTypeMatch = allowedEdgeTypes.length === 0 || 
                               allowedEdgeTypes.includes(link.edge_type);
          return edgeTypeMatch && (sourceId === nodeId || targetId === nodeId);
        });

        // Limit neighbors if needed
        const limitedEdges = maxNeighborsPerNode > 0 
          ? connectedEdges.slice(0, maxNeighborsPerNode)
          : connectedEdges;

        limitedEdges.forEach(edge => {
          const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
          const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
          const neighborId = sourceId === nodeId ? targetId : sourceId;
          
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
  buildNetwork(state: NetworkBuilderState, searchLogic: 'AND' | 'OR' = 'OR'): FilteredGraph {
    console.log('Building network with state:', state);
    console.log('Search logic:', searchLogic);
    
    let candidateNodeIds = new Set<string>();
    let seedNodeIds = new Set<string>();

    // Step 1: Apply keyword search if present
    if (state.searchTerms.length > 0 && state.searchFields.length > 0) {
      seedNodeIds = this.searchNodes(state.searchTerms, state.searchFields, searchLogic);
      
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
      if (state.expansionDepth > 0) {
        console.log(`Expanding ${state.expansionDepth} degree(s) from seed nodes...`);
        candidateNodeIds = this.expandFromSeeds(
          seedNodeIds,
          state.expansionDepth,
          state.maxNodesPerExpansion,
          state.allowedEdgeTypes
        );
      } else {
        // No expansion, just use the seed nodes
        candidateNodeIds = new Set(seedNodeIds);
      }
    } else {
      // Start with all nodes if no search
      candidateNodeIds = new Set(this.allNodes.map(n => n.id));
      console.log('No search terms, starting with all nodes:', candidateNodeIds.size);
    }

    // Step 2: Apply attribute filters (node types)
    const attributeMatches = this.filterByAttributes(
      state.allowedNodeTypes,
      state.allowedTitles,
      state.allowedSections
    );

    // Intersect with search/expansion results only if filters are active
    if (state.allowedNodeTypes.length > 0) {
      const beforeAttributeFilter = candidateNodeIds.size;
      candidateNodeIds = new Set(
        [...candidateNodeIds].filter(id => attributeMatches.has(id))
      );
      console.log(`After node type filter: ${beforeAttributeFilter} → ${candidateNodeIds.size} nodes`);
    }

    // Step 3: Apply node cap
    const totalMatches = candidateNodeIds.size;
    const truncated = totalMatches > state.maxTotalNodes;
    const finalNodeIds = truncated 
      ? new Set([...candidateNodeIds].slice(0, state.maxTotalNodes))
      : candidateNodeIds;

    console.log(`Final node count: ${finalNodeIds.size} (truncated: ${truncated})`);

    // Step 4: Build filtered graph with edges
    const nodes = this.allNodes.filter(n => finalNodeIds.has(n.id));
    const links = this.allLinks.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      
      const edgeTypeMatch = state.allowedEdgeTypes.length === 0 || 
                           state.allowedEdgeTypes.includes(link.edge_type);
      return edgeTypeMatch && 
             finalNodeIds.has(sourceId) && 
             finalNodeIds.has(targetId);
    });

    console.log(`Built graph with ${nodes.length} nodes and ${links.length} links`);

    return {
      nodes,
      links,
      truncated,
      matchedCount: totalMatches
    };
  }
}
