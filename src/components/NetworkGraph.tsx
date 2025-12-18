// src/components/NetworkGraph.tsx

import { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { Relationship, GraphNode, GraphLink, NodeType } from '../types';
import { fetchActorCounts, fetchNodeDetails } from '../api';

interface NetworkGraphProps {
  relationships?: Relationship[];
  graphData?: { nodes: GraphNode[], links: GraphLink[] };
  selectedActor: string | null;
  onActorClick: (actorName: string | null) => void;
  minDensity: number;
  actorTotalCounts: Record<string, number>;
  categoryFilter?: Set<'individual' | 'corporation'>;
}

function baseColorForType(t?: NodeType): string {
  switch (t) {
    case 'form':
      return '#8B5CF6'; // purple
    case 'line':
      return '#F97316'; // orange
    case 'section':
      return '#06B6D4'; // cyan
    case 'regulation':
      return '#EC4899'; // pink
    default:
      return '#AFBBE8'; // steel fallback
  }
}

export default function NetworkGraph({
  relationships,
  graphData: externalGraphData, 
  selectedActor,
  onActorClick,
  minDensity,
  actorTotalCounts,
  categoryFilter
}: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const nodeGroupRef = useRef<d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown> | null>(null);
  const linkGroupRef = useRef<d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform | null>(null);
  const hasInitializedRef = useRef(false);
  const [onDemandCounts, setOnDemandCounts] = useState<Record<string, number>>({});
  const [nodeDetailsCache, setNodeDetailsCache] = useState<Record<string, GraphNode>>({});

  const graphData = useMemo(() => {
  // Bottom-up mode: use pre-built graph data
  if (externalGraphData) {
    console.log('=== Using external graph data (bottom-up mode) ===');
    console.log('Nodes:', externalGraphData.nodes.length);
    console.log('Links:', externalGraphData.links.length);
    
    // ✅ DON'T apply categoryFilter in bottom-up mode
    // The bottom-up search already applied its own category filter
    const filteredNodes = externalGraphData.nodes;
    
    // Create a set of valid node IDs for quick lookup
    const validNodeIds = new Set(filteredNodes.map(n => n.id));
    
    // Filter links to only include those where both endpoints exist
    const validLinks = externalGraphData.links.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return validNodeIds.has(sourceId) && validNodeIds.has(targetId);
    });
    
    console.log('Valid links after filtering:', validLinks.length);
    
    return {
      nodes: filteredNodes,
      links: validLinks
    };
  }


  // Top-down mode: build from relationships
if (!relationships || relationships.length === 0) {
  return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
}

console.log('🔍 Top-down mode - categoryFilter:', categoryFilter ? Array.from(categoryFilter) : 'none');

// Extract category from node ID (format: "type:category:name")
const extractCategory = (id: string): 'individual' | 'corporation' | null => {
  const parts = id.split(':');
  if (parts.length >= 2) {
    const cat = parts[1];
    if (cat === 'individual' || cat === 'corporation') {
      return cat;
    }
  }
  return null;
};

// Get the selected category (should only be one)
const selectedCategory = categoryFilter && categoryFilter.size === 1 
  ? Array.from(categoryFilter)[0] 
  : null;

console.log('🎯 Selected category:', selectedCategory);

const nodeMap = new Map<string, GraphNode>();
const links: GraphLink[] = [];
const edgeMap = new Map<string, GraphLink & { count: number }>();

relationships.forEach((rel) => {
  const sourceId = rel.actor_id ?? rel.actor;
  const targetId = rel.target_id ?? rel.target;
  const sourceType = rel.actor_type;
  const targetType = rel.target_type;

  const sourceCategory = extractCategory(sourceId);
  const targetCategory = extractCategory(targetId);

  // ✅ STRICT FILTER: If a category is selected, ONLY include nodes of that category
  if (selectedCategory) {
    // Skip if source doesn't match
    if (sourceCategory !== selectedCategory) {
      return;
    }
    // Skip if target doesn't match
    if (targetCategory !== selectedCategory) {
      return;
    }
  }

  if (!nodeMap.has(sourceId)) {
    const baseColor = baseColorForType(sourceType);
    nodeMap.set(sourceId, {
      id: sourceId,
      name: rel.actor,
      val: 1,
      node_type: sourceType,
      category: sourceCategory || 'individual',
      color: baseColor,
      baseColor,
    });
  } else {
    const node = nodeMap.get(sourceId)!;
    node.val += 1;
  }

  if (!nodeMap.has(targetId)) {
    const baseColor = baseColorForType(targetType);
    nodeMap.set(targetId, {
      id: targetId,
      name: rel.target,
      val: 1,
      node_type: targetType,
      category: targetCategory || 'individual',
      color: baseColor,
      baseColor,
    });
  } else {
    const node = nodeMap.get(targetId)!;
    node.val += 1;
  }

  const keyA = `${sourceId}|||${targetId}`;
  const keyB = `${targetId}|||${sourceId}`;
  const edgeKey = edgeMap.has(keyA) ? keyA : (edgeMap.has(keyB) ? keyB : keyA);

  if (!edgeMap.has(edgeKey)) {
    edgeMap.set(edgeKey, {
      source: sourceId,
      target: targetId,
      action: rel.action,
      edge_type: rel.edge_type || 'reference',
      location: rel.location || undefined,
      timestamp: rel.timestamp || undefined,
      count: 1,
    });
  } else {
    edgeMap.get(edgeKey)!.count += 1;
  }
});

console.log('✅ After strict category filter - nodes:', nodeMap.size, 'links:', edgeMap.size);

links.push(...Array.from(edgeMap.values()));



  const allNodes = Array.from(nodeMap.values());
  if (allNodes.length === 0) {
    return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
  }

  const maxVal = Math.max(...allNodes.map(n => n.val), 1);
  const strength = (v: number) => v / maxVal;

  // Color scales for IRS forms node types
  const formColorScale = d3.scaleSequential((t: number) =>
    d3.interpolateRgb('#C4B5FD', '#8B5CF6')(t) // light purple to dark purple
  );
  const lineColorScale = d3.scaleSequential((t: number) =>
    d3.interpolateRgb('#FDBA74', '#F97316')(t) // light orange to dark orange
  );
  const sectionColorScale = d3.scaleSequential((t: number) =>
    d3.interpolateRgb('#67E8F9', '#06B6D4')(t) // light cyan to dark cyan
  );
  const regulationColorScale = d3.scaleSequential((t: number) =>
    d3.interpolateRgb('#F9A8D4', '#EC4899')(t) // light pink to dark pink
  );

  const nodes = allNodes.map(node => {
    const t = strength(node.val);

    let color = node.baseColor || baseColorForType(node.node_type);
    if (node.node_type === 'form') {
      color = formColorScale(t);
    } else if (node.node_type === 'line') {
      color = lineColorScale(t);
    } else if (node.node_type === 'section') {
      color = sectionColorScale(t);
    } else if (node.node_type === 'regulation') {
      color = regulationColorScale(t);
    }

    return {
      ...node,
      val: node.val,
      totalVal: node.val,
      color,
      baseColor: color,
    };
  });

  return {
    nodes,
    links,
  };
}, [relationships, externalGraphData, categoryFilter]);  // Add categoryFilter to dependencies


  useEffect(() => {
    if (!svgRef.current) return;

    console.log('=== NetworkGraph rendering ===');
    console.log('graphData.nodes:', graphData.nodes.length);
    console.log('graphData.links:', graphData.links.length);

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.01, 10])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        g.attr('transform', event.transform);
      });

    const g = svg.append('g');

    svg.call(zoom);

    svg.on('click', () => {
      onActorClick(null);
      if (simulationRef.current) {
        simulationRef.current.alphaTarget(0.3).restart();
        setTimeout(() => {
          simulationRef.current && simulationRef.current.alphaTarget(0);
        }, 300);
      }
    });

    if (transformRef.current && hasInitializedRef.current) {
      svg.call(zoom.transform as any, transformRef.current);
    } else {
      const initialScale = 0.15;
      const initialTransform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(initialScale)
        .translate(-width / 2, -height / 2);

      svg.call(zoom.transform as any, initialTransform);
      hasInitializedRef.current = true;
    }

    zoomRef.current = zoom;
    gRef.current = g;

    const minRadius = 5;
    const maxRadius = 100;
    const maxConnections = Math.max(...graphData.nodes.map(n => n.val), 1);
    const radiusScale = d3.scalePow()
      .exponent(0.5)
      .domain([1, maxConnections])
      .range([minRadius, maxRadius])
      .clamp(true);

    const simulation = d3.forceSimulation(graphData.nodes as any)
      .force('link', d3.forceLink(graphData.links as any)
        .id((d: any) => d.id)
        .distance(50))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => radiusScale(d.val) + 5))
      .force('radial', d3.forceRadial((d: any) => {
        return (50 - Math.min(d.val, 50)) * 33 + 200;
      }, width / 2, height / 2).strength(0.5));

    simulationRef.current = simulation as any;

    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .join('line')
      .attr('stroke', '#4b5563')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6);

    linkGroupRef.current = link;

    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .join('g')
      .call(d3.drag<any, GraphNode>()
        .on('start', (event, d: any) => {
          d.fx = d.x;
          d.fy = d.y;
          (d as any)._dragging = false;
        })
        .on('drag', (event, d: any) => {
          (d as any)._dragging = true;
          d.fx = event.x;
          d.fy = event.y;
          if (!event.active && (d as any)._dragging) {
            simulation.alphaTarget(0.3).restart();
          }
        })
        .on('end', (event, d: any) => {
          if (!event.active && (d as any)._dragging) {
            simulation.alphaTarget(0);
          }
          d.fx = null;
          d.fy = null;
          (d as any)._dragging = false;
        }) as any);

    nodeGroupRef.current = node;

    node.append('circle')
      .attr('r', (d) => radiusScale(d.val))
      .attr('fill', (d) => d.color || d.baseColor || baseColorForType(d.node_type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        const next = selectedActor === d.name ? null : d.name;
        onActorClick(next);
      });

    node.append('text')
      .text((d) => d.name)
      .attr('x', 0)
      .attr('y', (d) => radiusScale(d.val) * 1.5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '5px')
      .attr('font-weight', (d) => d.name === selectedActor ? 'bold' : 'normal')
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    const tooltip = d3.select('body')
      .append('div')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background-color', 'rgba(0, 0, 0, 0.9)')
      .style('color', 'white')
      .style('padding', '10px 14px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('max-width', '300px');

    node.on('mouseover', async (event, d) => {
      // Build tooltip content
      const categoryBadge = d.category === 'individual' ? '👤' : d.category === 'corporation' ? '🏢' : '';
      const nodeTypeLabel = {
        'form': 'Form',
        'line': 'Line',
        'section': 'USC Section',
        'regulation': 'Regulation'
      }[d.node_type] || d.node_type;

      let tooltipHtml = `<strong>${categoryBadge} ${d.name}</strong><br/>`;
      tooltipHtml += `<span style="color: #9ca3af;">${nodeTypeLabel} · ${d.category}</span><br/>`;
      tooltipHtml += `${d.val} connections in view`;

      // Fetch additional details if not cached
      if (!nodeDetailsCache[d.id]) {
        tooltip.style('visibility', 'visible').html(tooltipHtml + '<br/><span style="color: #9ca3af;">Loading details...</span>');
        
        try {
          const details = await fetchNodeDetails(d.id);
          if (details) {
            setNodeDetailsCache(prev => ({ ...prev, [d.id]: details }));
            
            // Update tooltip with details
            if (details.node_type === 'line') {
              if (details.amount) {
                tooltipHtml += `<br/><span style="color: #fb923c;">Amount: $${details.amount.toLocaleString()}</span>`;
              }
              if (details.num_forms) {
                tooltipHtml += `<br/><span style="color: #fb923c;">Forms: ${details.num_forms.toLocaleString()}</span>`;
              }
            }
            
            tooltip.html(tooltipHtml);
          }
        } catch (err) {
          console.error('Failed to fetch node details:', err);
        }
      } else {
        const cachedDetails = nodeDetailsCache[d.id];
        if (cachedDetails.node_type === 'line') {
          if (cachedDetails.amount) {
            tooltipHtml += `<br/><span style="color: #fb923c;">Amount: $${cachedDetails.amount.toLocaleString()}</span>`;
          }
          if (cachedDetails.num_forms) {
            tooltipHtml += `<br/><span style="color: #fb923c;">Forms: ${cachedDetails.num_forms.toLocaleString()}</span>`;
          }
        }
        tooltip.style('visibility', 'visible').html(tooltipHtml);
      }

      // Also show total count if available
      let totalCount = actorTotalCounts[d.name] || onDemandCounts[d.name];
      if (totalCount !== undefined && totalCount !== d.val) {
        tooltip.html(tooltipHtml + `<br/><span style="color: #9ca3af;">(${totalCount} total)</span>`);
      }
    })
    .on('mousemove', (event) => {
      tooltip
        .style('top', (event.pageY - 10) + 'px')
        .style('left', (event.pageX + 10) + 'px');
    })
    .on('mouseout', () => {
      tooltip.style('visibility', 'hidden');
    });

    link.on('mouseover', (event, d) => {
      const linkData = d as GraphLink & { count?: number };
      const count = linkData.count || 1;
      
      const edgeTypeLabels: Record<string, string> = {
        'belongs_to': 'Belongs to',
        'cites_section': 'Cites USC section',
        'cites_regulation': 'Cites regulation'
      };
      
      const edgeLabel = edgeTypeLabels[linkData.edge_type] || linkData.action;
      
      let html = count > 1
        ? `<strong>${count} relationships</strong><br/>${edgeLabel}`
        : `<strong>${edgeLabel}</strong>`;
      
      tooltip
        .style('visibility', 'visible')
        .html(html);
    })
    .on('mousemove', (event) => {
      tooltip
        .style('top', (event.pageY - 10) + 'px')
        .style('left', (event.pageX + 10) + 'px');
    })
    .on('mouseout', () => {
      tooltip.style('visibility', 'hidden');
    });

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [graphData]);

  useEffect(() => {
    if (!nodeGroupRef.current || !linkGroupRef.current) return;

    // Highlight selected node
    nodeGroupRef.current.selectAll('circle')
      .attr('fill', (d: any) => {
        return selectedActor && d.name === selectedActor ? '#22d3ee' : d.baseColor;
      })
      .attr('stroke-width', (d: any) => {
        return selectedActor && d.name === selectedActor ? 3 : 1;
      });

    nodeGroupRef.current.selectAll('text')
      .attr('font-weight', (d: any) => d.name === selectedActor ? 'bold' : 'normal');

    linkGroupRef.current
      .attr('stroke', (d: any) => {
        if (selectedActor) {
          const sourceNode = typeof d.source === 'string' ? { name: d.source } : d.source;
          const targetNode = typeof d.target === 'string' ? { name: d.target } : d.target;
          if (sourceNode.name === selectedActor || targetNode.name === selectedActor) {
            return '#22c55e';
          }
        }
        return '#4b5563';
      })
      .attr('stroke-opacity', (d: any) => {
        if (selectedActor) {
          const sourceNode = typeof d.source === 'string' ? { name: d.source } : d.source;
          const targetNode = typeof d.target === 'string' ? { name: d.target } : d.target;
          if (sourceNode.name === selectedActor || targetNode.name === selectedActor) {
            return 1;
          }
        }
        return 0.6;
      })
      .attr('stroke-width', (d: any) => {
        if (selectedActor) {
          const sourceNode = typeof d.source === 'string' ? { name: d.source } : d.source;
          const targetNode = typeof d.target === 'string' ? { name: d.target } : d.target;
          if (sourceNode.name === selectedActor || targetNode.name === selectedActor) {
            return 3;
          }
        }
        return 2;
      });
  }, [selectedActor]);

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        className="w-full h-full bg-gray-900"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gray-800 px-4 py-2 text-xs text-gray-400 text-center border-t border-gray-700">
        <span>Click nodes to explore relationships</span>
        <span className="mx-3">•</span>
        <span>Scroll to zoom</span>
        <span className="mx-3">•</span>
        <span>Drag to pan</span>
      </div>
    </div>
  );
}
