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
}

export default function RightSidebar({
  selectedActor,
  relationships,
  totalRelationships,
  onClose,
  yearRange,
  keywords,
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

  // ✅ Helper function to format amount/num_forms
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

  // ✅ Helper function to get color for node type
  const getNodeTypeColor = (type?: string): string => {
    const colors: Record<string, string> = {
      'form': '#88BACE',      // teal
      'line': '#C679B4',      // magenta
      'index': '#41378F',     // ink
      'section': '#41378F',   // ink (same as index)
      'regulation': '#A67EB3' // lilac
    };
    return colors[type || ''] || '#AFBBE8'; // fallback steel
  };

  // ✅ Helper to format amount_per_form
  const formatAmountPerForm = (amount: number | null | undefined): string => {
    return amount !== null && amount !== undefined
      ? `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'N/A';
  };

  // ✅ Helper to get node type from relationship
  const getNodeTypeFromRel = (nodeName: string, nodeId?: string): string | undefined => {
    // First try to get from cached details
    if (nodeId && nodeDetails[nodeId]) {
      return nodeDetails[nodeId]?.node_type;
    }
    
    // Otherwise, extract from ID pattern: "type:category:name"
    if (nodeId) {
      const parts = nodeId.split(':');
      if (parts.length > 0) {
        return parts[0]; // form, line, index, regulation
      }
    }
    
    return undefined;
  };

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
                {/* ✅ Line node: show individual metrics */}
                {selectedActorDetails?.node_type === 'line' && (
                  <div className="p-2 bg-pink-900/20 border border-pink-700/30 rounded text-xs space-y-1">
                    <div>
                      <span className="text-gray-400">Amount:</span>{' '}
                      <span className="font-mono" style={{ color: '#C679B4' }}>
                        {formatAmount(selectedActorDetails.amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Forms:</span>{' '}
                      <span className="font-mono" style={{ color: '#C679B4' }}>
                        {formatNumForms(selectedActorDetails.num_forms)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Amount per form:</span>{' '}
                      <span className="font-mono" style={{ color: '#C679B4' }}>
                        {formatAmountPerForm(selectedActorDetails.amount_per_form)}
                      </span>
                    </div>
                  </div>
                )}

                {/* ✅ Form node: show aggregated metrics */}
                {selectedActorDetails?.node_type === 'form' && (
                  <div className="p-2 bg-teal-900/20 border border-teal-700/30 rounded text-xs space-y-1">
                    <div>
                      <span className="text-gray-400">Total amount:</span>{' '}
                      <span className="font-mono" style={{ color: '#88BACE' }}>
                        {formatAmount(selectedActorDetails.total_amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Total forms:</span>{' '}
                      <span className="font-mono" style={{ color: '#88BACE' }}>
                        {formatNumForms(selectedActorDetails.total_num_forms)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Avg per form:</span>{' '}
                      <span className="font-mono" style={{ color: '#88BACE' }}>
                        {formatAmountPerForm(selectedActorDetails.amount_per_form)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Lines:</span>{' '}
                      <span className="font-mono" style={{ color: '#88BACE' }}>
                        {selectedActorDetails.num_lines?.toLocaleString() || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}

                {/* ✅ Index/Section node: show aggregated metrics */}
                {selectedActorDetails?.node_type === 'index' && (
                  <div className="p-2 bg-indigo-900/20 border border-indigo-700/30 rounded text-xs space-y-1">
                    <div>
                      <span className="text-gray-400">Total amount:</span>{' '}
                      <span className="font-mono" style={{ color: '#41378F' }}>
                        {formatAmount(selectedActorDetails.total_amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Total forms:</span>{' '}
                      <span className="font-mono" style={{ color: '#41378F' }}>
                        {formatNumForms(selectedActorDetails.total_num_forms)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Avg per form:</span>{' '}
                      <span className="font-mono" style={{ color: '#41378F' }}>
                        {formatAmountPerForm(selectedActorDetails.amount_per_form)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Citing lines:</span>{' '}
                      <span className="font-mono" style={{ color: '#41378F' }}>
                        {selectedActorDetails.num_lines?.toLocaleString() || 'N/A'}
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
                          {/* Actor with color */}
                          <span 
                            className="font-medium"
                            style={{ color: getNodeTypeColor(getNodeTypeFromRel(rel.actor, rel.actor_id)) }}
                          >
                            {rel.actor}
                          </span>
                          
                          {/* Action */}
                          <span className="text-gray-400 text-xs">
                            {rel.action}
                          </span>
                          
                          {/* Target with color */}
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
                      {neighborDetails && neighborDetails.node_type === 'form' && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">Form details</div>
                          <div className="font-semibold text-sm text-white">
                            {getCategoryBadge(neighborDetails.category)} {neighborDetails.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            Category: {neighborDetails.category}
                          </div>
                          {neighborDetails.full_name && (
                            <div className="text-xs text-gray-300">
                              {neighborDetails.full_name}
                            </div>
                          )}
                          {/* ✅ Show aggregated metrics */}
                          <div className="mt-2 space-y-1">
                            <div className="text-xs">
                              <span className="text-gray-400">Total amount:</span>{' '}
                              <span className="font-mono" style={{ color: '#88BACE' }}>
                                {formatAmount(neighborDetails.total_amount)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-400">Total forms:</span>{' '}
                              <span className="font-mono" style={{ color: '#88BACE' }}>
                                {formatNumForms(neighborDetails.total_num_forms)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-400">Avg per form:</span>{' '}
                              <span className="font-mono" style={{ color: '#88BACE' }}>
                                {formatAmountPerForm(neighborDetails.amount_per_form)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-400">Lines:</span>{' '}
                              <span className="font-mono" style={{ color: '#88BACE' }}>
                                {neighborDetails.num_lines?.toLocaleString() || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ✅ Line node: show individual metrics */}
                      {neighborDetails && neighborDetails.node_type === 'line' && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">Line details</div>
                          <div className="font-semibold text-sm text-white">
                            {getCategoryBadge(neighborDetails.category)} {neighborDetails.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            Category: {neighborDetails.category}
                          </div>
                          <div className="mt-2 space-y-1">
                            <div className="text-xs">
                              <span className="text-gray-400">Amount:</span>{' '}
                              <span className="font-mono" style={{ color: '#C679B4' }}>
                                {formatAmount(neighborDetails.amount)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-400">Forms:</span>{' '}
                              <span className="font-mono" style={{ color: '#C679B4' }}>
                                {formatNumForms(neighborDetails.num_forms)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-400">Amount per form:</span>{' '}
                              <span className="font-mono" style={{ color: '#C679B4' }}>
                                {formatAmountPerForm(neighborDetails.amount_per_form)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Section/Index node */}
                      {neighborDetails && (neighborDetails.node_type === 'section' || neighborDetails.node_type === 'index') && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">USC Section</div>
                          <div className="font-semibold text-sm text-white">
                            {neighborDetails.name}
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
                          {/* ✅ Show aggregated metrics */}
                          <div className="mt-2 space-y-1">
                            <div className="text-xs">
                              <span className="text-gray-400">Total amount:</span>{' '}
                              <span className="font-mono" style={{ color: '#41378F' }}>
                                {formatAmount(neighborDetails.total_amount)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-400">Total forms:</span>{' '}
                              <span className="font-mono" style={{ color: '#41378F' }}>
                                {formatNumForms(neighborDetails.total_num_forms)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-400">Avg per form:</span>{' '}
                              <span className="font-mono" style={{ color: '#41378F' }}>
                                {formatAmountPerForm(neighborDetails.amount_per_form)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-400">Citing lines:</span>{' '}
                              <span className="font-mono" style={{ color: '#41378F' }}>
                                {neighborDetails.num_lines?.toLocaleString() || 'N/A'}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => setDocumentToView(neighborDetails.id)}
                            className="mt-2 text-xs px-3 py-1 bg-cyan-600 hover:bg-cyan-700 rounded text-white font-medium transition-colors"
                          >
                            View full section text
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
                          <button
                            onClick={() => setDocumentToView(neighborDetails.id)}
                            className="mt-2 text-xs px-3 py-1 bg-pink-600 hover:bg-pink-700 rounded text-white font-medium transition-colors"
                          >
                            View full regulation text
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

