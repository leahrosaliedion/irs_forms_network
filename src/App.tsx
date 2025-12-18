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
  const [limit, setLimit] = useState(isMobile ? 5000 : 9600);
  const [maxHops, setMaxHops] = useState<number | null>(1000);
  const [minDensity, setMinDensity] = useState(50);
  const [enabledClusterIds, setEnabledClusterIds] = useState<Set<number>>(new Set());
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set());
  const [yearRange, setYearRange] = useState<[number, number]>([1980, 2025]);
  const [includeUndated, setIncludeUndated] = useState(false);
  const [keywords, setKeywords] = useState('');
  const [actorTotalCounts, setActorTotalCounts] = useState<Record<string, number>>({});
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem('hasSeenWelcome');
  });
  const [isInitialized, setIsInitialized] = useState(false);

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
      };
    });
  }, []);

  // Load full graph data for bottom-up builder on mount
  useEffect(() => {
    const loadGraphData = async () => {
      try {
        console.log('Loading graph data for network builder...');
        
        const apiModule = await import('./api');
        
        if (typeof apiModule.loadGraph === 'function') {
          const data = await apiModule.loadGraph();
          
          console.log('✅ Graph data loaded successfully:', {
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
            console.error('📝 Make sure title26_graph.json exists in the /public folder');
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
    const indexNodes = fullGraph.nodes.filter(n => n.node_type === 'index').length;
    const entityNodes = fullGraph.nodes.filter(n => n.node_type === 'entity').length;
    const conceptNodes = fullGraph.nodes.filter(n => n.node_type === 'concept').length;
    
    const definitionLinks = fullGraph.links.filter(l => l.edge_type === 'definition').length;
    const referenceLinks = fullGraph.links.filter(l => l.edge_type === 'reference').length;
    const hierarchyLinks = fullGraph.links.filter(l => l.edge_type === 'hierarchy').length;
    
    setStats({
      totalDocuments: { count: indexNodes },  // Index/section nodes only
      totalTriples: { count: fullGraph.links.length },
      totalActors: { count: entityNodes + conceptNodes },  // Entity + concept nodes
      categories: [
        { category: 'definition', count: definitionLinks },
        { category: 'reference', count: referenceLinks },
        { category: 'hierarchy', count: hierarchyLinks }
      ]
    });
    
    setEnabledCategories(new Set(['definition', 'reference', 'hierarchy']));
    setIsInitialized(true);
  }
}, [fullGraph]);



  // Load data when filters change (only in top-down mode)
  useEffect(() => {
    if (isInitialized && buildMode === 'top-down') {
      loadData();
    }
  }, [isInitialized, buildMode, limit, enabledClusterIds, enabledCategories, yearRange, includeUndated, keywords, maxHops]);



const loadData = async () => {

  console.log('=== loadData called ===');
  console.log('limit:', limit);
  console.log('maxHops:', maxHops);
  console.log('enabledCategories:', Array.from(enabledCategories));

  try {
    setLoading(true);
    const clusterIds = Array.from(enabledClusterIds);
    const categories = Array.from(enabledCategories);
    const [relationshipsResponse, actorCounts] = await Promise.all([
      fetchRelationships(limit, clusterIds, categories, yearRange, includeUndated, keywords, maxHops),
      fetchActorCounts(300)
    ]);
    
    // Apply node count limit if maxHops is set (we're reusing maxHops as maxNodes)
    let filteredRelationships = relationshipsResponse.relationships;
    
    if (maxHops !== null && maxHops < relationshipsResponse.relationships.length) {
      // Build a set of unique nodes from relationships
      const nodeSet = new Set<string>();
      const nodeDegree = new Map<string, number>();
      
      relationshipsResponse.relationships.forEach(rel => {
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
        filteredRelationships = relationshipsResponse.relationships.filter(rel => {
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
  }, [buildMode, selectedActor, enabledClusterIds, enabledCategories, yearRange, includeUndated, keywords, maxHops, convertGraphToRelationships]);

  // Handle bottom-up network building
  const handleBottomUpSearch = useCallback((params: {
    keywords: string;
    expansionDegree: number;
    maxNodes: number;
    nodeTypes: string[];
    edgeTypes: string[];
    searchFields: string[];
    searchLogic: 'AND' | 'OR';
    nodeRankingMode: 'global' | 'subgraph';
  }) => {

  console.log('=== Bottom-up search triggered ===');
  console.log('Params received:', params);
  console.log('Edge types:', params.edgeTypes);
  console.log('Node types:', params.nodeTypes);
  console.log('Keywords:', params.keywords);
  
  if (!builder) {
    console.error('Builder not initialized yet');
    alert('Network builder is not ready. Please wait for the data to load.');
    return;
  }

    if (!builder) {
      console.error('Builder not initialized yet');
      alert('Network builder is not ready. Please wait for the data to load.');
      return;
    }
    
    if (!params.keywords.trim()) {
      console.warn('No search keywords provided');
      alert('Please enter some keywords to search for (e.g., "tax")');
      return;
    }

    if (params.searchFields.length == 0) {
      alert('Please select at least one field to search in.');
      return;
    }
    
    setBottomUpSearchKeywords(params.keywords);
    
    setLoading(true);
    try {
      const terms = params.keywords.split(',').map(t => t.trim()).filter(t => t);
      
      console.log('=== Building Bottom-Up Network ===');
      console.log('Search keywords:', terms);
      console.log('Search fields:', params.searchFields);
      console.log('Search logic:', params.searchLogic);
      console.log('Expansion degree:', params.expansionDegree);
      console.log('Max nodes:', params.maxNodes);
      console.log('Node type filters:', params.nodeTypes);
      console.log('Edge type filters:', params.edgeTypes);
      
      const builderState: NetworkBuilderState = {
        searchTerms: terms,
        searchFields: params.searchFields,
        allowedNodeTypes: params.nodeTypes as ('section' | 'entity' | 'concept')[],
        allowedEdgeTypes: params.edgeTypes as ('definition' | 'reference' | 'hierarchy')[],
        allowedTitles: [],
        allowedSections: [],
        seedNodeIds: [],
        expansionDepth: params.expansionDegree,
        maxNodesPerExpansion: 100,
        maxTotalNodes: params.maxNodes
      };
      
      const filtered = builder.buildNetwork(builderState, params.searchLogic, params.nodeRankingMode);
      
	// Add diagnostic logging
console.log('🎨 Bottom-up graph built:');
console.log('Sample nodes with colors:', filtered.nodes.slice(0, 5).map(n => ({
  id: n.id,
  name: n.name,
  node_type: n.node_type,
  color: n.color,
  baseColor: n.baseColor
})));

        console.log('=== Build Complete ===');
console.log('Result:', {
  nodes: filtered.nodes.length,
  links: filtered.links.length,
  truncated: filtered.truncated,
  matchedCount: filtered.matchedCount
});

if (filtered.nodes.length === 0) {
  alert(`Graph is empty after filtering. This can happen when:\n- Max nodes is too low\n- Edge type filters remove all connections\n\nTry: Increase max nodes or change edge type filters.`);
}

// ✅ Calculate if results were truncated by maxNodes limit
const actualTruncated = filtered.matchedCount > params.maxNodes;
const actualNodeCount = filtered.nodes.length;

setDisplayGraph({
  nodes: filtered.nodes,
  links: filtered.links,
  truncated: actualTruncated,
  matchedCount: filtered.matchedCount
});

console.log('displayGraph SET with:', filtered.nodes.length, 'nodes');

// ✅ Set the graph info for the sidebar
setDisplayGraphInfo({
  nodeCount: actualNodeCount,
  truncated: actualTruncated,
  matchedCount: filtered.matchedCount
});

// Don't set relationships in bottom-up mode - we use displayGraph directly
setBuildMode('bottom-up');


    } catch (error) {
      console.error('Error building network:', error);
      alert('An error occurred while building the network. Check the console for details.');
    } finally {
      setLoading(false);
    }
  }, [builder, convertGraphToRelationships]);

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

  console.log('=== Rendering NetworkGraph ===');
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
          <div className="absolute top-4 left-4 z-10 bg-yellow-100 border border-yellow-400 text-yellow-900 px-4 py-2 rounded shadow-lg">
            ⚠ Showing {displayGraph.nodes.length} of {displayGraph.matchedCount} matching nodes
          </div>
        )}

        {loading ? (
  <div className="flex items-center justify-center h-full bg-[#161400]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
      <p className="text-gray-300">Loading network data...</p>
    </div>
  </div>
) : (
          <NetworkGraph

            graphData={buildMode === 'bottom-up' ? displayGraph : undefined}
            relationships={buildMode === 'top-down' ? relationships : undefined}
            selectedActor={selectedActor}
            onActorClick={handleActorClick}
            minDensity={minDensity}
            actorTotalCounts={actorTotalCounts}
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
