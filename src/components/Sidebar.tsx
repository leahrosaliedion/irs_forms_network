// src/components/Sidebar.tsx

import { useState, useEffect, useRef } from 'react';
import { searchActors, fetchNodeDetails} from '../api';
import type { Stats, Actor, TagCluster } from '../types';

interface SidebarProps {
  stats: Stats | null;
  selectedActor: string | null;
  onActorSelect: (actor: string | null) => void;
  limit: number;
  onLimitChange: (limit: number) => void;
  maxHops: number | null;
  onMaxHopsChange: (maxHops: number | null) => void;
  minDensity: number;
  onMinDensityChange: (density: number) => void;
  tagClusters: TagCluster[];
  enabledClusterIds: Set<number>;
  onToggleCluster: (clusterId: number) => void;
  enabledCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  categoryFilter: Set<'individual' | 'corporation'>;
  onToggleCategoryFilter: (category: 'individual' | 'corporation') => void;
  yearRange: [number, number];
  onYearRangeChange: (range: [number, number]) => void;
  includeUndated: boolean;
  onIncludeUndatedChange: (include: boolean) => void;
  keywords: string;
  onKeywordsChange: (keywords: string) => void;
  buildMode?: 'top-down' | 'bottom-up';
  onStartNewNetwork?: () => void;
  onResetToTopDown?: () => void;
  onBottomUpSearch?: (params: {
    keywords: string;
    expansionDegree: number;
    maxNodes: number;
    nodeTypes: string[];
    edgeTypes: string[];
    searchFields: string[];
    searchLogic: 'AND' | 'OR';
    categoryFilter: string[];
    nodeRankingMode: 'global' | 'subgraph';
  }) => void;
  displayGraphInfo?: {
    nodeCount: number;
    truncated: boolean;
    matchedCount: number;
  };
}

// Helper component to fetch and display selected node
function SelectedNodeBox({ 
  selectedActor, 
  onActorSelect 
}: { 
  selectedActor: string; 
  onActorSelect: (actor: string | null) => void;
}) {
  const [nodeInfo, setNodeInfo] = useState<{ name: string; type: string; category: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInfo = async () => {
      setIsLoading(true);
      try {
        const details = await fetchNodeDetails(selectedActor);
        if (details) {
          setNodeInfo({
            name: details.name || selectedActor,
            type: details.node_type || 'unknown',
            category: details.category || 'unknown'
          });
        }
      } catch (err) {
        console.error('Failed to fetch node details:', err);
        setNodeInfo(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInfo();
  }, [selectedActor]);

  const getCategoryBadge = (category: string) => {
    return category === 'individual' ? '👤' : '🏢';
  };

  return (
    <div className="p-4 border-b border-gray-700 flex-shrink-0">
      <div className="flex items-center justify-between bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
        <div className="flex-1 mr-2">
          <div className="text-xs text-gray-400 mb-1">Selected node:</div>
          <div className="font-medium text-blue-300 break-words">
            {nodeInfo ? (
              <>
                {getCategoryBadge(nodeInfo.category)} {nodeInfo.name}
                <span className="text-xs text-gray-400 ml-2">({nodeInfo.type})</span>
              </>
            ) : (
              selectedActor
            )}
          </div>
        </div>
        <button
          onClick={() => onActorSelect(null)}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors text-white flex-shrink-0"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({
  stats,
  selectedActor,
  onActorSelect,
  limit,
  onLimitChange,
  maxHops,
  onMaxHopsChange,
  minDensity,
  onMinDensityChange,
  tagClusters,
  enabledClusterIds,
  onToggleCluster,
  enabledCategories,
  onToggleCategory,
  categoryFilter,
  onToggleCategoryFilter,
  yearRange,
  onYearRangeChange,
  includeUndated,
  onIncludeUndatedChange,
  keywords,
  onKeywordsChange,
  buildMode = 'top-down',
  onStartNewNetwork,
  onResetToTopDown,
  onBottomUpSearch,
  displayGraphInfo
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Actor[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [graphSettingsExpanded, setGraphSettingsExpanded] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [localLimit, setLocalLimit] = useState(limit);
  const [localKeywords, setLocalKeywords] = useState(keywords);
  const limitDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [nodeRankingMode, setNodeRankingMode] = useState<'global' | 'subgraph'>('global');

  // IRS Forms-specific filters
  const [nodeTypeFilters, setNodeTypeFilters] = useState<Set<'form' | 'line' | 'section' | 'regulation'>>(
    new Set(['form', 'line', 'section', 'regulation'])
  );
  const [edgeTypeFilters, setEdgeTypeFilters] = useState<Set<'belongs_to' | 'cites_section' | 'cites_regulation'>>(
    new Set(['belongs_to', 'cites_section', 'cites_regulation'])
  );
  const [bottomUpCategoryFilter, setBottomUpCategoryFilter] = useState<Set<'individual' | 'corporation'>>(
  new Set(['individual'])
);
  
  const [maxNodes, setMaxNodes] = useState(1000);
  const [expansionDegree, setExpansionDegree] = useState(1);

  const [searchFields, setSearchFields] = useState<Set<string>>(
    new Set(['name', 'full_name', 'text', 'definition'])
  );

  const [searchLogic, setSearchLogic] = useState<'AND' | 'OR'>('OR');

  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchActors(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    setLocalLimit(limit);
  }, [limit]);

  useEffect(() => {
    setLocalKeywords(keywords);
  }, [keywords]);

  useEffect(() => {
    if (buildMode === 'bottom-up') {
      setLocalKeywords('');
    }
  }, [buildMode]);

  const handleLimitChange = (newLimit: number) => {
    setLocalLimit(newLimit);

    if (limitDebounceTimerRef.current) {
      clearTimeout(limitDebounceTimerRef.current);
    }

    limitDebounceTimerRef.current = setTimeout(() => {
      onLimitChange(newLimit);
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (limitDebounceTimerRef.current) {
        clearTimeout(limitDebounceTimerRef.current);
      }
    };
  }, []);

  const handleKeywordSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (buildMode === 'bottom-up' && onBottomUpSearch) {
      onBottomUpSearch({
  keywords: localKeywords,
  expansionDegree: expansionDegree,
  maxNodes: maxNodes,
  nodeTypes: Array.from(nodeTypeFilters),
  edgeTypes: Array.from(edgeTypeFilters),
  searchFields: Array.from(searchFields),
  searchLogic: searchLogic,
  categoryFilter: Array.from(bottomUpCategoryFilter),  // ← Use bottomUpCategoryFilter
  nodeRankingMode  
});
    } else {
      onKeywordsChange(localKeywords);
    }
  };

  const toggleNodeType = (type: 'form' | 'line' | 'section' | 'regulation') => {
    setNodeTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleEdgeType = (type: 'belongs_to' | 'cites_section' | 'cites_regulation') => {
    setEdgeTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleCategory = (category: 'individual' | 'corporation') => {
  setBottomUpCategoryFilter(prev => {
    const next = new Set(prev);
    if (next.has(category)) {
      next.delete(category);
    } else {
      next.add(category);
    }
    return next;
  });
};

  const selectAllNodeTypes = () => {
    setNodeTypeFilters(new Set(['form', 'line', 'section', 'regulation']));
  };

  const deselectAllNodeTypes = () => {
    setNodeTypeFilters(new Set());
  };

  const selectAllEdgeTypes = () => {
    setEdgeTypeFilters(new Set(['belongs_to', 'cites_section', 'cites_regulation']));
  };

  const deselectAllEdgeTypes = () => {
    setEdgeTypeFilters(new Set());
  };

  const selectAllCategories = () => {
    setCategoryFilter(new Set(['individual', 'corporation']));
  };

  const deselectAllCategories = () => {
    setCategoryFilter(new Set());
  };

  const toggleSearchField = (field: string) => {
    setSearchFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const selectAllSearchFields = () => {
    setSearchFields(new Set(['name', 'full_name', 'text', 'definition']));
  };

  const deselectAllSearchFields = () => {
    setSearchFields(new Set());
  };

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-700 flex-shrink-0">
        <h1 className="font-bold text-blue-400" style={{ fontSize: '20px' }}>
          IRS Forms Network
        </h1>
        <p className="mt-1 text-xs text-gray-400">
          Tax forms, lines, USC sections, and Treasury regulations
        </p>
      </div>

      {/* Mode Indicator & Action Button */}
      <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0">
        {buildMode === 'bottom-up' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
              Bottom-Up Network Builder
            </div>
            <button
              onClick={onResetToTopDown}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm font-medium transition-colors border border-gray-600"
            >
              ← Back to Full Network
            </button>

            {displayGraphInfo && displayGraphInfo.nodeCount > 0 && (
              <div className="p-2 bg-gray-900/50 rounded text-xs space-y-1 border border-gray-700">
                <div className="text-gray-100">
                  Displaying: <span className="font-mono text-green-400">{displayGraphInfo.nodeCount}</span>
                  {displayGraphInfo.truncated && (
                    <> of <span className="font-mono text-yellow-400">{displayGraphInfo.matchedCount}</span> total</>
                  )} nodes
                </div>
                {displayGraphInfo.truncated && (
                  <div className="text-yellow-300">
                    ⚠ Results limited by max nodes slider
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onStartNewNetwork}
            className="w-full px-4 py-2 bg-[#12B76A] text-white rounded hover:bg-[#0e9d5a] text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-green-500"
          >
            <span className="text-lg">+</span>
            Start New Search
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && buildMode === 'top-down' && (
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total nodes:</span>
              <span className="font-mono text-blue-400">
                {stats.totalDocuments.count.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Relationships:</span>
              <span className="font-mono text-cyan-400">
                {stats.totalTriples.count.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Selected node */}
      {selectedActor && (
        <SelectedNodeBox 
          selectedActor={selectedActor} 
          onActorSelect={onActorSelect} 
        />
      )}

      {/* Controls */}
      <div className="flex-1 overflow-y-auto">
        {/* Graph Settings */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => setGraphSettingsExpanded(!graphSettingsExpanded)}
            className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
          >
            <span>Graph settings</span>
            <span className="text-sm">{graphSettingsExpanded ? '▼' : '▶'}</span>
          </button>
          {graphSettingsExpanded && (
            <>
              {buildMode === 'top-down' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      Maximum relationships: {localLimit.toLocaleString()}
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="10000"
                      step="100"
                      value={localLimit}
                      onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Maximum nodes: {maxHops === null ? '2000' : maxHops}
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="4000"
                      step="100"
                      value={maxHops === null ? 4000 : maxHops}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        onMaxHopsChange(value);
                      }}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>100</span>
        <span>2000</span>
        <span>4000</span>
      </div>

                  </div>
                </>
              )}

              {buildMode === 'bottom-up' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      Degrees of connection: {expansionDegree}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={expansionDegree}
                      onChange={(e) => setExpansionDegree(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0</span>
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {expansionDegree === 0 
                        ? 'Show only nodes matching the search'
                        : `Include nodes up to ${expansionDegree} connection${expansionDegree > 1 ? 's' : ''} away`}
                    </p>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      Maximum nodes: {maxNodes.toLocaleString()}
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="4000"
                      step="100"
                      value={maxNodes}
                      onChange={(e) => setMaxNodes(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>100</span>
        <span>2000</span>
        <span>4000</span>
      </div>
                  </div>

                  {/* Node Ranking Mode */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      Node Ranking
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="nodeRanking"
                          value="global"
                          checked={nodeRankingMode === 'global'}
                          onChange={() => setNodeRankingMode('global')}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-300">
                          Global degree
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="nodeRanking"
                          value="subgraph"
                          checked={nodeRankingMode === 'subgraph'}
                          onChange={() => setNodeRankingMode('subgraph')}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-300">
                          Subgraph degree
                        </span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
          >
            <span>Filters</span>
            <span className="text-sm">{filtersExpanded ? '▼' : '▶'}</span>
          </button>
          {filtersExpanded && (
            <>

              {/* Taxpayer Category Toggle - Top-down mode */}
    {buildMode === 'top-down' && (
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">
          Show taxpayer types:
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => onToggleCategoryFilter('individual')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              categoryFilter.has('individual')
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            👤 Individual
          </button>
          <button
            onClick={() => onToggleCategoryFilter('corporation')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              categoryFilter.has('corporation')
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            🏢 Corporation
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
  {categoryFilter.has('individual')
    ? 'Showing individual forms only'
    : 'Showing corporation forms only'}
</p>
      </div>
    )}

              {/* Taxpayer Category Filter - Bottom-up mode */}
{buildMode === 'bottom-up' && (
  <div className="mb-4">
    <label className="block text-sm text-gray-400 mb-2">
      Taxpayer type:
    </label>
    <div className="flex gap-2">
      <button
        onClick={() => setBottomUpCategoryFilter(new Set(['individual']))}
        className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          bottomUpCategoryFilter.has('individual') && bottomUpCategoryFilter.size === 1
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
        }`}
      >
        👤 Individual
      </button>
      <button
        onClick={() => setBottomUpCategoryFilter(new Set(['corporation']))}
        className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          bottomUpCategoryFilter.has('corporation') && bottomUpCategoryFilter.size === 1
            ? 'bg-purple-600 text-white'
            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
        }`}
      >
        🏢 Corporation
      </button>
    </div>
    <p className="text-xs text-gray-500 mt-2">
      {bottomUpCategoryFilter.has('individual')
        ? 'Searching individual forms only'
        : 'Searching corporation forms only'}
    </p>
  </div>
)}



              {/* Node Type Filters */}
              {buildMode === 'bottom-up' && (
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Node types:
                  </label>
                  
                  <div className="flex gap-1.5 mb-2">
                    <button
                      onClick={selectAllNodeTypes}
                      className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                      style={{ fontSize: '9px' }}
                    >
                      Select all
                    </button>
                    <button
                      onClick={deselectAllNodeTypes}
                      className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                      style={{ fontSize: '9px' }}
                    >
                      Deselect all
                    </button>
                  </div>

                  <div className="space-y-2">
                    {[
                      { value: 'form', label: 'Forms' },
                      { value: 'line', label: 'Form Lines' },
                      { value: 'section', label: 'USC Sections' },
                      { value: 'regulation', label: 'Regulations' }
                    ].map(type => (
                      <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={nodeTypeFilters.has(type.value as any)}
                          onChange={() => toggleNodeType(type.value as any)}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-300">{type.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Edge Type Filters */}
              {buildMode === 'bottom-up' && (
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Relationship types:
                  </label>

                  <div className="flex gap-1.5 mb-2">
                    <button
                      onClick={selectAllEdgeTypes}
                      className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                      style={{ fontSize: '9px' }}
                    >
                      Select all
                    </button>
                    <button
                      onClick={deselectAllEdgeTypes}
                      className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                      style={{ fontSize: '9px' }}
                    >
                      Deselect all
                    </button>
                  </div>

                  <div className="space-y-2">
                    {[
                      { value: 'belongs_to', label: 'Belongs to (line → form)' },
                      { value: 'cites_section', label: 'Cites USC section' },
                      { value: 'cites_regulation', label: 'Cites regulation' }
                    ].map(type => (
                      <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={edgeTypeFilters.has(type.value as any)}
                          onChange={() => toggleEdgeType(type.value as any)}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-300">{type.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Node Search - top-down only */}
              {buildMode === 'top-down' && (
                <div className="mb-4 relative">
                  <label className="block text-sm text-gray-400 mb-2">
                    Search nodes:
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Form 1040, Schedule C, Section 162..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />

                  {searchQuery.trim().length >= 2 && (
                    <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {isSearching ? (
                        <div className="px-3 py-2 text-sm text-gray-400">
                          Searching...
                        </div>
                      ) : searchResults.length > 0 ? (
                        searchResults.map((actor) => (
                          <button
                            key={actor.name}
                            onClick={() => {
                              onActorSelect(actor.name);
                              setSearchQuery('');
                              setSearchResults([]);
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-600 transition-colors border-b border-gray-600 last:border-b-0"
                          >
                            <div className="font-medium text-white">{actor.name}</div>
                            <div className="text-xs text-gray-400">
                              {actor.connection_count} relationships
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-gray-400">
                          No nodes found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Keyword Filter/Search */}
              <form onSubmit={handleKeywordSubmit} className="mb-0">
                <label className="block text-sm text-gray-400 mb-2">
                  {buildMode === 'bottom-up' 
                    ? 'Build network from keywords:' 
                    : 'Keyword search:'}
                </label>
                
                {/* Search fields selection - bottom-up only */}
                {buildMode === 'bottom-up' && (
                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-2">
                      Search in fields:
                    </label>
                    
                    <div className="flex gap-1.5 mb-2">
                      <button
                        type="button"
                        onClick={selectAllSearchFields}
                        className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                        style={{ fontSize: '9px' }}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllSearchFields}
                        className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                        style={{ fontSize: '9px' }}
                      >
                        Deselect all
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {[
                        { value: 'name', label: 'Name (form/line/section/reg)' },
                        { value: 'full_name', label: 'Full name' },
                        { value: 'text', label: 'Text content' },
                        { value: 'definition', label: 'Definition' }
                      ].map(field => (
                        <label key={field.value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={searchFields.has(field.value)}
                            onChange={() => toggleSearchField(field.value)}
                            className="w-3.5 h-3.5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-300">{field.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search logic (AND/OR) - bottom-up only */}
                {buildMode === 'bottom-up' && (
                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-2">
                      Match logic:
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSearchLogic('OR')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          searchLogic === 'OR'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        OR (any)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSearchLogic('AND')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          searchLogic === 'AND'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        AND (all)
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {searchLogic === 'OR' 
                        ? 'Match nodes containing any keyword' 
                        : 'Match nodes containing all keywords'}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={localKeywords}
                    onChange={(e) => setLocalKeywords(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleKeywordSubmit()}
                    placeholder={buildMode === 'bottom-up' 
                      ? "1040, Schedule C, business expense" 
                      : "Form 1040, income, deduction"}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[#12B76A] hover:bg-[#0e9d5a] text-white"
                  >
                    {buildMode === 'bottom-up' ? 'Search' : 'Go'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {buildMode === 'bottom-up' 
                    ? 'Comma-separated keywords' 
                    : 'Search forms, lines, sections, and regulations'}
                </p>
              </form>
            </>
          )}
        </div>

        {/* Relationship categories - top-down only */}
        {stats && buildMode === 'top-down' && (
          <div className="p-4">
            <button
              onClick={() => setCategoriesExpanded(!categoriesExpanded)}
              className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
            >
              <span>Relationship types</span>
              <span className="text-sm">{categoriesExpanded ? '▼' : '▶'}</span>
            </button>
            {categoriesExpanded && (
              <>
                <div className="flex gap-1.5 mb-3">
                  <button
                    onClick={() => {
                      stats.categories.forEach(cat => {
                        if (!enabledCategories.has(cat.category)) {
                          onToggleCategory(cat.category);
                        }
                      });
                    }}
                    className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    style={{ fontSize: '9px' }}
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => {
                      stats.categories.forEach(cat => {
                        if (enabledCategories.has(cat.category)) {
                          onToggleCategory(cat.category);
                        }
                      });
                    }}
                    className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    style={{ fontSize: '9px' }}
                  >
                    Deselect all
                  </button>
                </div>
                <div className="space-y-2">
                  {stats.categories.map((cat) => {
                    const isEnabled = enabledCategories.has(cat.category);
                    const labels: Record<string, string> = {
                      'belongs_to': 'Belongs to',
                      'cites_section': 'Cites section',
                      'cites_regulation': 'Cites regulation'
                    };
                    return (
                      <button
                        key={cat.category}
                        onClick={() => onToggleCategory(cat.category)}
                        className={`w-full flex justify-between items-center rounded px-3 py-2 text-sm transition-colors ${
                          isEnabled
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        <span>
                          {labels[cat.category] || cat.category}
                        </span>
                        <span className="font-mono text-xs">
                          {cat.count.toLocaleString()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
