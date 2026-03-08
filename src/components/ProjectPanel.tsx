import React, { useState } from 'react';
import { PanelDefinition, TabBadge } from '../state/types';
import './ProjectPanel.css';

// Mock file tree data
interface FileNode {
  name: string;
  type: 'folder' | 'file';
  extension?: string;
  children?: FileNode[];
}

const mockFileTree: FileNode[] = [
  {
    name: 'src',
    type: 'folder',
    children: [
      {
        name: 'components',
        type: 'folder',
        children: [
          { name: 'ProjectPanel.tsx', type: 'file', extension: 'tsx' },
          { name: 'ProjectPanel.css', type: 'file', extension: 'css' },
          { name: 'GitPanel.tsx', type: 'file', extension: 'tsx' },
          { name: 'TabBar.tsx', type: 'file', extension: 'tsx' },
          { name: 'WorkspaceSidebar.tsx', type: 'file', extension: 'tsx' },
        ],
      },
      {
        name: 'state',
        type: 'folder',
        children: [
          { name: 'types.ts', type: 'file', extension: 'ts' },
          { name: 'workspace.ts', type: 'file', extension: 'ts' },
        ],
      },
      {
        name: 'hooks',
        type: 'folder',
        children: [
          { name: 'useLayout.ts', type: 'file', extension: 'ts' },
          { name: 'useKeyboardShortcuts.ts', type: 'file', extension: 'ts' },
        ],
      },
      { name: 'Layout.tsx', type: 'file', extension: 'tsx' },
      { name: 'main.tsx', type: 'file', extension: 'tsx' },
    ],
  },
  {
    name: 'public',
    type: 'folder',
    children: [
      { name: 'index.html', type: 'file', extension: 'html' },
    ],
  },
  { name: 'package.json', type: 'file', extension: 'json' },
  { name: 'tsconfig.json', type: 'file', extension: 'json' },
  { name: 'README.md', type: 'file', extension: 'md' },
  { name: 'vite.config.ts', type: 'file', extension: 'ts' },
];

// Get file icon based on extension
const getFileIcon = (extension?: string): React.ReactNode => {
  const iconStyle = {
    width: '14px',
    height: '14px',
    flexShrink: 0,
  };

  switch (extension) {
    case 'tsx':
    case 'ts':
      return (
        <svg style={{ ...iconStyle, color: '#3178c6' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 3h18v18H3V3zm16.525 13.707c-.131-.821-.666-1.511-2.252-2.155-.552-.259-1.165-.438-1.349-.854-.068-.248-.083-.388-.036-.536.102-.388.501-.504.832-.396.213.07.411.259.535.535.568-.357.568-.357.96-.605-.145-.221-.219-.318-.314-.413-.34-.366-.787-.552-1.516-.531l-.378.047c-.362.09-.705.259-.96.5-.815.758-.705 2.079.186 2.624.877.586 2.163.775 2.327 1.382.153.716-.526 1.947-1.968 1.731-.553-.101-.849-.421-1.08-.758-.212-.305-.381-.673-.381-.673l-.96.567c.162.341.298.49.536.758.895 1.023 3.131 1.087 3.961-.106.056-.083.102-.152.148-.259.225-.458.281-.9.178-1.498-.164-.798-.644-1.338-1.289-1.677-.475-.284-1.057-.393-1.457-.586-.378-.184-.577-.458-.577-.798 0-.282.217-.551.578-.629.379-.078.713.042.96.359l.961-.611c-.266-.401-.537-.579-.896-.728-.711-.271-1.658-.205-2.219.343-.39.397-.596.872-.596 1.553 0 .854.443 1.532 1.137 1.924.615.348 1.402.435 1.793.608.516.23.729.601.729 1.018 0 .637-.505 1.063-1.307 1.063-.731 0-1.177-.322-1.431-.739l-.961.562c.327.592.9 1.127 1.838 1.296 1.239.224 2.491-.263 2.906-1.275.073-.163.123-.342.146-.535.065-.625-.082-1.207-.459-1.707l.001-.001z" />
        </svg>
      );
    case 'css':
      return (
        <svg style={{ ...iconStyle, color: '#264de4' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.565-2.438L1.5 0zm17.09 4.413L5.41 4.41l.213 2.622 10.125.002-.255 2.716h-6.64l.24 2.573h6.182l-.366 3.523-2.91.804-2.956-.81-.188-2.11h-2.61l.29 3.855L12 19.288l5.373-1.53L18.59 4.414z" />
        </svg>
      );
    case 'json':
      return (
        <svg style={{ ...iconStyle, color: '#cbcb41' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.759 3.975h1.783V5.76H5.759v4.458A1.783 1.783 0 0 1 3.975 12a1.783 1.783 0 0 1 1.784 1.783v4.459h1.783v1.783H5.759c-.954-.24-1.784-.803-1.784-1.783v-3.567a1.783 1.783 0 0 0-1.783-1.783H1.3v-1.783h.892a1.783 1.783 0 0 0 1.783-1.784V5.758c0-.98.83-1.543 1.784-1.783zm12.482 0c.954.24 1.784.803 1.784 1.783v3.567a1.783 1.783 0 0 0 1.783 1.783h.892v1.784h-.892a1.783 1.783 0 0 0-1.783 1.783v3.567c0 .98-.83 1.543-1.784 1.783h-1.783V18.24h1.783v-4.459A1.783 1.783 0 0 1 20.025 12a1.783 1.783 0 0 1-1.783-1.783V5.759h-1.783V3.975h1.783z" />
        </svg>
      );
    case 'html':
      return (
        <svg style={{ ...iconStyle, color: '#e34c26' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z" />
        </svg>
      );
    case 'md':
      return (
        <svg style={{ ...iconStyle, color: '#519aba' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.553 3.565c-.298-.14-.62-.215-.95-.215H4.4c-.744 0-1.414.416-1.732 1.075-.142.295-.205.62-.205.95v14.234c0 .744.416 1.414 1.075 1.732.295.142.62.205.95.205h15.2c.744 0 1.414-.416 1.732-1.075.142-.295.205-.62.205-.95V5.397c0-.744-.416-1.414-1.075-1.732zm-.49 1.872v13.126c0 .17-.085.327-.227.42-.09.058-.195.09-.3.09H4.464c-.106 0-.21-.032-.3-.09-.142-.093-.227-.25-.227-.42V5.437c0-.17.085-.327.227-.42.09-.058.194-.09.3-.09h15.072c.105 0 .21.032.3.09.142.093.227.25.227.42zM6.5 16.5h2V9l2.5 3.5L13.5 9v7.5h2v-10h-2l-2.5 3.5-2.5-3.5h-2z" />
        </svg>
      );
    default:
      return (
        <svg style={{ ...iconStyle, color: '#858585' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
        </svg>
      );
  }
};

// Folder icon component
const FolderIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke={isOpen ? '#dcb67a' : '#dcb67a'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    {isOpen ? (
      <>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="#dcb67a" />
      </>
    ) : (
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    )}
  </svg>
);

// Chevron icon for expand/collapse
const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      flexShrink: 0,
      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.15s ease',
      color: '#858585',
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// File tree item component
interface FileTreeItemProps {
  node: FileNode;
  depth: number;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({ node, depth }) => {
  const [isOpen, setIsOpen] = useState(depth < 2); // Auto-expand first two levels

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    }
  };


  const paddingLeft = 8 + depth * 12;

  if (node.type === 'folder') {
    return (
      <div className="folder-node">
        <div
          className="project-folder-item"
          onClick={handleClick}
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          <ChevronIcon isOpen={isOpen} />
          <FolderIcon isOpen={isOpen} />
          <span className="file-name">{node.name}</span>
        </div>
        {isOpen && node.children && (
          <div className="project-folder-tree">
            {node.children.map((child, index) => (
              <FileTreeItem
                key={`${child.name}-${index}`}
                node={child}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="project-folder-item"
      onClick={handleClick}
      style={{ paddingLeft: `${paddingLeft + 12}px` }} // Extra padding for files (no chevron)
    >
      {getFileIcon(node.extension)}
      <span className="file-name">{node.name}</span>
    </div>
  );
};

// Icon component - SVG folder icon
const ProjectPanelIcon: React.FC = () => (
  <div className="project-panel-icon">
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  </div>
);

// Badge component - returns null (no badge for now)
const ProjectPanelBadge = (): TabBadge | null => {
  return null;
};

// Full panel content - file tree
const ProjectPanelFull: React.FC = () => {
  return (
    <div className="project-panel">
      <div className="project-panel-header">
        <span className="project-panel-title">PROJECT</span>
      </div>
      <div className="project-panel-content">
        <div className="project-section">
          <div className="project-section-title">Files</div>
          <div className="file-tree">
            {mockFileTree.map((node, index) => (
              <FileTreeItem key={`${node.name}-${index}`} node={node} depth={0} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Panel definition
export const projectPanelDefinition: PanelDefinition = {
  id: 'project',
  title: 'Project',
  icon: () => <ProjectPanelIcon />,
  badge: () => ProjectPanelBadge(),
  fullRender: () => <ProjectPanelFull />,
};
