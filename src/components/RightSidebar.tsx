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
  console.log('🔍 RightSidebar keywords:', keywords);
  const [expandedRelId, setExpandedRelId] = useState<number | null>(null);
  const [documentToView, setDocumentToView] = useState<string | null>(null);
  const [filterActor, setFilterActor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Actor[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [nodeDetails, setNodeDetails] = useState<Record<string, GraphNode | null>>({});

  if (!selectedActor) return null;

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

  // Simple sort by timestamp if present
  const sortedRelationships = [...filteredRelationships].sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return a.timestamp.localeCompare(b.timestamp);
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

  return (
    <>
      <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold text-blue-400">Node relationships</h2>
                <span className="text-xs text-gray-500">
                  ({yearRange[0]} - {yearRange[1]})
                </span>
              </div>
              <p className="text-sm text-gray-400">{selectedActor}</p>
              <p className="text-xs text-gray-500 mt-1">
                Showing {sortedRelationships.length} of {totalRelationships} relationships
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Filter by another node */}
          <div className="relative">
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
                  Filter relationships by another node:
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g., § 1, Secretary, income tax"
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
                      <div>
                        <span className={`font-medium ${rel.actor === selectedActor ? 'text-green-400' : 'text-red-400'}`}>
                          {rel.actor}
                        </span>
                        <span className="text-gray-300 mx-1">{rel.action}</span>
                        <span className={`font-medium ${rel.target === selectedActor ? 'text-green-400' : 'text-red-400'}`}>
                          {rel.target}
                        </span>
                      </div>
                      <span className="text-gray-500 text-xs ml-2">
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

                      {neighborDetails && neighborDetails.node_type === 'section' && (
                        <>
                          <div className="text-xs text-gray-400 mb-1">
                            Section details (excluding full text)
                          </div>
                          <div className="text-sm text-gray-200 mb-1">
                            <span className="font-semibold">
                              § {neighborDetails.section_num}{' '}
                            </span>
                            {neighborDetails.section_heading}
                          </div>
                          <div className="text-xs text-gray-400">
                            <div>
                              <span className="font-semibold">Title:</span>{' '}
                              {neighborDetails.title} – {neighborDetails.title_heading}
                            </div>
                            {neighborDetails.tags && (
                              <div className="mt-1">
                                <span className="font-semibold">Tags:</span>{' '}
                                {neighborDetails.tags}
                              </div>
                            )}
                            {neighborDetails.terms && (
                              <div className="mt-1">
                                <span className="font-semibold">Key terms:</span>{' '}
                                {neighborDetails.terms}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setDocumentToView(neighborDetails.id)}
                            className="mt-3 text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition-colors"
                          >
                            View full section text
                          </button>
                        </>
                      )}

                      {neighborDetails && neighborDetails.node_type === 'entity' && (
                        <div className="text-xs text-gray-400">
                          <div className="mb-1">
                            <span className="font-semibold">Entity:</span> {neighborDetails.name}
                          </div>
                          {neighborDetails.department && (
                            <div className="mb-1">
                              <span className="font-semibold">Department:</span>{' '}
                              {neighborDetails.department}
                            </div>
                          )}
                          {neighborDetails.total_mentions != null && (
                            <div className="mb-1">
                              <span className="font-semibold">Total mentions:</span>{' '}
                              {neighborDetails.total_mentions}
                            </div>
                          )}
                        </div>
                      )}

                      {neighborDetails &&
                        neighborDetails.node_type !== 'section' &&
                        neighborDetails.node_type !== 'entity' && (
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

      {/* Full-text modal: docId is the section node id */}
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
