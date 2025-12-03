// src/components/DocumentModal.tsx

import { useState, useEffect, useRef } from 'react';
import { fetchDocument, fetchDocumentText, fetchNodeDetails } from '../api';
import type { Document } from '../types';

interface DocumentModalProps {
  docId: string;
  highlightTerm: string | null;
  secondaryHighlightTerm?: string | null;
  searchKeywords?: string;
  onClose: () => void;
}

interface MatchPosition {
  index: number;
  term: string;
  type: 'primary' | 'secondary' | 'search';
  percentage: number;
}

export default function DocumentModal({
  docId,
  highlightTerm,
  secondaryHighlightTerm,
  searchKeywords,
  onClose,
}: DocumentModalProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [documentText, setDocumentText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchPositions, setMatchPositions] = useState<MatchPosition[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<number, HTMLElement>>(new Map());

  console.log('📄 DocumentModal data:', { docId, document, documentText: documentText?.substring(0, 100) });

  // Common words to exclude from highlighting
  const commonWords = new Set([
    'the', 'and', 'or', 'to', 'from', 'in', 'on', 'at', 'by', 'for', 'with',
    'about', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'since', 'without', 'within', 'of', 'off',
    'out', 'over', 'up', 'down', 'near', 'along', 'among', 'across', 'behind',
    'beyond', 'plus', 'except', 'but', 'per', 'via', 'upon', 'against',
  ]);

  useEffect(() => {
    const loadDocument = async () => {
      setLoading(true);
      setError(null);

      try {
        // For US Code view, fetchDocument gives metadata; fetchDocumentText gives section_text
        const [doc, textData, nodeDetails] = await Promise.all([
          fetchDocument(docId),
          fetchDocumentText(docId),
          fetchNodeDetails(docId)
        ]);

        setDocument({
  ...doc,  // ← Changed from {doc, to ...doc,
  title: nodeDetails?.title,
  title_heading: nodeDetails?.title_heading,
  section_num: nodeDetails?.section_num,
  section_heading: nodeDetails?.section_heading
});
        setDocumentText(textData.text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load section text');
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [docId]);

  // Calculate match positions when text loads
  useEffect(() => {
    if (!documentText) return;

    const positions: MatchPosition[] = [];
    const textLength = documentText.length;

    const searchPatterns: string[] = [];
    const primaryPatterns: string[] = [];
    const secondaryPatterns: string[] = [];

    // NEW: Parse search keywords
    if (searchKeywords) {
      searchKeywords.split(',').forEach((keyword) => {
        const trimmed = keyword.trim();
        if (trimmed.length > 0) {
          searchPatterns.push(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      });
    }

    if (highlightTerm) {
      primaryPatterns.push(highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      highlightTerm.split(/\s+/).forEach((word) => {
        if (word.length >= 3 && !commonWords.has(word.toLowerCase())) {
          primaryPatterns.push(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      });
    }

    if (secondaryHighlightTerm) {
      secondaryPatterns.push(secondaryHighlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      secondaryHighlightTerm.split(/\s+/).forEach((word) => {
        if (word.length >= 3 && !commonWords.has(word.toLowerCase())) {
          secondaryPatterns.push(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      });
    }

    // Find search keyword matches (green)
    if (searchPatterns.length > 0) {
      const regex = new RegExp(`(${searchPatterns.join('|')})`, 'gi');
      let match;
      while ((match = regex.exec(documentText)) !== null) {
        positions.push({
          index: match.index,
          term: match[0],
          type: 'search',
          percentage: (match.index / textLength) * 100,
        });
      }
    }

    // Find primary matches (yellow)
    if (primaryPatterns.length > 0) {
      const regex = new RegExp(`(${primaryPatterns.join('|')})`, 'gi');
      let match;
      while ((match = regex.exec(documentText)) !== null) {
        positions.push({
          index: match.index,
          term: match[0],
          type: 'primary',
          percentage: (match.index / textLength) * 100,
        });
      }
    }

    // Find secondary matches (orange)
    if (secondaryPatterns.length > 0) {
      const regex = new RegExp(`(${secondaryPatterns.join('|')})`, 'gi');
      let match;
      while ((match = regex.exec(documentText)) !== null) {
        positions.push({
          index: match.index,
          term: match[0],
          type: 'secondary',
          percentage: (match.index / textLength) * 100,
        });
      }
    }

    positions.sort((a, b) => a.index - b.index);
    setMatchPositions(positions);
  }, [documentText, highlightTerm, secondaryHighlightTerm, searchKeywords]);

  const scrollToMatch = (index: number) => {
    const element = matchRefs.current.get(index);
    if (element && contentRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const highlightText = (
    text: string,
    term: string | null,
    secondaryTerm: string | null,
    searchTerms: string | null,
  ): JSX.Element[] => {
    console.log('🎨 DocumentModal highlightText called with:', {
    searchTerms,
    term,
    secondaryTerm
  }); 
    if (!term && !secondaryTerm && !searchTerms) {
      return [<span key="0">{text}</span>];
    }

    try {
      const patterns: string[] = [];
      const searchWords = new Set<string>();
      const primaryWords = new Set<string>();
      const secondaryWords = new Set<string>();

      // Parse search keywords (green - highest priority)
      if (searchTerms) {
        searchTerms.split(',').forEach((keyword) => {
          const trimmed = keyword.trim();
          if (trimmed.length > 0) {
            searchWords.add(trimmed.toLowerCase());
            patterns.push(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          }
        });
      }

      // Parse primary term (yellow)
      if (term) {
        patterns.push(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        term.split(/\s+/).forEach((word) => {
          if (word.length >= 3 && !commonWords.has(word.toLowerCase())) {
            primaryWords.add(word.toLowerCase());
            patterns.push(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          }
        });
      }

      // Parse secondary term (orange)
      if (secondaryTerm) {
        patterns.push(secondaryTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        secondaryTerm.split(/\s+/).forEach((word) => {
          if (word.length >= 3 && !commonWords.has(word.toLowerCase())) {
            secondaryWords.add(word.toLowerCase());
            patterns.push(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          }
        });
      }

      const regex = new RegExp(`(${patterns.join('|')})`, 'gi');
      const parts = text.split(regex);

      let currentIndex = 0;

      return parts.map((part, index) => {
        const partLower = part.toLowerCase();
        const partStart = currentIndex;
        currentIndex += part.length;

        // Priority: search keywords (green) > primary term (yellow) > secondary term (orange)
        
        // Check if it's a search keyword match
        let isSearchMatch = false;
        for (const searchWord of searchWords) {
          if (partLower.includes(searchWord) || searchWord.includes(partLower)) {
            isSearchMatch = true;
            break;
          }
        }

        if (isSearchMatch) {
          return (
            <mark
              key={index}
              ref={(el) => {
                if (el) matchRefs.current.set(partStart, el);
              }}
              className="bg-green-300 text-black font-semibold px-1 rounded"
            >
              {part}
            </mark>
          );
        }

        // Check primary term (yellow)
        if (term && (partLower === term.toLowerCase() || primaryWords.has(partLower))) {
          return (
            <mark
              key={index}
              ref={(el) => {
                if (el) matchRefs.current.set(partStart, el);
              }}
              className="bg-yellow-400 text-black px-1 rounded"
            >
              {part}
            </mark>
          );
        }

        // Check secondary term (orange)
        if (
          secondaryTerm &&
          (partLower === secondaryTerm.toLowerCase() || secondaryWords.has(partLower))
        ) {
          return (
            <mark
              key={index}
              ref={(el) => {
                if (el) matchRefs.current.set(partStart, el);
              }}
              className="bg-orange-300 text-black px-1 rounded"
            >
              {part}
            </mark>
          );
        }

        return <span key={index}>{part}</span>;
      });
    } catch {
      return [<span key="0">{text}</span>];
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col relative border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
       {/* Header */}
<div className="p-6 border-b border-gray-700 flex justify-between items-start">
  <div className="flex-1">
    {/* Display title and title_heading on first line */}
    {document && document.title && (
      <h3 className="text-lg font-medium text-gray-400 mb-1">
        Title {document.title}
        {document.title_heading && ` – ${document.title_heading}`}
      </h3>
    )}
    
    {/* Display section_num and section_heading on second line */}
    <h2 className="text-2xl font-semibold text-blue-400 mb-2">
      {document?.section_num && `§ ${document.section_num}`}
      {document?.section_heading && ` ${document.section_heading}`}
      {!document?.section_num && (document?.doc_id || docId)}
    </h2>
    
    {document && (
      <div className="space-y-1 text-sm">
        <p className="text-gray-300">{document.one_sentence_summary}</p>
        <div className="flex gap-4 text-gray-500">
          <span className="px-2 py-1 bg-gray-700 rounded">
            {document.category}
          </span>
          {document.date_range_earliest && (
            <span>
              {document.date_range_earliest}
              {document.date_range_latest &&
              document.date_range_latest !== document.date_range_earliest
                ? ` to ${document.date_range_latest}`
                : ''}
            </span>
          )}
        </div>
      </div>
    )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-white text-2xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pr-12" ref={contentRef}>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-400">Loading section text...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded p-4 text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && documentText && (
            <div className="prose prose-invert max-w-none">
              <div className="whitespace-pre-wrap text-gray-300 leading-relaxed font-mono text-sm">
                {highlightText(
                  documentText,
                  highlightTerm,
                  secondaryHighlightTerm || null,
                  searchKeywords || null,
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scroll indicator */}
        {!loading && !error && matchPositions.length > 0 && (
          <div className="absolute right-4 top-32 bottom-24 w-3 bg-gray-700/50 rounded-full pointer-events-none z-10">
            {matchPositions.map((match, idx) => (
              <button
                key={idx}
                onClick={() => scrollToMatch(match.index)}
                className={`absolute w-3 h-3 rounded-full transform transition-all hover:scale-150 pointer-events-auto ${
                  match.type === 'search'
                    ? 'bg-green-300 hover:bg-green-200'
                    : match.type === 'primary'
                    ? 'bg-yellow-400 hover:bg-yellow-300'
                    : 'bg-orange-300 hover:bg-orange-200'
                }`}
                style={{ top: `${match.percentage}%` }}
                title={`${match.term} (${idx + 1}/${matchPositions.length})`}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-between items-center">
          <div className="text-sm text-gray-500 flex gap-4">
            {searchKeywords && (
              <span>
                <span className="inline-block bg-green-300 text-black font-semibold px-2 py-0.5 rounded text-xs mr-1">
                  Search keywords
                </span>
              </span>
            )}
            {highlightTerm && (
              <span>
                <span className="inline-block bg-yellow-400 text-black px-2 py-0.5 rounded text-xs mr-1">
                  {highlightTerm}
                </span>
              </span>
            )}
            {secondaryHighlightTerm && (
              <span>
                <span className="inline-block bg-orange-300 text-black px-2 py-0.5 rounded text-xs mr-1">
                  {secondaryHighlightTerm}
                </span>
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
