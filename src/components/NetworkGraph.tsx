// src/components/NetworkGraph.tsx

import { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { Relationship, GraphNode, GraphLink, NodeType } from '../types';
import { fetchActorCount } from '../api';

interface NetworkGraphProps {
  relationships: Relationship[];
  selectedActor: string | null;
  onActorClick: (actorName: string | null) => void;
  minDensity: number; // Keep for compatibility but don't use it
  actorTotalCounts: Record<string, number>;
}

function baseColorForType(t?: NodeType): string {
  switch (t) {
    case 'section':
      return '#41378F'; // ink
    case 'entity':
      return '#F0A734'; // orange
    case 'concept':
      return '#9C3391'; // magenta
    default:
      return '#AFBBE8'; // steel
  }
}

export default function NetworkGraph({
  relationships,
  selectedActor,
  onActorClick,
  minDensity, // Not used anymore
  actorTotalCounts
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

  const graphData = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];
    const edgeMap = new Map<string, GraphLink & { count: number }>();

    relationships.forEach((rel) => {
      const sourceId = rel.actor_id ?? rel.actor;
      const targetId = rel.target_id ?? rel.target;
      const sourceType = rel.actor_type;
      const targetType = rel.target_type;

      if (!nodeMap.has(sourceId)) {
        const baseColor = baseColorForType(sourceType);
        nodeMap.set(sourceId, {
          id: sourceId,
          name: rel.actor,
          val: 1,
          node_type: sourceType,
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
          location: rel.location || undefined,
          timestamp: rel.timestamp || undefined,
          count: 1,
        });
      } else {
        edgeMap.get(edgeKey)!.count += 1;
      }
    });

    links.push(...Array.from(edgeMap.values()));

    const allNodes = Array.from(nodeMap.values());
    if (allNodes.length === 0) {
      return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    }

    const maxVal = Math.max(...allNodes.map(n => n.val), 1);

    const strength = (v: number) => v / maxVal;

    const sectionColorScale = d3.scaleSequential((t: number) =>
      d3.interpolateRgb('#9B96C9', '#41378F')(t)
    );
    const entityColorScale = d3.scaleSequential((t: number) =>
      d3.interpolateRgb('#F9D99B', '#F0A734')(t)
    );
    const conceptColorScale = d3.scaleSequential((t: number) =>
      d3.interpolateRgb('#E8B3E3', '#9C3391')(t)
    );

    const nodes = allNodes.map(node => {
      const t = strength(node.val);

      let color = node.baseColor || baseColorForType(node.node_type);
      if (node.node_type === 'section') {
        color = sectionColorScale(t);
      } else if (node.node_type === 'entity') {
        color = entityColorScale(t);
      } else if (node.node_type === 'concept') {
        color = conceptColorScale(t);
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
  }, [relationships]);

  useEffect(() => {
    if (!svgRef.current) return;

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
      .style('background-color', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000');

    node.on('mouseover', async (event, d) => {
      let totalCount = actorTotalCounts[d.name] || onDemandCounts[d.name];

      if (totalCount === undefined) {
        tooltip
          .style('visibility', 'visible')
          .html(`<strong>${d.name}</strong><br/>${d.val} connections<br/>(loading total...)`);

        try {
          const count = await fetchActorCount(d.name);
          setOnDemandCounts(prev => ({ ...prev, [d.name]: count }));
          totalCount = count;

          tooltip
            .html(`<strong>${d.name}</strong><br/>${d.val} connections<br/>(${totalCount} total)`);
        } catch (error) {
          console.error('Error fetching actor count:', error);
          tooltip
            .html(`<strong>${d.name}</strong><br/>${d.val} connections`);
        }
      } else {
        tooltip
          .style('visibility', 'visible')
          .html(`<strong>${d.name}</strong><br/>${d.val} connections<br/>(${totalCount} total)`);
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
      let html = count > 1
        ? `<strong>${count} relationships</strong><br/>${linkData.action}`
        : `<strong>${linkData.action}</strong>`;
      if (linkData.location) html += `<br/>📍 ${linkData.location}`;
      if (linkData.timestamp) html += `<br/>📅 ${linkData.timestamp}`;
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
  }, [graphData, onActorClick]);

  useEffect(() => {
    if (!nodeGroupRef.current || !linkGroupRef.current) return;

    nodeGroupRef.current.selectAll('circle')
      .attr('fill', (d: any) => {
        return selectedActor && d.name === selectedActor ? '#06b6d4' : d.baseColor;
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
      });
  }, [selectedActor]);

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        className="w-full h-full bg-gray-950"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/50 backdrop-blur-sm px-4 py-2 text-xs text-gray-300 text-center">
        <span>Click nodes to explore relationships</span>
        <span className="mx-3">•</span>
        <span>Scroll to zoom</span>
        <span className="mx-3">•</span>
        <span>Drag to pan</span>
      </div>
    </div>
  );
}
