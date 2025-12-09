// src/components/Sidebar.tsx

import { useState, useEffect, useRef } from 'react';
import { searchActors } from '../api';
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
  }) => void;
  displayGraphInfo?: {
    nodeCount: number;
    truncated: boolean;
    matchedCount: number;
  };
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
  const [contentFiltersExpanded, setContentFiltersExpanded] = useState(false);
  const [graphSettingsExpanded, setGraphSettingsExpanded] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [localYearRange, setLocalYearRange] = useState<[number, number]>(yearRange);
  const [localLimit, setLocalLimit] = useState(limit);
  const [localKeywords, setLocalKeywords] = useState(keywords);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const limitDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [minSliderZIndex, setMinSliderZIndex] = useState(4);
  const [maxSliderZIndex, setMaxSliderZIndex] = useState(3);

  // Bottom-up mode state - initialize with all types selected
  const [nodeTypeFilters, setNodeTypeFilters] = useState<Set<'section' | 'entity' | 'concept'>>(
    new Set(['section', 'entity', 'concept'])
  );
  const [edgeTypeFilters, setEdgeTypeFilters] = useState<Set<'definition' | 'reference' | 'hierarchy'>>(
    new Set(['definition', 'reference', 'hierarchy'])
  );
  const [maxNodes, setMaxNodes] = useState(1000);
  const [expansionDegree, setExpansionDegree] = useState(1);

  // NEW: Search field selection
  const [searchFields, setSearchFields] = useState<Set<string>>(
    new Set(['text', 'section_heading', 'section_num', 'entity', 'concept'])
  );

  // NEW: Search logic (AND vs OR)
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
    setLocalYearRange(yearRange);
  }, [yearRange]);

  useEffect(() => {
    setLocalLimit(limit);
  }, [limit]);

  useEffect(() => {
    setLocalKeywords(keywords);
  }, [keywords]);

  // Reset search when switching to bottom-up mode
  useEffect(() => {
    if (buildMode === 'bottom-up') {
      setLocalKeywords('');
    }
  }, [buildMode]);

  const handleYearRangeChange = (newRange: [number, number]) => {
    setLocalYearRange(newRange);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onYearRangeChange(newRange);
    }, 2000);
  };

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

  const handleSliderMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const sliderWidth = rect.width;

    const minPosition = ((localYearRange[0] - 1970) / (2025 - 1970)) * sliderWidth;
    const maxPosition = ((localYearRange[1] - 1970) / (2025 - 1970)) * sliderWidth;

    const distanceToMin = Math.abs(mouseX - minPosition);
    const distanceToMax = Math.abs(mouseX - maxPosition);

    if (distanceToMin < distanceToMax) {
      setMinSliderZIndex(4);
      setMaxSliderZIndex(3);
    } else {
      setMinSliderZIndex(3);
      setMaxSliderZIndex(4);
    }
  };

  const handleKeywordSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (buildMode === 'bottom-up' && onBottomUpSearch) {
      // Bottom-up mode: trigger network build with all parameters
      onBottomUpSearch({
        keywords: localKeywords,
        expansionDegree: expansionDegree,
        maxNodes: maxNodes,
        nodeTypes: Array.from(nodeTypeFilters),
        edgeTypes: Array.from(edgeTypeFilters),
        searchFields: Array.from(searchFields),
        searchLogic: searchLogic
      });
    } else {
      // Top-down mode: apply filter
      onKeywordsChange(localKeywords);
    }
  };

  const toggleNodeType = (type: 'section' | 'entity' | 'concept') => {
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

  const toggleEdgeType = (type: 'definition' | 'reference' | 'hierarchy') => {
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

  // Select/Deselect all for node types
  const selectAllNodeTypes = () => {
    setNodeTypeFilters(new Set(['section', 'entity', 'concept']));
  };

  const deselectAllNodeTypes = () => {
    setNodeTypeFilters(new Set());
  };

  // Select/Deselect all for edge types
  const selectAllEdgeTypes = () => {
    setEdgeTypeFilters(new Set(['definition', 'reference', 'hierarchy']));
  };

  const deselectAllEdgeTypes = () => {
    setEdgeTypeFilters(new Set());
  };

  // Toggle search field
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

  // Select/Deselect all search fields
  const selectAllSearchFields = () => {
    setSearchFields(new Set(['text', 'section_heading', 'section_num', 'entity', 'concept']));
  };

  const deselectAllSearchFields = () => {
    setSearchFields(new Set());
  };

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-700 flex-shrink-0">
        <h1 className="font-bold text-blue-400" style={{ fontSize: '20px' }}>
          📊 Title 26 Network
        </h1>
        <p className="mt-1 text-xs text-gray-400">
          Sections, entities, and tags in the U.S. Code (Title 26).
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
              className="w-full px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm font-medium transition-colors"
            >
              ← Back to Full Network
            </button>
            {displayGraphInfo && displayGraphInfo.nodeCount > 0 && (
              <div className="p-2 bg-gray-900/50 rounded text-xs space-y-1">
                <div className="text-gray-300">
                  Displaying: <span className="font-mono text-green-400">{displayGraphInfo.nodeCount}</span> nodes
                </div>
                {displayGraphInfo.truncated && (
                  <div className="text-yellow-400">
                    ⚠ {displayGraphInfo.matchedCount} total matches (capped)
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onStartNewNetwork}
            className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
              <span className="text-gray-400">Sections:</span>
              <span className="font-mono text-green-400">
                {stats.totalDocuments.count.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Relationships:</span>
              <span className="font-mono text-blue-400">
                {stats.totalTriples.count.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Nodes (entities, tags):</span>
              <span className="font-mono text-purple-400">
                {stats.totalActors.count.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Selected node */}
      {selectedActor && (
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
            <div>
              <div className="text-xs text-gray-400 mb-1">Selected node:</div>
              <div className="font-medium text-blue-300">{selectedActor}</div>
            </div>
            <button
              onClick={() => onActorSelect(null)}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex-1 overflow-y-auto">
        {/* Graph Settings */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => setGraphSettingsExpanded(!graphSettingsExpanded)}
            className="w-full flex items-center justify-between text-base font-semibold mb-3 hover:text-blue-400 transition-colors"
          >
            <span>Graph settings</span>
            <span className="text-sm">{graphSettingsExpanded ? '▼' : '▶'}</span>
          </button>
          {graphSettingsExpanded && (
            <>
              {/* Show limit slider only in top-down mode */}
              {buildMode === 'top-down' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      Maximum relationships to display: {localLimit.toLocaleString()}
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="25000"
                      step="500"
                      value={localLimit}
                      onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Maximum nodes: {maxHops === null ? '2000' : maxHops}
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      step="100"
                      value={maxHops === null ? 2000 : maxHops}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        onMaxHopsChange(value);
                      }}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>100</span>
                      <span>1000</span>
                      <span>2000</span>
                    </div>
                  </div>
                </>
              )}

              {/* Degree of connection slider for bottom-up mode */}
              {buildMode === 'bottom-up' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      Degrees of connection: {expansionDegree}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="1"
                      value={expansionDegree}
                      onChange={(e) => setExpansionDegree(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0</span>
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                      <span>4</span>
                      <span>5</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {expansionDegree === 0 
                        ? 'Show only nodes matching the search'
                        : `Include nodes up to ${expansionDegree} connection${expansionDegree > 1 ? 's' : ''} away`}
                    </p>
                  </div>

                  {/* Max nodes slider for bottom-up mode */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Maximum nodes: {maxNodes.toLocaleString()}
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      step="100"
                      value={maxNodes}
                      onChange={(e) => setMaxNodes(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>100</span>
                      <span>1000</span>
                      <span>2000</span>
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
            className="w-full flex items-center justify-between text-base font-semibold mb-3 hover:text-blue-400 transition-colors"
          >
            <span>Filters</span>
            <span className="text-sm">{filtersExpanded ? '▼' : '▶'}</span>
          </button>
          {filtersExpanded && (
            <>
              {/* Node Type Filters - shown in bottom-up mode */}
              {buildMode === 'bottom-up' && (
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Node types to include:
                  </label>
                  
                  {/* Select/Deselect All Buttons */}
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
                    {(['section', 'entity', 'tag'] as const).map(type => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={nodeTypeFilters.has(type)}
                          onChange={() => toggleNodeType(type)}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-300 capitalize">{type}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Leave all unchecked to include all types.
                  </p>
                </div>
              )}

              {/* Edge Type Filters - shown in bottom-up mode */}
              {buildMode === 'bottom-up' && (
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Relationship types to include:
                  </label>

                  {/* Select/Deselect All Buttons */}
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
                    {(['citation', 'section_entity', 'section_tag'] as const).map(type => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={edgeTypeFilters.has(type)}
                          onChange={() => toggleEdgeType(type)}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-300">{type.replace('_', ' ')}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Leave all unchecked to include all relationship types.
                  </p>
                </div>
              )}

              {/* Show time range only in top-down mode */}
              {buildMode === 'top-down' && (
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Time range (for future temporal data): {localYearRange[0]} - {localYearRange[1]}
                  </label>
                  <div className="relative pt-1">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>1970</span>
                      <span>2025</span>
                    </div>
                    <div className="relative h-6" onMouseMove={handleSliderMouseMove}>
                      <input
                        type="range"
                        min="1970"
                        max="2025"
                        step="1"
                        value={localYearRange[1]}
                        onChange={(e) => {
                          const newMax = parseInt(e.target.value);
                          if (newMax >= localYearRange[0]) {
                            handleYearRangeChange([localYearRange[0], newMax]);
                          }
                        }}
                        className="absolute top-2 w-full h-2 bg-transparent appearance-none cursor-pointer"
                        style={{
                          zIndex: maxSliderZIndex,
                          pointerEvents: 'auto',
                        }}
                      />
                      <input
                        type="range"
                        min="1970"
                        max="2025"
                        step="1"
                        value={localYearRange[0]}
                        onChange={(e) => {
                          const newMin = parseInt(e.target.value);
                          if (newMin <= localYearRange[1]) {
                            handleYearRangeChange([newMin, localYearRange[1]]);
                          }
                        }}
                        className="absolute top-2 w-full h-2 bg-transparent appearance-none cursor-pointer"
                        style={{
                          zIndex: minSliderZIndex,
                          pointerEvents: 'auto',
                        }}
                      />
                      <div className="absolute top-2 w-full h-2 bg-gray-700 rounded-lg pointer-events-none" style={{ zIndex: 1 }}>
                        <div
                          className="absolute h-2 bg-blue-600 rounded-lg"
                          style={{
                            left: `${((localYearRange[0] - 1970) / (2025 - 1970)) * 100}%`,
                            right: `${100 - ((localYearRange[1] - 1970) / (2025 - 1970)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center">
                    <input
                      type="checkbox"
                      id="includeUndated"
                      checked={includeUndated}
                      onChange={(e) => onIncludeUndatedChange(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <label htmlFor="includeUndated" className="ml-2 text-sm text-gray-400 cursor-pointer">
                      Include undated items
                    </label>
                  </div>
                </div>
              )}

              {/* Node Search - only in top-down mode */}
              {buildMode === 'top-down' && (
                <div className="mb-4 relative">
                  <label className="block text-sm text-gray-400 mb-2">
                    Search nodes:
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g., § 1, Secretary, income tax"
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

              {/* Keyword Filter/Search - dual purpose */}
              <form onSubmit={handleKeywordSubmit} className="mb-0">
                <label className="block text-sm text-gray-400 mb-2">
                  {buildMode === 'bottom-up' 
                    ? 'Build network from keywords:' 
                    : 'Keyword filter (not yet wired to US Code text):'}
                </label>
                
                {/* NEW: Search fields selection - only in bottom-up mode */}
                {buildMode === 'bottom-up' && (
                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-2">
                      Search in fields:
                    </label>
                    
                    {/* Select/Deselect All Buttons */}
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
                        { value: 'section_text', label: 'Section text' },
                        { value: 'section_heading', label: 'Section heading' },
                        { value: 'section_num', label: 'Section number' },
                        { value: 'entity', label: 'Entity names' },
                        { value: 'tag', label: 'Tags' }
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

                {/* NEW: Search logic (AND/OR) - only in bottom-up mode */}
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
                      ? "tax, income, penalty" 
                      : "e.g., income, penalty, exemption"}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      buildMode === 'bottom-up'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {buildMode === 'bottom-up' ? 'Search' : 'Go'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {buildMode === 'bottom-up' 
                    ? 'Comma-separated keywords. Customize search fields and logic above.' 
                    : 'Comma-separated keywords (currently a placeholder control).'}
                </p>
              </form>
            </>
          )}
        </div>

        {/* Tag Cluster Filters - only in top-down mode */}
        {buildMode === 'top-down' && (
          <div className="p-4 border-b border-gray-700">
            <button
              onClick={() => setContentFiltersExpanded(!contentFiltersExpanded)}
              className="w-full flex items-center justify-between text-base font-semibold mb-3 hover:text-blue-400 transition-colors"
            >
              <span>Tag clusters</span>
              <span className="text-sm">{contentFiltersExpanded ? '▼' : '▶'}</span>
            </button>
            {contentFiltersExpanded && (
              <>
                <div className="flex gap-1.5 mb-3">
                  <button
                    onClick={() => {
                      tagClusters.forEach(cluster => {
                        if (!enabledClusterIds.has(cluster.id)) {
                          onToggleCluster(cluster.id);
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
                      tagClusters.forEach(cluster => {
                        if (enabledClusterIds.has(cluster.id)) {
                          onToggleCluster(cluster.id);
                        }
                      });
                    }}
                    className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    style={{ fontSize: '9px' }}
                  >
                    Deselect all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tagClusters.map((cluster) => {
                    const isEnabled = enabledClusterIds.has(cluster.id);
                    return (
                      <button
                        key={cluster.id}
                        onClick={() => onToggleCluster(cluster.id)}
                        className={`px-3 py-1 rounded-full font-medium transition-colors ${
                          isEnabled
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                        style={{ fontSize: '10px' }}
                        title={`${cluster.tagCount} tags: ${cluster.exemplars.join(', ')}`}
                      >
                        {cluster.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Relationship categories - only in top-down mode */}
        {stats && buildMode === 'top-down' && (
          <div className="p-4">
            <button
              onClick={() => setCategoriesExpanded(!categoriesExpanded)}
              className="w-full flex items-center justify-between text-base font-semibold mb-3 hover:text-blue-400 transition-colors"
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
                  {stats.categories.slice(0, 10).map((cat) => {
                    const isEnabled = enabledCategories.has(cat.category);
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
                        <span className="capitalize">
                          {cat.category.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-xs">
                          {cat.count}
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
