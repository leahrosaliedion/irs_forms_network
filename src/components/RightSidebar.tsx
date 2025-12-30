// src/components/RightSidebar.tsx

import { useState, useEffect } from 'react';
import { searchActors, fetchNodeDetails } from '../api';
import type { Relationship, Actor, GraphNode } from '../types';
import DocumentModal from './DocumentModal';

interface RightSidebarProps {
  selectedActor: string | null;
  relationships: Relationship[];
  totalRelationships: number;
  onClose: () => void;
  yearRange: [number, number];
  keywords?: string;
  categoryFilter?: 'individual' | 'corporation' | 'all';
  onActorClick?: (actorName: string | null) => void;
}

export default function RightSidebar({
  selectedActor,
  relationships,
  totalRelationships,
  onClose,
  yearRange,
  keywords,
  categoryFilter = 'all',
  onActorClick,
}: RightSidebarProps) {
  const [expandedRelId, setExpandedRelId] = useState<number | null>(null);
  const [documentToView, setDocumentToView] = useState<string | null>(null);
  const [filterActor, setFilterActor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Actor[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [nodeDetails, setNodeDetails] = useState<Record<string, GraphNode | null>>({});
  const [selectedActorDetails, setSelectedActorDetails] = useState<GraphNode | null>(null);

  if (!selectedActor) return null;

  // ✅ Helper function to get display metrics based on category filter
  const getDisplayMetrics = (node: GraphNode | null) => {
    if (!node) return null;

    // For form and line nodes with category field - use their direct metrics
    if (node.category) {
      return {
        total_amount: node.total_amount,
        total_num_forms: node.total_num_forms,
        amount_per_form: node.amount_per_form,
        num_lines: node.num_lines,
        amount: node.amount, // for lines
        num_forms: node.num_forms, // for lines
      };
    }

    // ✅ UPDATED: For index AND regulation nodes - use category-specific fields based on filter
    if (node.node_type === 'index' || node.node_type === 'regulation') {
      if (categoryFilter === 'individual') {
        return {
          total_amount: node.ind_total_amount,
          total_num_forms: node.ind_total_num_forms,
          amount_per_form: node.ind_amount_per_form,
          num_lines: node.ind_num_lines,
        };
      } else if (categoryFilter === 'corporation') {
        return {
          total_amount: node.corp_total_amount,
          total_num_forms: node.corp_total_num_forms,
          amount_per_form: node.corp_amount_per_form,
          num_lines: node.corp_num_lines,
        };
      } else {
        // 'all' - show combined totals
        const ind_amt = node.ind_total_amount || 0;
        const corp_amt = node.corp_total_amount || 0;
        const ind_forms = node.ind_total_num_forms || 0;
        const corp_forms = node.corp_total_num_forms || 0;
        const total_amt = ind_amt + corp_amt;
        const total_forms = ind_forms + corp_forms;

        return {
          total_amount: total_amt > 0 ? total_amt : null,
          total_num_forms: total_forms > 0 ? total_forms : null,
          amount_per_form: total_amt > 0 && total_forms > 0 ? total_amt / total_forms : null,
          num_lines: (node.ind_num_lines || 0) + (node.corp_num_lines || 0),
        };
      }
    }

    // Fallback to direct metrics
    return {
      total_amount: node.total_amount,
      total_num_forms: node.total_num_forms,
      amount_per_form: node.amount_per_form,
      num_lines: node.num_lines,
    };
  };

  // Fetch details for selected actor
  useEffect(() => {
    const fetchSelectedActorDetails = async () => {
      if (!selectedActor) {
        setSelectedActorDetails(null);
        return;
      }

      try {
        const details = await fetchNodeDetails(selectedActor);
        setSelectedActorDetails(details);
      } catch (err) {
        console.error('Failed to fetch selected actor details:', err);
        setSelectedActorDetails(null);
      }
    };

    fetchSelectedActorDetails();
  }, [selectedActor]);

  // Search for another node to filter by
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

  // Filter relationships by a second node if chosen
  const filteredRelationships = filterActor
    ? relationships.filter(rel =>
        rel.actor === filterActor || rel.target === filterActor
      )
    : relationships;

  // Sort relationships by edge type
  const sortedRelationships = [...filteredRelationships].sort((a, b) => {
    const order = { 'belongs_to': 1, 'cites_section': 2, 'cites_regulation': 3 };
    return (order[a.edge_type as keyof typeof order] || 99) - (order[b.edge_type as keyof typeof order] || 99);
  });

  // Toggle expansion and fetch neighbor node details
  const toggleExpand = async (rel: Relationship) => {
    if (expandedRelId === rel.id) {
      setExpandedRelId(null);
      return;
    }

    setExpandedRelId(rel.id);

    const isActorSelected = rel.actor === selectedActor;
    const neighborId = isActorSelected
      ? (rel.target_id ?? rel.target)
      : (rel.actor_id ?? rel.actor);

    if (!nodeDetails[neighborId]) {
      try {
        const details = await fetchNodeDetails(neighborId);
        setNodeDetails(prev => ({ ...prev, [neighborId]: details }));
      } catch (err) {
        console.error('Failed to fetch node details:', err);
        setNodeDetails(prev => ({ ...prev, [neighborId]: null }));
      }
    }
  };

  const getCategoryBadge = (category?: string) => {
    return category === 'individual' ? '👤' : category === 'corporation' ? '🏢' : '';
  };

  const getNodeTypeLabel = (type?: string) => {
    const labels: Record<string, string> = {
      'form': 'Form',
      'line': 'Line',
      'index': 'USC Section',
      'section': 'USC Section',
      'regulation': 'Regulation'
    };
    return labels[type || ''] || type || 'Unknown';
  };

  const formatAmount = (amount: number | null | undefined): string => {
    return amount !== null && amount !== undefined
      ? `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'N/A';
  };

  const formatNumForms = (numForms: number | null | undefined): string => {
    return numForms !== null && numForms !== undefined
      ? numForms.toLocaleString()
      : 'N/A';
  };

  const getNodeTypeColor = (type?: string): string => {
    const colors: Record<string, string> = {
      'form': '#88BACE',
      'line': '#C679B4',
      'index': '#41378F',
      'section': '#41378F',
      'regulation': '#A67EB3'
    };
    return colors[type || ''] || '#AFBBE8';
  };

  const formatAmountPerForm = (amount: number | null | undefined): string => {
    return amount !== null && amount !== undefined
      ? `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'N/A';
  };

  const getNodeTypeFromRel = (nodeName: string, nodeId?: string): string | undefined => {
    if (nodeId && nodeDetails[nodeId]) {
      return nodeDetails[nodeId]?.node_type;
    }

    if (nodeId) {
      const parts = nodeId.split(':');
      if (parts.length > 0) {
        return parts[0];
      }
    }

    return undefined;
  };

  const getCategoryFilterLabel = () => {
    if (categoryFilter === 'individual') return 'Individual';
    if (categoryFilter === 'corporation') return 'Corporation';
    return 'Combined';
  };

  const selectedMetrics = getDisplayMetrics(selectedActorDetails);

  return (
    <>
      <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold text-blue-400">Node relationships</h2>
              </div>

              {/* Selected node info */}
              <div className="mt-2">
                <p className="text-sm text-white font-medium">
                  {selectedActorDetails && getCategoryBadge(selectedActorDetails.category)}{' '}
                  {selectedActorDetails?.name || selectedActor}
                </p>
                {selectedActorDetails && (
                  <p className="text-xs text-gray-400">
                    {getNodeTypeLabel(selectedActorDetails.node_type)}
                    {selectedActorDetails.category && ` · ${selectedActorDetails.category}`}
                  </p>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-1">
                Showing {sortedRelationships.length} of {totalRelationships} relationships
              </p>

              {/* Node-specific details and actions */}
<div className="mt-3 space-y-2">
  {/* Line node: neutral styling */}
  {selectedActorDetails?.node_type === 'line' && selectedMetrics && (
    <div className="p-3 bg-gray-700/50 border border-gray-600 rounded text-xs space-y-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          Line Metrics
        </div>
        <div className={`text-xs font-semibold px-2 py-0.5 rounded ${
          selectedActorDetails.category === 'corporation' 
            ? 'text-purple-400 bg-purple-900/30' 
            : 'text-blue-400 bg-blue-900/30'
        }`}>
          {selectedActorDetails.category === 'corporation' ? 'Corporation' : 'Individual'}
        </div>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Amount:</span>
        <span className="font-mono text-white font-medium">
          {formatAmount(selectedMetrics.amount)}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Forms:</span>
        <span className="font-mono text-white font-medium">
          {formatNumForms(selectedMetrics.num_forms)}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Amount per form:</span>
        <span className="font-mono text-white font-medium">
          {formatAmountPerForm(selectedActorDetails.amount_per_form)}
        </span>
      </div>
    </div>
  )}


                {/* Form node: neutral styling */}
{selectedActorDetails?.node_type === 'form' && selectedMetrics && (
  <div className="p-3 bg-gray-700/50 border border-gray-600 rounded text-xs space-y-2">
    <div className="flex items-center justify-between mb-2">
      <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
        Form Aggregates
      </div>
      <div className={`text-xs font-semibold px-2 py-0.5 rounded ${
        selectedActorDetails.category === 'corporation' 
          ? 'text-purple-400 bg-purple-900/30' 
          : 'text-blue-400 bg-blue-900/30'
      }`}>
        {selectedActorDetails.category === 'corporation' ? 'Corporation' : 'Individual'}
      </div>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-400">Total amount:</span>
      <span className="font-mono text-white font-medium">
        {formatAmount(selectedMetrics.total_amount)}
      </span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-400">Total forms:</span>
      <span className="font-mono text-white font-medium">
        {formatNumForms(selectedMetrics.total_num_forms)}
      </span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-400">Avg per form:</span>
      <span className="font-mono text-white font-medium">
        {formatAmountPerForm(selectedMetrics.amount_per_form)}
      </span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-400">Lines:</span>
      <span className="font-mono text-white font-medium">
        {selectedMetrics.num_lines?.toLocaleString() || 'N/A'}
      </span>
    </div>
  </div>
)}


                {/* Index/Section node: neutral styling with category badge */}
                {selectedActorDetails?.node_type === 'index' && selectedMetrics && (
                  <div className="p-3 bg-gray-700/50 border border-gray-600 rounded text-xs space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                        Section Aggregates
                      </div>
                      <div className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        categoryFilter === 'corporation' 
                          ? 'text-purple-400 bg-purple-900/30' 
                          : categoryFilter === 'individual'
                          ? 'text-blue-400 bg-blue-900/30'
                          : 'text-gray-400 bg-gray-900/30'
                      }`}>
                        {getCategoryFilterLabel()}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total amount:</span>
                      <span className="font-mono text-white font-medium">
                        {formatAmount(selectedMetrics.total_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total forms:</span>
                      <span className="font-mono text-white font-medium">
                        {formatNumForms(selectedMetrics.total_num_forms)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg per form:</span>
                      <span className="font-mono text-white font-medium">
                        {formatAmountPerForm(selectedMetrics.amount_per_form)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Citing lines:</span>
                      <span className="font-mono text-white font-medium">
                        {selectedMetrics.num_lines?.toLocaleString() || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}

                {/* ✅ NEW: Regulation node: neutral styling with category badge */}
                {selectedActorDetails?.node_type === 'regulation' && selectedMetrics && (
                  <div className="p-3 bg-gray-700/50 border border-gray-600 rounded text-xs space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                        Regulation Aggregates
                      </div>
                      <div className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        categoryFilter === 'corporation' 
                          ? 'text-purple-400 bg-purple-900/30' 
                          : categoryFilter === 'individual'
                          ? 'text-blue-400 bg-blue-900/30'
                          : 'text-gray-400 bg-gray-900/30'
                      }`}>
                        {getCategoryFilterLabel()}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total amount:</span>
                      <span className="font-mono text-white font-medium">
                        {formatAmount(selectedMetrics.total_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total forms:</span>
                      <span className="font-mono text-white font-medium">
                        {formatNumForms(selectedMetrics.total_num_forms)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg per form:</span>
                      <span className="font-mono text-white font-medium">
                        {formatAmountPerForm(selectedMetrics.amount_per_form)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Citing lines:</span>
                      <span className="font-mono text-white font-medium">
                        {selectedMetrics.num_lines?.toLocaleString() || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}

                {/* View text button for section/regulation/index */}
                {selectedActorDetails && 
                 (selectedActorDetails.node_type === 'section' || 
                  selectedActorDetails.node_type === 'index' ||
                  selectedActorDetails.node_type === 'regulation') && (
                  <button
                    onClick={() => setDocumentToView(selectedActorDetails.id)}
                    className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition-colors w-full"
                  >
                    View full text
                  </button>
                )}

                {/* Show definition if available */}
                {selectedActorDetails?.definition && (
                  <div className="p-2 bg-blue-900/20 border border-blue-700/30 rounded">
                    <div className="text-xs text-blue-400 font-semibold mb-1">Definition:</div>
                    <div className="text-xs text-gray-300">{selectedActorDetails.definition}</div>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors ml-2"
            >
              ✕
            </button>
          </div>

          {/* Filter by another node */}
          <div className="relative mt-3">
            {filterActor ? (
              <div className="flex items-center justify-between bg-blue-900/30 border border-blue-700/50 rounded px-2 py-1">
                <div>
                  <div className="text-xs text-gray-400">Filtered by node:</div>
                  <div className="text-sm text-blue-300 font-medium">{filterActor}</div>
                </div>
                <button
                  onClick={() => {
                    setFilterActor(null);
                    setSearchQuery('');
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Clear
                </button>
              </div>
            ) : (
              <>
                <label className="block text-xs text-gray-400 mb-1">
                  Filter by another node:
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Form 1040, Schedule C..."
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                />

                {searchQuery.trim().length >= 2 && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg max-h-40 overflow-y-auto">
                    {isSearching ? (
                      <div className="px-2 py-1 text-xs text-gray-400">
                        Searching...
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((actor) => (
                        <button
                          key={actor.name}
                          onClick={() => {
                            setFilterActor(actor.name);
                            setSearchQuery('');
                            setSearchResults([]);
                            onActorClick?.(actor.name);
                          }}
                          className="w-full px-2 py-1 text-left text-xs hover:bg-gray-600 transition-colors border-b border-gray-600 last:border-b-0"
                        >
                          <div className="font-medium text-white">{actor.name}</div>
                          <div className="text-xs text-gray-400">
                            {actor.connection_count} relationships
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-2 py-1 text-xs text-gray-400">
                        No nodes found
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Relationship list */}
        <div className="flex-1 overflow-y-auto">
          {sortedRelationships.length === 0 ? (
            <p className="text-gray-500 text-sm p-4">No relationships found</p>
          ) : (
            sortedRelationships.map((rel, index) => {
              const isExpanded = expandedRelId === rel.id;
              const isActorSelected = rel.actor === selectedActor;

              const neighborId = isActorSelected
                ? (rel.target_id ?? rel.target)
                : (rel.actor_id ?? rel.actor);
              const neighborDetails = nodeDetails[neighborId];
              const neighborMetrics = getDisplayMetrics(neighborDetails);

              return (
                <div key={rel.id}>
                  {/* Relationship header */}
                  <div
                    onClick={() => toggleExpand(rel)}
                    className={`p-4 cursor-pointer hover:bg-gray-700/30 transition-colors ${
                      isExpanded ? 'bg-gray-700/20' : ''
                    }`}
                  >
                    <div className="text-sm flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span 
                            className="font-medium"
                            style={{ color: getNodeTypeColor(getNodeTypeFromRel(rel.actor, rel.actor_id)) }}
                          >
                            {rel.actor}
                          </span>
                          <span className="text-gray-400 text-xs">
                            {rel.action}
                          </span>
                          <span 
                            className="font-medium"
                            style={{ color: getNodeTypeColor(getNodeTypeFromRel(rel.target, rel.target_id)) }}
                          >
                            {rel.target}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {rel.edge_type?.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <span className="text-gray-500 text-xs ml-2 flex-shrink-0">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded node metadata */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-gray-700/10">
                      {neighborDetails === undefined && (
                        <div className="text-xs text-gray-500">
                          Loading node details...
                        </div>
                      )}

                      {/* Form node */}
{neighborDetails && neighborDetails.node_type === 'form' && neighborMetrics && (
  <div className="space-y-2">
    <div className="text-xs text-gray-400 mb-1">Form details</div>
    <div className="font-semibold text-sm text-white">
      {getCategoryBadge(neighborDetails.category)} {neighborDetails.name}
    </div>
    <div className={`text-xs font-semibold px-2 py-0.5 rounded inline-block ${
      neighborDetails.category === 'corporation' 
        ? 'text-purple-400 bg-purple-900/30' 
        : 'text-blue-400 bg-blue-900/30'
    }`}>
      {neighborDetails.category === 'corporation' ? 'Corporation' : 'Individual'}
    </div>
    {neighborDetails.full_name && (
      <div className="text-xs text-gray-300">
        {neighborDetails.full_name}
      </div>
    )}
    <div className="mt-2 p-2 bg-gray-700/30 rounded space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">Total amount:</span>
        <span className="font-mono text-white font-medium">
          {formatAmount(neighborMetrics.total_amount)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">Total forms:</span>
        <span className="font-mono text-white font-medium">
          {formatNumForms(neighborMetrics.total_num_forms)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">Avg per form:</span>
        <span className="font-mono text-white font-medium">
          {formatAmountPerForm(neighborMetrics.amount_per_form)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">Lines:</span>
        <span className="font-mono text-white font-medium">
          {neighborMetrics.num_lines?.toLocaleString() || 'N/A'}
        </span>
      </div>
    </div>
  </div>
)}


                      {/* Line node */}
{neighborDetails && neighborDetails.node_type === 'line' && neighborMetrics && (
  <div className="space-y-2">
    <div className="text-xs text-gray-400 mb-1">Line details</div>
    <div className="font-semibold text-sm text-white">
      {getCategoryBadge(neighborDetails.category)} {neighborDetails.name}
    </div>
    <div className={`text-xs font-semibold px-2 py-0.5 rounded inline-block ${
      neighborDetails.category === 'corporation' 
        ? 'text-purple-400 bg-purple-900/30' 
        : 'text-blue-400 bg-blue-900/30'
    }`}>
      {neighborDetails.category === 'corporation' ? 'Corporation' : 'Individual'}
    </div>
    <div className="mt-2 p-2 bg-gray-700/30 rounded space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">Amount:</span>
        <span className="font-mono text-white font-medium">
          {formatAmount(neighborMetrics.amount)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">Forms:</span>
        <span className="font-mono text-white font-medium">
          {formatNumForms(neighborMetrics.num_forms)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">Amount per form:</span>
        <span className="font-mono text-white font-medium">
          {formatAmountPerForm(neighborDetails.amount_per_form)}
        </span>
      </div>
    </div>
  </div>
)}


                      {/* Section/Index node */}
                      {neighborDetails && (neighborDetails.node_type === 'section' || neighborDetails.node_type === 'index') && neighborMetrics && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">USC Section</div>
                          <div className="font-semibold text-sm text-white">
                            {neighborDetails.name}
                          </div>
                          <div className={`text-xs font-semibold px-2 py-0.5 rounded inline-block ${
                            categoryFilter === 'corporation' 
                              ? 'text-purple-400 bg-purple-900/30' 
                              : categoryFilter === 'individual'
                              ? 'text-blue-400 bg-blue-900/30'
                              : 'text-gray-400 bg-gray-900/30'
                          }`}>
                            {getCategoryFilterLabel()}
                          </div>
                          {neighborDetails.full_name && (
                            <div className="text-xs text-gray-300">
                              {neighborDetails.full_name}
                            </div>
                          )}
                          {neighborDetails.text && (
                            <div className="text-xs text-gray-400 line-clamp-3">
                              {neighborDetails.text}
                            </div>
                          )}
                          <div className="mt-2 p-2 bg-gray-700/30 rounded space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-400">Total amount:</span>
                              <span className="font-mono text-white font-medium">
                                {formatAmount(neighborMetrics.total_amount)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-400">Total forms:</span>
                              <span className="font-mono text-white font-medium">
                                {formatNumForms(neighborMetrics.total_num_forms)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-400">Avg per form:</span>
                              <span className="font-mono text-white font-medium">
                                {formatAmountPerForm(neighborMetrics.amount_per_form)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-400">Citing lines:</span>
                              <span className="font-mono text-white font-medium">
                                {neighborMetrics.num_lines?.toLocaleString() || 'N/A'}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => setDocumentToView(neighborDetails.id)}
                            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition-colors w-full"
                          >
                            View full text
                          </button>
                        </div>
                      )}

                      {/* Regulation node */}
                      {neighborDetails && neighborDetails.node_type === 'regulation' && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">Treasury Regulation</div>
                          <div className="font-semibold text-sm text-white">
                            {neighborDetails.name}
                          </div>
                          <div className={`text-xs font-semibold px-2 py-0.5 rounded inline-block ${
                            categoryFilter === 'corporation' 
                              ? 'text-purple-400 bg-purple-900/30' 
                              : categoryFilter === 'individual'
                              ? 'text-blue-400 bg-blue-900/30'
                              : 'text-gray-400 bg-gray-900/30'
                          }`}>
                            {getCategoryFilterLabel()}
                          </div>
                          {neighborDetails.full_name && (
                            <div className="text-xs text-gray-300">
                              {neighborDetails.full_name}
                            </div>
                          )}
                          {neighborDetails.text && (
                            <div className="text-xs text-gray-400 line-clamp-3">
                              {neighborDetails.text}
                            </div>
                          )}
                          {neighborMetrics && (
                            <div className="mt-2 p-2 bg-gray-700/30 rounded space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-400">Total amount:</span>
                                <span className="font-mono text-white font-medium">
                                  {formatAmount(neighborMetrics.total_amount)}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-400">Total forms:</span>
                                <span className="font-mono text-white font-medium">
                                  {formatNumForms(neighborMetrics.total_num_forms)}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-400">Avg per form:</span>
                                <span className="font-mono text-white font-medium">
                                  {formatAmountPerForm(neighborMetrics.amount_per_form)}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-400">Citing lines:</span>
                                <span className="font-mono text-white font-medium">
                                  {neighborMetrics.num_lines?.toLocaleString() || 'N/A'}
                                </span>
                              </div>
                            </div>
                          )}
                          <button
                            onClick={() => setDocumentToView(neighborDetails.id)}
                            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition-colors w-full"
                          >
                            View full text
                          </button>
                        </div>
                      )}

                      {/* Fallback for unknown types */}
                      {neighborDetails &&
                        !['form', 'line', 'section', 'index', 'regulation'].includes(neighborDetails.node_type) && (
                          <div className="text-xs text-gray-400">
                            <div className="mb-1">
                              <span className="font-semibold">Node:</span> {neighborDetails.name}
                            </div>
                            <div>
                              <span className="font-semibold">Type:</span>{' '}
                              {neighborDetails.node_type ?? 'unknown'}
                            </div>
                          </div>
                        )}

                      {neighborDetails === null && (
                        <div className="text-xs text-gray-500">
                          No additional details available for this node.
                        </div>
                      )}
                    </div>
                  )}

                  {index < sortedRelationships.length - 1 && (
                    <div className="border-b border-gray-700" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {documentToView && (
        <DocumentModal
          docId={documentToView}
          highlightTerm={selectedActor}
          secondaryHighlightTerm={null}
          searchKeywords={keywords}
          onClose={() => setDocumentToView(null)}
        />
      )}
    </>
  );
}