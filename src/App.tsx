// src/App.tsx

import { useState, useEffect, useCallback } from 'react';
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

  // Build mode state
  const [buildMode, setBuildMode] = useState<'top-down' | 'bottom-up'>('top-down');
  
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

  // Existing state
  const [stats, setStats] = useState<Stats | null>(null);
  const [tagClusters, setTagClusters] = useState<TagCluster[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [bottomUpSearchKeywords, setBottomUpSearchKeywords] = useState('');
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
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem('hasSeenWelcome');
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // ✅ NEW: Derive the current category for RightSidebar
  const currentCategory = categoryFilter.size === 1 
    ? Array.from(categoryFilter)[0] 
    : 'all' as 'individual' | 'corporation' | 'all';

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
          
          setDisplayGraph({
            nodes: data.nodes,
            links: data.links,
            truncated: false,
            matchedCount: data.nodes.length
          });
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
      // Count by node types (index nodes are category-agnostic)
      const formNodes = fullGraph.nodes.filter(n => n.node_type === 'form').length;
      const lineNodes = fullGraph.nodes.filter(n => n.node_type === 'line').length;
      const indexNodes = fullGraph.nodes.filter(n => n.node_type === 'index').length;
      const regulationNodes = fullGraph.nodes.filter(n => n.node_type === 'regulation').length;
      
      // ✅ UPDATED: Count by edge types including new hierarchy and reference edges
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
      
      // ✅ UPDATED: Include new edge types in stats
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
      
      // ✅ UPDATED: Enable all edge types by default
      setEnabledCategories(new Set(['belongs_to', 'cites_section', 'cites_regulation', 'hierarchy', 'reference']));
      setIsInitialized(true);
    }
  }, [fullGraph]);

  // Load data when filters change (only in top-down mode)
  useEffect(() => {
    if (isInitialized && buildMode === 'top-down') {
      loadData();
    }
  }, [isInitialized, buildMode, limit, enabledClusterIds, enabledCategories, yearRange, includeUndated, keywords, maxHops, categoryFilter]);

  const loadData = async () => {
    console.log('=== loadData called ===');
    console.log('limit:', limit);
    console.log('maxHops:', maxHops);
    console.log('enabledCategories:', Array.from(enabledCategories));
    console.log('categoryFilter:', Array.from(categoryFilter));

    try {
      setLoading(true);
      const clusterIds = Array.from(enabledClusterIds);
      const categories = Array.from(enabledCategories);
      const [relationshipsResponse, actorCounts] = await Promise.all([
        fetchRelationships(limit, clusterIds, categories, yearRange, includeUndated, keywords, maxHops),
        fetchActorCounts(300)
      ]);
      
      // Apply category filter - NEW
      let filteredByCategory = relationshipsResponse.relationships;
      if (categoryFilter.size > 0 && categoryFilter.size < 2) {
        // Only filter if not both selected
        const allowedCategories = Array.from(categoryFilter);
        filteredByCategory = filteredByCategory.filter(rel => {
          // Check if either actor or target matches allowed categories
          // This assumes nodes have a category property - you may need to fetch this
          return true; // For now, we'll filter in the graph rendering
        });
      }
      
      // Apply node count limit if maxHops is set (we're reusing maxHops as maxNodes)
      let filteredRelationships = filteredByCategory;
      
      if (maxHops !== null && maxHops < filteredRelationships.length) {
        // Build a set of unique nodes from relationships
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
        
        // If we have more nodes than maxHops, keep only the top N by degree
        if (nodeSet.size > maxHops) {
          const sortedNodes = Array.from(nodeDegree.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxHops)
            .map(([nodeId]) => nodeId);
          
          const allowedNodes = new Set(sortedNodes);
          
          // Filter relationships to only include those between allowed nodes
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
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

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
    setCategoryFilter(new Set([category])); // Always set to exactly one category
  }, []);

  const handleCloseWelcome = useCallback(() => {
    localStorage.setItem('hasSeenWelcome', 'true');
    setShowWelcome(false);
  }, []);

  // Fetch actor-specific relationships
  useEffect(() => {
    if (!selectedActor) {
      setActorRelationships([]);
      setActorTotalBeforeFilter(0);
      return;
    }

    if (buildMode === 'top-down') {
      // Top-down mode: use API
      const loadActorRelationships = async () => {
        try {
          const clusterIds = Array.from(enabledClusterIds);
          const categories = Array.from(enabledCategories);
          const response = await fetchActorRelationships(
            selectedActor, 
            clusterIds, 
            categories, 
            yearRange, 
            includeUndated, 
            keywords, 
            maxHops
          );
          setActorRelationships(response.relationships);
          setActorTotalBeforeFilter(response.totalBeforeFilter);
        } catch (error) {
          console.error('Error loading actor relationships:', error);
          setActorRelationships([]);
          setActorTotalBeforeFilter(0);
        }
      };
      loadActorRelationships();
    } else {
      // Bottom-up mode: filter from display graph
      const nodeId = displayGraph.nodes.find(n => n.name === selectedActor)?.id;
      if (nodeId) {
        const relatedLinks = displayGraph.links.filter(link => {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          return sourceId === nodeId || targetId === nodeId;
        });
        
        const relationships = convertGraphToRelationships(displayGraph.nodes, relatedLinks);
        setActorRelationships(relationships);
        setActorTotalBeforeFilter(relationships.length);
      }
    }
  }, [buildMode, selectedActor, enabledClusterIds, enabledCategories, yearRange, includeUndated, keywords, maxHops, displayGraph, convertGraphToRelationships]);

  // Handle bottom-up network building
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
    console.log('=== Bottom-up search triggered ===');
    console.log('Params received:', params);

    if (!builder) {
      console.error('Builder not initialized yet');
      alert('Network builder is not ready. Please wait for the data to load.');
      return;
    }
    
    if (!params.keywords.trim()) {
      console.warn('No search keywords provided');
      alert('Please enter some keywords to search for (e.g., "1040, income")');
      return;
    }

    if (params.searchFields.length === 0) {
      alert('Please select at least one field to search in.');
      return;
    }
    
    setBottomUpSearchKeywords(params.keywords);
    setLoading(true);
    
    try {
      const terms = params.keywords.split(',').map(t => t.trim()).filter(t => t);
      
      console.log('=== Building Merged Network (Bottom-Up) ===');
      console.log('Search keywords:', terms);
      console.log('Search fields:', params.searchFields);
      console.log('Search logic:', params.searchLogic);
      console.log('Expansion degree:', params.expansionDegree);
      console.log('Max nodes:', params.maxNodes);
      console.log('Node type filters:', params.nodeTypes);
      console.log('Edge type filters:', params.edgeTypes);
      console.log('Category filters:', params.categoryFilter);
      
      // ✅ UPDATED: Include new edge types in builder state
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
      
      console.log('=== Build Complete ===');
      console.log('Result:', {
        nodes: filtered.nodes.length,
        links: filtered.links.length,
        truncated: filtered.truncated,
        matchedCount: filtered.matchedCount
      });

      if (filtered.nodes.length === 0) {
        alert(`No nodes matched your search criteria.\n\nTry:\n- Different keywords\n- Fewer filters\n- Higher max nodes limit`);
      }

      const actualTruncated = filtered.matchedCount > params.maxNodes;
      const actualNodeCount = filtered.nodes.length;

      setDisplayGraph({
        nodes: filtered.nodes,
        links: filtered.links,
        truncated: actualTruncated,
        matchedCount: filtered.matchedCount
      });

      setDisplayGraphInfo({
        nodeCount: actualNodeCount,
        truncated: actualTruncated,
        matchedCount: filtered.matchedCount
      });

      setBuildMode('bottom-up');

    } catch (error) {
      console.error('Error building network:', error);
      alert('An error occurred while building the network. Check the console for details.');
    } finally {
      setLoading(false);
    }
  }, [builder]);

  // Start new network (switch to bottom-up mode)
  const handleStartNewNetwork = useCallback(() => {
    setBuildMode('bottom-up');
    setKeywords('');
    setBottomUpSearchKeywords('');
    setRelationships([]);
    setDisplayGraph({
      nodes: [],
      links: [],
      truncated: false,
      matchedCount: 0
    });
    setSelectedActor(null);
    setActorRelationships([]);
  }, []);

  // Reset to top-down mode
  const handleResetToTopDown = useCallback(() => {
    setBuildMode('top-down');
    setSelectedActor(null);
    setActorRelationships([]);
    loadData();
  }, []);

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
          categoryFilter={categoryFilter}
          onToggleCategoryFilter={toggleCategoryFilter}
          yearRange={yearRange}
          onYearRangeChange={setYearRange}
          includeUndated={includeUndated}
          onIncludeUndatedChange={setIncludeUndated}
          keywords={keywords}
          onKeywordsChange={setKeywords}
          buildMode={buildMode}
          onStartNewNetwork={handleStartNewNetwork}
          onResetToTopDown={handleResetToTopDown}
          onBottomUpSearch={handleBottomUpSearch}
          displayGraphInfo={buildMode === 'bottom-up' ? displayGraphInfo : undefined}
        />
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 relative pb-16 lg:pb-0">
        {buildMode === 'bottom-up' && displayGraph.truncated && (
          <div className="absolute top-4 left-4 z-10 bg-yellow-100 border border-yellow-400 text-yellow-900 px-4 py-2 rounded shadow-lg text-sm">
            ⚠ Showing {displayGraph.nodes.length} of {displayGraph.matchedCount} matching nodes
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-300">Loading network...</p>
            </div>
          </div>
        ) : (
          <NetworkGraph
            graphData={buildMode === 'bottom-up' ? displayGraph : undefined}
            relationships={buildMode === 'top-down' ? relationships : undefined}
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
            keywords={buildMode === 'bottom-up' ? bottomUpSearchKeywords : keywords}
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
