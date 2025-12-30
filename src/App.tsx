// src/App.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import NetworkGraph from './components/NetworkGraph';
import Sidebar from './components/Sidebar';
import RightSidebar from './components/RightSidebar';
import MobileBottomNav from './components/MobileBottomNav';
import { WelcomeModal } from './components/WelcomeModal';
import { NetworkBuilder } from './services/networkBuilder';
import { 
  fetchStats, 
  fetchRelationships, 
  fetchActorRelationships, 
  fetchTagClusters, 
  fetchActorCounts 
} from './api';
import type { 
  Stats, 
  Relationship, 
  TagCluster, 
  NetworkBuilderState, 
  FilteredGraph,
  GraphNode,
  GraphLink 
} from './types';

function App() {
  const isMobile = window.innerWidth < 1024;

  // Internal mode tracking (not exposed in UI)
  const [buildMode, setBuildMode] = useState<'topDown' | 'bottomUp'>('topDown');

  // Bottom-up builder state
  const [fullGraph, setFullGraph] = useState<{ nodes: GraphNode[], links: GraphLink[] }>({ 
    nodes: [], 
    links: [] 
  });
  const [builder, setBuilder] = useState<NetworkBuilder | null>(null);
  const [displayGraph, setDisplayGraph] = useState<FilteredGraph>({
    nodes: [],
    links: [],
    truncated: false,
    matchedCount: 0
  });

  const [displayGraphInfo, setDisplayGraphInfo] = useState<{
    nodeCount: number;
    truncated: boolean;
    matchedCount: number;
  } | null>(null);

  // ✅ NEW: Track last search params for bottom-up mode
  const lastSearchParamsRef = useRef<{
    keywords: string;
    expansionDegree: number;
    maxNodes: number;
    nodeTypes: string[];
    edgeTypes: string[];
    searchFields: string[];
    searchLogic: 'AND' | 'OR';
    categoryFilter: string[];
    nodeRankingMode: 'global' | 'subgraph';
  } | null>(null);

  // Existing state
  const [stats, setStats] = useState<Stats | null>(null);
  const [tagClusters, setTagClusters] = useState<TagCluster[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [totalBeforeLimit, setTotalBeforeLimit] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const [actorRelationships, setActorRelationships] = useState<Relationship[]>([]);
  const [actorTotalBeforeFilter, setActorTotalBeforeFilter] = useState<number>(0);
  const [limit, setLimit] = useState(5000);
  const [maxHops, setMaxHops] = useState<number | null>(1500);
  const [minDensity, setMinDensity] = useState(50);
  const [enabledClusterIds, setEnabledClusterIds] = useState<Set<number>>(new Set());
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set());
  const [yearRange, setYearRange] = useState<[number, number]>([1980, 2025]);
  const [includeUndated, setIncludeUndated] = useState(false);
  const [keywords, setKeywords] = useState('');
  const [actorTotalCounts, setActorTotalCounts] = useState<Record<string, number>>({});
  const [categoryFilter, setCategoryFilter] = useState<Set<'individual' | 'corporation'>>(
    new Set(['individual'])
  );
  const [enabledNodeTypes, setEnabledNodeTypes] = useState<Set<string>>(
    new Set(['form', 'line', 'index', 'regulation'])
  );
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem('hasSeenWelcome');
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [topDownGraphInfo, setTopDownGraphInfo] = useState<{
    nodeCount: number;
    linkCount: number;
  } | null>(null);

  // Derive the current category for RightSidebar
  const currentCategory = categoryFilter.size === 1 
    ? Array.from(categoryFilter)[0] 
    : 'all' as 'individual' | 'corporation' | 'all';

  const toggleNodeType = (nodeType: string) => {
    setEnabledNodeTypes(prev => {
      const next = new Set(prev);
      if (next.has(nodeType)) {
        next.delete(nodeType);
      } else {
        next.add(nodeType);
      }
      return next;
    });
  };

  // Convert graph nodes/links to relationships for the existing renderer
  const convertGraphToRelationships = useCallback((nodes: GraphNode[], links: GraphLink[]): Relationship[] => {
    return links.map((link, idx) => {
      const sourceNode = nodes.find(n => n.id === (typeof link.source === 'string' ? link.source : link.source.id));
      const targetNode = nodes.find(n => n.id === (typeof link.target === 'string' ? link.target : link.target.id));

      return {
        id: idx,
        doc_id: sourceNode?.id || '',
        timestamp: link.timestamp || null,
        actor: sourceNode?.name || sourceNode?.id || '',
        action: link.action || link.edge_type || 'relationship',
        target: targetNode?.name || targetNode?.id || '',
        location: link.location || null,
        tags: [],
        actor_type: sourceNode?.node_type,
        target_type: targetNode?.node_type,
        actor_id: sourceNode?.id,
        target_id: targetNode?.id,
        edge_type: link.edge_type,
      };
    });
  }, []);

  // Load full graph data for bottom-up builder on mount
  useEffect(() => {
    const loadGraphData = async () => {
      try {
        console.log('Loading merged IRS + Title 26 graph data...');

        const apiModule = await import('./api');

        if (typeof apiModule.loadGraph === 'function') {
          const data = await apiModule.loadGraph();

          console.log('✅ Merged graph data loaded successfully:', {
            nodes: data.nodes.length,
            links: data.links.length,
            sampleNode: data.nodes[0]
          });

          setFullGraph(data);
          setBuilder(new NetworkBuilder(data.nodes, data.links));
        } else {
          throw new Error('loadGraph function not found in api module');
        }
      } catch (err) {
        console.error('❌ Failed to load graph data:', err);

        if (err instanceof Error) {
          if (err.message.includes('404') || err.message.includes('Failed to load graph data')) {
            console.error('📝 Make sure merged_title26_irs_khop.json exists in the /public folder');
          }
        }

        setFullGraph({ nodes: [], links: [] });
      }
    };

    loadGraphData();
  }, []);

  // Compute stats from loaded graph data
  useEffect(() => {
    if (fullGraph.nodes.length > 0) {
      const formNodes = fullGraph.nodes.filter(n => n.node_type === 'form').length;
      const lineNodes = fullGraph.nodes.filter(n => n.node_type === 'line').length;
      const indexNodes = fullGraph.nodes.filter(n => n.node_type === 'index').length;
      const regulationNodes = fullGraph.nodes.filter(n => n.node_type === 'regulation').length;

      const belongsToLinks = fullGraph.links.filter(l => l.edge_type === 'belongs_to').length;
      const citesSectionLinks = fullGraph.links.filter(l => l.edge_type === 'cites_section').length;
      const citesRegulationLinks = fullGraph.links.filter(l => l.edge_type === 'cites_regulation').length;
      const hierarchyLinks = fullGraph.links.filter(l => l.edge_type === 'hierarchy').length;
      const referenceLinks = fullGraph.links.filter(l => l.edge_type === 'reference').length;

      console.log('📊 Merged IRS + Title 26 Network Stats:', {
        forms: formNodes,
        lines: lineNodes,
        indexes: indexNodes,
        regulations: regulationNodes,
        totalNodes: fullGraph.nodes.length,
        totalLinks: fullGraph.links.length,
        edgeTypes: {
          belongs_to: belongsToLinks,
          cites_section: citesSectionLinks,
          cites_regulation: citesRegulationLinks,
          hierarchy: hierarchyLinks,
          reference: referenceLinks
        }
      });

      setStats({
        totalDocuments: { count: fullGraph.nodes.length },
        totalTriples: { count: fullGraph.links.length },
        totalActors: { count: fullGraph.nodes.length },
        categories: [
          { category: 'belongs_to', count: belongsToLinks },
          { category: 'cites_section', count: citesSectionLinks },
          { category: 'cites_regulation', count: citesRegulationLinks },
          { category: 'hierarchy', count: hierarchyLinks },
          { category: 'reference', count: referenceLinks }
        ]
      });

      setEnabledCategories(new Set(['belongs_to', 'cites_section', 'cites_regulation']));
      setIsInitialized(true);
    }
  }, [fullGraph]);

  // ✅ UPDATED: Top-down mode - load data when filters change
  useEffect(() => {
    if (isInitialized && buildMode === 'topDown') {
      loadData();
    }
  }, [
    isInitialized,
    buildMode,
    limit,
    enabledClusterIds,
    enabledCategories,
    enabledNodeTypes,
    yearRange,
    includeUndated,
    maxHops,
    categoryFilter
  ]);

  // ✅ NEW: Bottom-up mode - re-run search when filters change
  useEffect(() => {
    if (buildMode === 'bottomUp' && lastSearchParamsRef.current && builder) {
      console.log('🔄 Filter changed in bottom-up mode - re-running search');
      
      // Update the search params with new filter values
      const updatedParams = {
        ...lastSearchParamsRef.current,
        maxNodes: maxHops || 1500,
        nodeTypes: Array.from(enabledNodeTypes),
        edgeTypes: Array.from(enabledCategories),
        categoryFilter: Array.from(categoryFilter)
      };
      
      // Re-run the search with updated params
      executeBottomUpSearch(updatedParams);
    }
  }, [
    buildMode,
    maxHops,
    enabledNodeTypes,
    enabledCategories,
    categoryFilter,
    builder
  ]);

  const loadData = async () => {
    if (buildMode !== 'topDown') {
      console.log('Skipping loadData - in bottom-up mode');
      return;
    }

    console.log('=== loadData called (top-down mode) ===');
    console.log('limit:', limit);
    console.log('maxHops:', maxHops);
    console.log('enabledCategories:', Array.from(enabledCategories));
    console.log('enabledNodeTypes:', Array.from(enabledNodeTypes));
    console.log('categoryFilter:', Array.from(categoryFilter));

    try {
      setLoading(true);
      const clusterIds = Array.from(enabledClusterIds);
      const categories = Array.from(enabledCategories);
      const [relationshipsResponse, actorCounts] = await Promise.all([
        fetchRelationships(limit, clusterIds, categories, yearRange, includeUndated, keywords, maxHops),
        fetchActorCounts(300)
      ]);

      let filteredByCategory = relationshipsResponse.relationships;
      if (categoryFilter.size > 0 && categoryFilter.size < 2) {
        const allowedCategories = Array.from(categoryFilter);
        filteredByCategory = filteredByCategory.filter(rel => {
          return true;
        });
      }

      let filteredByNodeType = filteredByCategory;
      if (enabledNodeTypes.size > 0 && enabledNodeTypes.size < 4) {
        filteredByNodeType = filteredByNodeType.filter(rel => {
          const sourceType = rel.actor_type;
          const targetType = rel.target_type;
          return enabledNodeTypes.has(sourceType) && enabledNodeTypes.has(targetType);
        });
      }

      let filteredRelationships = filteredByNodeType;

      if (maxHops !== null && maxHops < filteredRelationships.length) {
        const nodeSet = new Set<string>();
        const nodeDegree = new Map<string, number>();

        filteredRelationships.forEach(rel => {
          const actorId = rel.actor_id ?? rel.actor;
          const targetId = rel.target_id ?? rel.target;

          nodeSet.add(actorId);
          nodeSet.add(targetId);

          nodeDegree.set(actorId, (nodeDegree.get(actorId) || 0) + 1);
          nodeDegree.set(targetId, (nodeDegree.get(targetId) || 0) + 1);
        });

        if (nodeSet.size > maxHops) {
          const sortedNodes = Array.from(nodeDegree.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxHops)
            .map(([nodeId]) => nodeId);

          const allowedNodes = new Set(sortedNodes);

          filteredRelationships = filteredRelationships.filter(rel => {
            const actorId = rel.actor_id ?? rel.actor;
            const targetId = rel.target_id ?? rel.target;
            return allowedNodes.has(actorId) && allowedNodes.has(targetId);
          });
        }
      }

      setRelationships(filteredRelationships);
      setTotalBeforeLimit(relationshipsResponse.totalBeforeLimit);
      setActorTotalCounts(actorCounts);
      
      setDisplayGraph({
        nodes: [],
        links: [],
        truncated: false,
        matchedCount: 0
      });
      setDisplayGraphInfo(null);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (relationships.length > 0) {
      const nodeSet = new Set<string>();
      relationships.forEach(rel => {
        const sourceId = rel.actor_id ?? rel.actor;
        const targetId = rel.target_id ?? rel.target;
        nodeSet.add(sourceId);
        nodeSet.add(targetId);
      });

      setTopDownGraphInfo({
        nodeCount: nodeSet.size,
        linkCount: relationships.length
      });
    } else {
      setTopDownGraphInfo(null);
    }
  }, [relationships]);

  const handleActorClick = useCallback((actorName: string | null) => {
    setSelectedActor(prev => {
      if (actorName === null) return null;
      if (prev === actorName) return null;
      return actorName;
    });
  }, []);

  const toggleCluster = useCallback((clusterId: number) => {
    setEnabledClusterIds(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setEnabledCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const toggleCategoryFilter = useCallback((category: 'individual' | 'corporation') => {
    setCategoryFilter(new Set([category]));
  }, []);

  const handleCloseWelcome = useCallback(() => {
    localStorage.setItem('hasSeenWelcome', 'true');
    setShowWelcome(false);
  }, []);

  useEffect(() => {
    if (!selectedActor) {
      setActorRelationships([]);
      setActorTotalBeforeFilter(0);
      return;
    }

    if (buildMode === 'bottomUp' && displayGraph.nodes.length > 0) {
      const nodeId = displayGraph.nodes.find(n => n.name === selectedActor)?.id;
      if (nodeId) {
        const relatedLinks = displayGraph.links.filter(link => {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          return sourceId === nodeId || targetId === nodeId;
        });

        const rels = convertGraphToRelationships(displayGraph.nodes, relatedLinks);
        setActorRelationships(rels);
        setActorTotalBeforeFilter(rels.length);
      }
    } else {
      const actorRels = relationships.filter(rel => 
        rel.actor === selectedActor || rel.target === selectedActor
      );
      setActorRelationships(actorRels);
      setActorTotalBeforeFilter(actorRels.length);
    }
  }, [selectedActor, displayGraph, relationships, buildMode, convertGraphToRelationships]);

  // ✅ UPDATED: Extracted search execution logic with proper limits
const executeBottomUpSearch = useCallback((params: {
  keywords: string;
  expansionDegree: number;
  maxNodes: number;
  nodeTypes: string[];
  edgeTypes: string[];
  searchFields: string[];
  searchLogic: 'AND' | 'OR';
  categoryFilter: string[];
  nodeRankingMode: 'global' | 'subgraph';
}) => {
  console.log('=== Executing bottom-up search ===');
  console.log('Params:', params);

  if (!builder) {
    console.error('Builder not initialized yet');
    return;
  }

  if (params.searchFields.length === 0) {
    console.warn('No search fields selected');
    return;
  }

  // ✅ Check if no edge types are enabled - should show blank graph
  if (params.edgeTypes.length === 0 && params.expansionDegree === 0) {
    console.log('⚠️ No edge types enabled and depth=0 - showing empty graph');
    setDisplayGraph({
      nodes: [],
      links: [],
      truncated: false,
      matchedCount: 0
    });
    setDisplayGraphInfo({
      nodeCount: 0,
      linkCount: 0,
      truncated: false,
      matchedCount: 0
    });
    setLoading(false);
    return;
  }

  setLoading(true);
  
  setRelationships([]);
  setTopDownGraphInfo(null);

  try {
    const terms = params.keywords.split(',').map(t => t.trim()).filter(t => t);

    console.log('=== Building Network from Keyword Search ===');
    console.log('Search keywords:', terms);
    console.log('Search fields:', params.searchFields);
    console.log('Search logic:', params.searchLogic);
    console.log('Expansion degree:', params.expansionDegree);
    console.log('Max nodes:', params.maxNodes);
    console.log('Max relationships (limit):', limit);
    console.log('Node type filters:', params.nodeTypes);
    console.log('Edge type filters:', params.edgeTypes);
    console.log('Category filters:', params.categoryFilter);

    const builderState: NetworkBuilderState = {
      searchTerms: terms,
      searchFields: params.searchFields as ('name' | 'full_name' | 'definition' | 'text')[],
      allowedNodeTypes: params.nodeTypes as ('form' | 'line' | 'index' | 'regulation')[],
      allowedEdgeTypes: params.edgeTypes as ('belongs_to' | 'cites_section' | 'cites_regulation' | 'hierarchy' | 'reference')[],
      allowedCategories: params.categoryFilter as ('individual' | 'corporation')[],
      allowedForms: [],
      seedNodeIds: [],
      expansionDepth: params.expansionDegree,
      maxNodesPerExpansion: 100,
      maxTotalNodes: params.maxNodes
    };

    const filtered = builder.buildNetwork(builderState, params.searchLogic, params.nodeRankingMode);

    console.log('=== Build Complete (before relationship limit) ===');
    console.log('Result:', {
      nodes: filtered.nodes.length,
      links: filtered.links.length,
      truncated: filtered.truncated,
      matchedCount: filtered.matchedCount
    });

    if (filtered.nodes.length === 0 && filtered.links.length === 0) {
      console.warn('No nodes matched search criteria with current filters');
      // ✅ Set empty state properly
      setDisplayGraph({
        nodes: [],
        links: [],
        truncated: false,
        matchedCount: 0
      });
      setDisplayGraphInfo({
        nodeCount: 0,
        linkCount: 0,
        truncated: false,
        matchedCount: 0
      });
      setLoading(false);
      return;
    }

    // ✅ Apply relationship limit (using 'limit' state)
    let finalLinks = filtered.links;
    let relationshipTruncated = false;
    
    if (limit && filtered.links.length > limit) {
      console.log(`⚠️ Truncating relationships: ${filtered.links.length} → ${limit}`);
      finalLinks = filtered.links.slice(0, limit);
      relationshipTruncated = true;
    }

    // ✅ After truncating links, recalculate which nodes are actually connected
    const connectedNodeIds = new Set<string>();
    finalLinks.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      connectedNodeIds.add(sourceId);
      connectedNodeIds.add(targetId);
    });

    // Filter nodes to only include those that have connections in the truncated link set
    const finalNodes = filtered.nodes.filter(node => connectedNodeIds.has(node.id));

    console.log('=== Final Result (after relationship limit) ===');
    console.log('Nodes:', finalNodes.length);
    console.log('Links:', finalLinks.length);
    console.log('Relationship truncated:', relationshipTruncated);

    const actualTruncated = filtered.truncated || relationshipTruncated;
    const actualNodeCount = finalNodes.length;

    setDisplayGraph({
      nodes: finalNodes,
      links: finalLinks,
      truncated: actualTruncated,
      matchedCount: filtered.matchedCount
    });

    setDisplayGraphInfo({
      nodeCount: actualNodeCount,
      linkCount: finalLinks.length,
      truncated: actualTruncated,
      matchedCount: filtered.matchedCount
    });

  } catch (error) {
    console.error('Error building network:', error);
    // ✅ Set safe error state
    setDisplayGraph({
      nodes: [],
      links: [],
      truncated: false,
      matchedCount: 0
    });
    setDisplayGraphInfo({
      nodeCount: 0,
      linkCount: 0,
      truncated: false,
      matchedCount: 0
    });
  } finally {
    setLoading(false);
  }
}, [builder, limit]);


  // ✅ UPDATED: Handle keyword search with mode switching
  const handleBottomUpSearch = useCallback((params: {
    keywords: string;
    expansionDegree: number;
    maxNodes: number;
    nodeTypes: string[];
    edgeTypes: string[];
    searchFields: string[];
    searchLogic: 'AND' | 'OR';
    categoryFilter: string[];
    nodeRankingMode: 'global' | 'subgraph';
  }) => {
    console.log('=== Keyword search triggered ===');
    console.log('Params received:', params);

    if (!builder) {
      console.error('Builder not initialized yet');
      alert('Network builder is not ready. Please wait for the data to load.');
      return;
    }

    // If no keywords, switch back to top-down mode
    if (!params.keywords.trim()) {
      console.log('No keywords - switching to top-down mode');
      setBuildMode('topDown');
      setKeywords('');
      setDisplayGraph({
        nodes: [],
        links: [],
        truncated: false,
        matchedCount: 0
      });
      setDisplayGraphInfo(null);
      lastSearchParamsRef.current = null;
      return;
    }

    if (params.searchFields.length === 0) {
      alert('Please select at least one field to search in.');
      return;
    }

    // Switch to bottom-up mode and save params
    setBuildMode('bottomUp');
    setKeywords(params.keywords);
    lastSearchParamsRef.current = params;

    // Execute the search
    executeBottomUpSearch(params);
  }, [builder, executeBottomUpSearch]);

  console.log('=== Rendering App ===');
  console.log('buildMode:', buildMode);
  console.log('displayGraph:', { nodes: displayGraph.nodes.length, links: displayGraph.links.length });
  console.log('relationships:', relationships.length);

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          stats={stats}
          selectedActor={selectedActor}
          onActorSelect={setSelectedActor}
          limit={limit}
          onLimitChange={setLimit}
          maxHops={maxHops}
          onMaxHopsChange={setMaxHops}
          minDensity={minDensity}
          onMinDensityChange={setMinDensity}
          tagClusters={tagClusters}
          enabledClusterIds={enabledClusterIds}
          onToggleCluster={toggleCluster}
          enabledCategories={enabledCategories}
          onToggleCategory={toggleCategory}
          enabledNodeTypes={enabledNodeTypes}
          onToggleNodeType={toggleNodeType}  
          categoryFilter={categoryFilter}
          onToggleCategoryFilter={toggleCategoryFilter}
          yearRange={yearRange}
          onYearRangeChange={setYearRange}
          includeUndated={includeUndated}
          onIncludeUndatedChange={setIncludeUndated}
          keywords={keywords}
          onKeywordsChange={setKeywords}
          onBottomUpSearch={handleBottomUpSearch}
          buildMode={buildMode}
          displayGraphInfo={displayGraphInfo}
          topDownGraphInfo={topDownGraphInfo}
        />
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 relative pb-16 lg:pb-0">
        {loading ? (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-300">Loading network...</p>
            </div>
          </div>
        ) : (
          <NetworkGraph
            graphData={buildMode === 'bottomUp' && displayGraph.nodes.length > 0 ? displayGraph : undefined}
            relationships={buildMode === 'topDown' && relationships.length > 0 ? relationships : undefined}
            fullGraph={fullGraph}
            selectedActor={selectedActor}
            onActorClick={handleActorClick}
            minDensity={minDensity}
            actorTotalCounts={actorTotalCounts}
            categoryFilter={categoryFilter}
          />
        )}
      </div>

      {/* Desktop Right Sidebar */}
      {selectedActor && (
        <div className="hidden lg:block">
          <RightSidebar
            selectedActor={selectedActor}
            relationships={actorRelationships}
            totalRelationships={actorTotalBeforeFilter}
            onClose={() => setSelectedActor(null)}
            yearRange={yearRange}
            keywords={keywords}
            categoryFilter={currentCategory}
            onActorClick={handleActorClick}
          />
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden">
        <MobileBottomNav
          stats={stats}
          selectedActor={selectedActor}
          onActorSelect={setSelectedActor}
          limit={limit}
          onLimitChange={setLimit}
          tagClusters={tagClusters}
          enabledClusterIds={enabledClusterIds}
          onToggleCluster={toggleCluster}
          enabledCategories={enabledCategories}
          onToggleCategory={toggleCategory}
          relationships={selectedActor ? actorRelationships : relationships}
        />
      </div>

      {/* Welcome Modal */}
      <WelcomeModal isOpen={showWelcome} onClose={handleCloseWelcome} />
    </div>
  );
}

export default App;
