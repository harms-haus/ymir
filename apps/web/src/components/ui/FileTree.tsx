import { useCallback, useRef, useState, useEffect } from 'react';
import { Tree, NodeApi, NodeRendererProps } from 'react-arborist';
import type { TreeApi } from 'react-arborist';
import { FileIcon } from './FileIcon';

export interface FileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  data?: Record<string, unknown>;
  isDeleted?: boolean;
}

interface FileTreeProps {
  data: FileTreeNode[];
  onSelect?: (node: NodeApi<FileTreeNode>) => void;
  onToggle?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, node: NodeApi<FileTreeNode>) => void;
  onActivate?: (node: NodeApi<FileTreeNode>) => void;
  selection?: string;
  openByDefault?: boolean;
  initialOpenState?: { [id: string]: boolean };
  rowHeight?: number;
  indent?: number;
  className?: string;
  renderRightContent?: (node: FileTreeNode) => React.ReactNode;
}

function FileTreeNodeRenderer({
  node,
  style,
  dragHandle,
  onContextMenu,
  renderRightContent,
}: NodeRendererProps<FileTreeNode> & {
  onContextMenu?: (e: React.MouseEvent, node: NodeApi<FileTreeNode>) => void;
  renderRightContent?: (node: FileTreeNode) => React.ReactNode;
}) {
  const isFile = node.data.type === 'file';
  const isSelected = node.isSelected;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e, node);
  };

  const { paddingLeft = 0 } = style as { paddingLeft?: number };

  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        paddingTop: '6px',
        paddingBottom: '6px',
        paddingRight: '12px',
        paddingLeft: typeof paddingLeft === 'number' ? paddingLeft + 12 : 12,
        cursor: 'pointer',
        backgroundColor: isSelected ? 'hsl(var(--accent))' : 'transparent',
        transition: 'background-color 0.15s ease',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      ref={dragHandle}
      onContextMenu={handleContextMenu}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = 'hsl(var(--accent) / 0.5)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      {!isFile && (
        <div
          style={{
            width: '16px',
            height: '16px',
            marginRight: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          onClick={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
        >
          <i
            className={node.isOpen ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'}
            style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}
          />
        </div>
      )}
      <div style={{ marginRight: '6px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <FileIcon name={node.data.name} />
      </div>
      <span
        style={{
          fontSize: '13px',
          color: isSelected ? 'hsl(var(--accent-foreground))' : 'hsl(var(--foreground))',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1,
          minWidth: 0,
        }}
      >
        {node.data.name}
      </span>
      {renderRightContent && (
        <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {renderRightContent(node.data)}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  data,
  onSelect,
  onToggle,
  onContextMenu,
  onActivate,
  selection,
  openByDefault = false,
  initialOpenState,
  rowHeight = 32,
  indent = 10,
  className,
  renderRightContent,
}: FileTreeProps) {
  const treeRef = useRef<TreeApi<FileTreeNode>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    
    resizeObserver.observe(containerRef.current);
    
    return () => resizeObserver.disconnect();
  }, []);

  const handleSelect = useCallback(
    (nodes: NodeApi<FileTreeNode>[]) => {
      if (nodes.length > 0) {
        onSelect?.(nodes[0]);
      }
    },
    [onSelect]
  );

  const handleActivate = useCallback(
    (node: NodeApi<FileTreeNode>) => {
      onActivate?.(node);
    },
    [onActivate]
  );

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      {dimensions.width > 0 && dimensions.height > 0 && (
        <Tree
          ref={treeRef}
          data={data}
          height={dimensions.height}
          width={dimensions.width}
          rowHeight={rowHeight}
          indent={indent}
          openByDefault={openByDefault}
          initialOpenState={initialOpenState}
          selection={selection}
          onSelect={handleSelect}
          onToggle={onToggle}
          onActivate={handleActivate}
          className={className}
        >
      {(props: NodeRendererProps<FileTreeNode>) => (
        <FileTreeNodeRenderer {...props} onContextMenu={onContextMenu} renderRightContent={renderRightContent} />
      )}
        </Tree>
      )}
    </div>
  );
}
