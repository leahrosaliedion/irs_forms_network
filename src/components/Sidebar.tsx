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
  enabledNodeTypes: Set<string>;
  onToggleNodeType: (nodeType: string) => void;
  categoryFilter: Set<'individual' | 'corporation'>;
  onToggleCategoryFilter: (category: 'individual' | 'corporation') => void;
  yearRange: [number, number];
  onYearRangeChange: (range: [number, number]) => void;
  includeUndated: boolean;
  onIncludeUndatedChange: (include: boolean) => void;
  keywords: string;
  onKeywordsChange: (keywords: string) => void;
  buildMode: 'topDown' | 'bottomUp'; // ✅ UPDATED: Made required (removed ?)
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
    linkCount: number; // ✅ ADDED: Link count for bottom-up mode
    truncated: boolean;
    matchedCount: number;
  };
  topDownGraphInfo?: {
    nodeCount: number;
    linkCount: number;
  } | null;
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
  enabledNodeTypes,
  onToggleNodeType,
  categoryFilter,
  onToggleCategoryFilter,
  yearRange,
  onYearRangeChange,
  includeUndated,
  onIncludeUndatedChange,
  keywords,
  onKeywordsChange,
  buildMode, // ✅ UPDATED: Removed default value
  onStartNewNetwork,
  onResetToTopDown,
  onBottomUpSearch,
  displayGraphInfo,
  topDownGraphInfo
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
  const [nodeTypesExpanded, setNodeTypesExpanded] = useState(false);
  
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
    
    if (onBottomUpSearch) {
      onBottomUpSearch({
        keywords: localKeywords,
        expansionDegree: expansionDegree,
        maxNodes: maxNodes || 1500,
        nodeTypes: Array.from(enabledNodeTypes),
        edgeTypes: Array.from(enabledCategories),
        searchFields: Array.from(searchFields),
        searchLogic: searchLogic,
        categoryFilter: Array.from(categoryFilter),
        nodeRankingMode  
      });
    }
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
  ['form', 'line', 'index', 'regulation'].forEach(type => {
    if (!enabledNodeTypes.has(type)) {
      onToggleNodeType(type);
    }
  });
};

const deselectAllNodeTypes = () => {
  ['form', 'line', 'index', 'regulation'].forEach(type => {
    if (enabledNodeTypes.has(type)) {
      onToggleNodeType(type);
    }
  });
};

const selectAllEdgeTypes = () => {
  ['belongs_to', 'cites_section', 'cites_regulation', 'hierarchy', 'reference'].forEach(type => {
    if (!enabledCategories.has(type)) {
      onToggleCategory(type);
    }
  });
};

const deselectAllEdgeTypes = () => {
  ['belongs_to', 'cites_section', 'cites_regulation', 'hierarchy', 'reference'].forEach(type => {
    if (enabledCategories.has(type)) {
      onToggleCategory(type);
    }
  });
};


  const selectAllCategories = () => {
    setBottomUpCategoryFilter(new Set(['individual', 'corporation']));
  };

  const deselectAllCategories = () => {
    setBottomUpCategoryFilter(new Set());
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

      {/* Search nodes box */}
      <div className="py-3 border-b border-gray-700 flex-shrink-0">
        <div className="px-4 relative">
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
            <div className="absolute z-10 left-4 right-4 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
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
      </div>

      {/* ✅ UPDATED: Stats section - shows counters for both modes */}
      {/* Stats */}
{stats && (
  <div className="p-4 border-b border-gray-700 flex-shrink-0">
    <div className="space-y-2 text-sm">
      {/* ✅ UPDATED: Use same styling for both modes */}
      {((buildMode === 'topDown' && topDownGraphInfo && topDownGraphInfo.nodeCount > 0) ||
        (buildMode === 'bottomUp' && displayGraphInfo && displayGraphInfo.nodeCount > 0)) && (
        <div className="mb-3 p-2 bg-gray-900/50 rounded text-xs space-y-1 border border-gray-700">
          <div className="flex justify-between">
            <span className="text-gray-100">Displaying nodes:</span>
            <span className="font-mono text-green-400">
              {buildMode === 'topDown' 
                ? topDownGraphInfo?.nodeCount.toLocaleString()
                : displayGraphInfo?.nodeCount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-100">Displaying relationships:</span>
            <span className="font-mono text-green-400">
              {buildMode === 'topDown'
                ? topDownGraphInfo?.linkCount.toLocaleString()
                : displayGraphInfo?.linkCount.toLocaleString()}
            </span>
          </div>
          {buildMode === 'bottomUp' && displayGraphInfo?.truncated && (
            <div className="text-yellow-400 text-xs mt-1">
              ⚠️ Results truncated (matched {displayGraphInfo.matchedCount.toLocaleString()} nodes)
            </div>
          )}
        </div>
      )}
      
      {/* Total stats */}
      <div className="flex justify-between">
        <span className="text-gray-400">Total nodes:</span>
        <span className="font-mono text-blue-400">
          {stats.totalDocuments.count.toLocaleString()}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Total relationships:</span>
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
  {/* Graph Settings - ALWAYS SHOW */}
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
        {/* Maximum relationships */}
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

        {/* Maximum nodes */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">
            Maximum nodes: {maxHops === null ? '1500' : maxHops}
          </label>
          <input
            type="range"
            min="100"
            max="3000"
            step="100"
            value={maxHops === null ? 1500 : maxHops}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              onMaxHopsChange(value);
            }}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>100</span>
            <span>1500</span>
            <span>3000</span>
          </div>
        </div>

        {/* Taxpayer Category Toggle - ALWAYS SHOW */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">
            Taxpayer type:
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
      </>
    )}
  </div>

  {/* Search */}
  <div className="p-4 border-b border-gray-700">
    <button
      onClick={() => setFiltersExpanded(!filtersExpanded)}
      className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
    >
      <span>Search</span>
      <span className="text-sm">{filtersExpanded ? '▼' : '▶'}</span>
    </button>
    {filtersExpanded && (
      <>
        {/* Degrees of Connection */}
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

        {/* Search logic (AND/OR) */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">
            Match logic:
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSearchLogic('OR')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                searchLogic === 'OR'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              ANY
            </button>
            <button
              type="button"
              onClick={() => setSearchLogic('AND')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                searchLogic === 'AND'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              ALL
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {searchLogic === 'OR' 
              ? 'Match nodes containing any keyword' 
              : 'Match nodes containing all keywords'}
          </p>
        </div>

        {/* Keyword search */}
<form onSubmit={handleKeywordSubmit} className="mb-0">
  <label className="block text-sm text-gray-400 mb-2">
    Keyword search:
  </label>

  <div className="flex gap-2">
    <input
      type="text"
      value={localKeywords}
      onChange={(e) => setLocalKeywords(e.target.value)}
      onKeyPress={(e) => e.key === 'Enter' && handleKeywordSubmit()}
      placeholder="1040, Schedule C, business expense"
      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500"
    />
    <button
      type="submit"
      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[#12B76A] hover:bg-[#0e9d5a] text-white"
    >
      Search
    </button>
  </div>
  <p className="text-xs text-gray-500 mt-1">
    Comma-separated keywords
  </p>
</form>

      </>
    )}
  </div>

  {/* Node types - ALWAYS SHOW */}
  {stats && (
    <div className="p-4 border-b border-gray-700">
      <button
        onClick={() => setNodeTypesExpanded(!nodeTypesExpanded)}
        className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
      >
        <span>Node filters</span>
        <span className="text-sm">{nodeTypesExpanded ? '▼' : '▶'}</span>
      </button>
      
      {nodeTypesExpanded && (
        <>
          <div className="flex gap-1.5 mb-3">
            <button
              onClick={() => {
                ['form', 'line', 'index', 'regulation'].forEach(type => {
                  if (!enabledNodeTypes.has(type)) {
                    onToggleNodeType(type);
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
                ['form', 'line', 'index', 'regulation'].forEach(type => {
                  if (enabledNodeTypes.has(type)) {
                    onToggleNodeType(type);
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
            {[
              { type: 'index', label: 'USC Sections' },
              { type: 'line', label: 'Lines' },
              { type: 'form', label: 'Forms' },
              { type: 'regulation', label: 'Regulations' }
            ].map((item) => {
              const isEnabled = enabledNodeTypes.has(item.type);
              return (
                <button
                  key={item.type}
                  onClick={() => onToggleNodeType(item.type)}
                  className={`w-full flex justify-between items-center rounded px-3 py-2 text-sm transition-colors ${
                    isEnabled
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  )}

  {/* Relationship categories - ALWAYS SHOW */}
  {stats && (
    <div className="p-4">
      <button
        onClick={() => setCategoriesExpanded(!categoriesExpanded)}
        className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
      >
        <span>Relationship filters</span>
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
                'belongs_to': 'Form → Line',
                'cites_section': 'Line → Section',
                'cites_regulation': 'Line → Regulation',
                'hierarchy': 'Title 26 Hierarchy',
                'reference': 'Title 26 References'
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
