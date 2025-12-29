// src/components/NetworkGraph.tsx

import { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { Relationship, GraphNode, GraphLink, NodeType } from '../types';
import { fetchActorCounts, fetchNodeDetails } from '../api';

interface NetworkGraphProps {
  relationships?: Relationship[];
  graphData?: { nodes: GraphNode[], links: GraphLink[] };
  fullGraph?: { nodes: GraphNode[], links: GraphLink[] };
  selectedActor: string | null;
  onActorClick: (actorName: string | null) => void;
  minDensity: number;
  actorTotalCounts: Record<string, number>;
  categoryFilter?: Set<'individual' | 'corporation'>;
}

function baseColorForType(t?: NodeType): string {
  switch (t) {
    case 'form':
      return '#88BACE'; // teal for forms
    case 'line':
      return '#9C3391'; // magenta for lines
    case 'index':
      return '#41378F'; // ink for index nodes
    case 'regulation':
      return '#A67EB3'; // lilac for regulations
    default:
      return '#AFBBE8'; // fallback steel color
  }
}

export default function NetworkGraph({
  relationships,
  graphData: externalGraphData, 
  fullGraph,
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
      
      // ✅ NEW: Log edge type breakdown
      const edgeTypeCounts = new Map<string, number>();
      externalGraphData.links.forEach(link => {
        edgeTypeCounts.set(link.edge_type, (edgeTypeCounts.get(link.edge_type) || 0) + 1);
      });
      console.log('📊 Edge types in external graph:', Object.fromEntries(edgeTypeCounts));
      
      const filteredNodes = externalGraphData.nodes;
      const validNodeIds = new Set(filteredNodes.map(n => n.id));
      
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

    const extractNodeType = (id: string): NodeType | null => {
      const parts = id.split(':');
      if (parts.length > 0) {
        const type = parts[0];
        if (['form', 'line', 'index', 'regulation'].includes(type)) {
          return type as NodeType;
        }
      }
      return null;
    };

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
      const sourceType = rel.actor_type || extractNodeType(sourceId);
      const targetType = rel.target_type || extractNodeType(targetId);

      const sourceCategory = extractCategory(sourceId);
      const targetCategory = extractCategory(targetId);

      const sourceIsIndex = sourceType === 'index';
      const targetIsIndex = targetType === 'index';

      if (selectedCategory) {
        if (!sourceIsIndex && sourceCategory !== selectedCategory) {
          return;
        }
        if (!targetIsIndex && targetCategory !== selectedCategory) {
          return;
        }
      }

      if (!nodeMap.has(sourceId)) {
        const baseColor = baseColorForType(sourceType);

        const originalNode = fullGraph?.nodes.find(n => n.id === sourceId);

        nodeMap.set(sourceId, {
          id: sourceId,
          name: rel.actor,
          val: 1,
          node_type: sourceType,
          category: sourceCategory || undefined,
          amount: originalNode?.amount,
          num_forms: originalNode?.num_forms,
          color: baseColor,
          baseColor,
        });
      } else {
        const node = nodeMap.get(sourceId)!;
        node.val += 1;
      }

      if (!nodeMap.has(targetId)) {
        const baseColor = baseColorForType(targetType);
        
        const originalNode = fullGraph?.nodes.find(n => n.id === targetId);

        nodeMap.set(targetId, {
          id: targetId,
          name: rel.target,
          val: 1,
          node_type: targetType,
          category: targetCategory || undefined,
          amount: originalNode?.amount,
          num_forms: originalNode?.num_forms,
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

    const nodesByType = {
      forms: 0,
      lines: 0,
      indexes: 0,
      regulations: 0
    };
    nodeMap.forEach(node => {
      if (node.node_type === 'form') nodesByType.forms++;
      if (node.node_type === 'line') nodesByType.lines++;
      if (node.node_type === 'index') nodesByType.indexes++;
      if (node.node_type === 'regulation') nodesByType.regulations++;
    });

    console.log(`✅ After category filter (keeping index nodes) - nodes: ${nodeMap.size} links: ${edgeMap.size}`);
    console.log(`   Forms: ${nodesByType.forms}, Lines: ${nodesByType.lines}, Indexes: ${nodesByType.indexes}, Regulations: ${nodesByType.regulations}`);

    links.push(...Array.from(edgeMap.values()));

    const allNodes = Array.from(nodeMap.values());
    if (allNodes.length === 0) {
      return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    }

    const maxVal = Math.max(...allNodes.map(n => n.val), 1);
    const strength = (v: number) => Math.pow(v / maxVal, 0.6);

    const formColorScale = d3.scaleSequential((t: number) =>
      d3.interpolateRgb('#D9EEF5', '#88BACE')(t)
    );
    const lineColorScale = d3.scaleSequential((t: number) =>
      d3.interpolateRgb('#D99BC9', '#9C3391')(t)
    );
    const indexColorScale = d3.scaleSequential((t: number) =>
      d3.interpolateRgb('#9B8BCC', '#41378F')(t)
    );
    const regulationColorScale = d3.scaleSequential((t: number) =>
      d3.interpolateRgb('#D9C6E3', '#A67EB3')(t)
    );

    const nodes = allNodes.map(node => {
      const t = strength(node.val);

      let color = node.baseColor || baseColorForType(node.node_type);
      if (node.node_type === 'form') {
        color = formColorScale(t);
      } else if (node.node_type === 'line') {
        color = lineColorScale(t);
      } else if (node.node_type === 'index') {
        color = indexColorScale(t);
      } else if (node.node_type === 'regulation') {
        color = regulationColorScale(t);
      }

      const d3Color = d3.color(color);
      if (d3Color) {
        const hslColor = d3.hsl(d3Color);
        hslColor.s = Math.min(1, hslColor.s * 1.2);
        color = hslColor.toString();
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
  }, [relationships, externalGraphData, categoryFilter]);

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

    node.on('mouseover', (event, d) => {
      // ✅ DEBUG: Log what data is in the node
      if (d.node_type === 'line') {
        console.log('Line node hover:', {
          id: d.id,
          name: d.name,
          amount: d.amount,
          num_forms: d.num_forms,
          fullNode: d
        });
      }

      const categoryBadge = d.category === 'individual' ? '👤' : d.category === 'corporation' ? '🏢' : d.node_type === 'index' ? '📖' : '';
      const nodeTypeLabel = {
        'form': 'Form',
        'line': 'Line',
        'index': 'USC Section',
        'regulation': 'Regulation'
      }[d.node_type] || d.node_type;

      let tooltipHtml = `<strong>${categoryBadge} ${d.name}</strong><br/>`;
      tooltipHtml += `<span style="color: #9ca3af;">${nodeTypeLabel}`;
      if (d.category) {
        tooltipHtml += ` · ${d.category}`;
      }
      tooltipHtml += `</span><br/>`;
      tooltipHtml += `${d.val} connections in view`;

      // ✅ ALWAYS show amount and num_forms for line nodes
      if (d.node_type === 'line') {
        const amountDisplay = d.amount !== null && d.amount !== undefined
          ? `$${d.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : 'N/A';
        
        const numFormsDisplay = d.num_forms !== null && d.num_forms !== undefined
          ? d.num_forms.toLocaleString()
          : 'N/A';
        
        tooltipHtml += `<br/><span style="color: #C679B4;">Amount: ${amountDisplay}</span>`;
        tooltipHtml += `<br/><span style="color: #C679B4;">Forms: ${numFormsDisplay}</span>`;
      }

      tooltip.style('visibility', 'visible').html(tooltipHtml);

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

    // ✅ UPDATED: Link hover tooltips now include hierarchy and reference edge types
    link.on('mouseover', (event, d) => {
      const linkData = d as GraphLink & { count?: number };
      const count = linkData.count || 1;
      
      const edgeTypeLabels: Record<string, string> = {
        'belongs_to': 'Belongs to',
        'cites_section': 'Cites USC section',
        'cites_regulation': 'Cites regulation',
        'hierarchy': 'Title 26 hierarchy',
        'reference': 'Code reference'
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
