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
      'section': 'USC Section',
      'regulation': 'Regulation'
    };
    return labels[type || ''] || type || 'Unknown';
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
                    {' · '}
                    {selectedActorDetails.category}
                  </p>
                )}
              </div>
              
              <p className="text-xs text-gray-500 mt-1">
                Showing {sortedRelationships.length} of {totalRelationships} relationships
              </p>
              
              {/* Node-specific details and actions */}
              <div className="mt-3 space-y-2">
                {/* Line node: show amount and num_forms */}
                {selectedActorDetails?.node_type === 'line' && (
                  <div className="p-2 bg-orange-900/20 border border-orange-700/30 rounded text-xs space-y-1">
                    {selectedActorDetails.amount && (
                      <div>
                        <span className="text-gray-400">Amount:</span>{' '}
                        <span className="text-orange-300 font-mono">
                          ${selectedActorDetails.amount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {selectedActorDetails.num_forms && (
                      <div>
                        <span className="text-gray-400">Forms:</span>{' '}
                        <span className="text-orange-300 font-mono">
                          {selectedActorDetails.num_forms.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* View text button for section/regulation */}
                {selectedActorDetails && 
                 (selectedActorDetails.node_type === 'section' || 
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
                          <span className={`font-medium ${rel.actor === selectedActor ? 'text-green-400' : 'text-orange-400'}`}>
                            {rel.actor}
                          </span>
                          <span className="text-gray-400 text-xs">
                            {rel.action}
                          </span>
                          <span className={`font-medium ${rel.target === selectedActor ? 'text-green-400' : 'text-orange-400'}`}>
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
                          <div className="font-semibold text-sm text-purple-300">
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
                        </div>
                      )}

                      {/* Line node */}
                      {neighborDetails && neighborDetails.node_type === 'line' && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">Line details</div>
                          <div className="font-semibold text-sm text-orange-300">
                            {getCategoryBadge(neighborDetails.category)} {neighborDetails.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            Category: {neighborDetails.category}
                          </div>
                          {neighborDetails.amount && (
                            <div className="text-xs">
                              <span className="text-gray-400">Amount:</span>{' '}
                              <span className="text-orange-300 font-mono">
                                ${neighborDetails.amount.toLocaleString()}
                              </span>
                            </div>
                          )}
                          {neighborDetails.num_forms && (
                            <div className="text-xs">
                              <span className="text-gray-400">Number of forms:</span>{' '}
                              <span className="text-orange-300 font-mono">
                                {neighborDetails.num_forms.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Section node */}
                      {neighborDetails && neighborDetails.node_type === 'section' && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">USC Section</div>
                          <div className="font-semibold text-sm text-cyan-300">
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
                          <div className="font-semibold text-sm text-pink-300">
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
                        !['form', 'line', 'section', 'regulation'].includes(neighborDetails.node_type) && (
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
