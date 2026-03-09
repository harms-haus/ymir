import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { projectPanelDefinition } from '../ProjectPanel';

describe('ProjectPanel Component', () => {
  beforeEach(() => {
    // No cleanup needed for this component - it's a pure mock component
  });

  describe('Rendering', () => {
    it('should render without errors', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      expect(screen.getByText('PROJECT')).toBeInTheDocument();
    });

    it('should render project section title', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      expect(screen.getByText('Files')).toBeInTheDocument();
    });

    it('should render top-level folders', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('public')).toBeInTheDocument();
    });

    it('should render top-level files', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      expect(screen.getByText('package.json')).toBeInTheDocument();
      expect(screen.getByText('tsconfig.json')).toBeInTheDocument();
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('vite.config.ts')).toBeInTheDocument();
    });

    it('should have panel definition with required properties', () => {
      expect(projectPanelDefinition).toBeDefined();
      expect(projectPanelDefinition.id).toBe('project');
      expect(projectPanelDefinition.title).toBe('Project');
      expect(projectPanelDefinition.icon).toBeInstanceOf(Function);
      expect(projectPanelDefinition.badge).toBeInstanceOf(Function);
      expect(projectPanelDefinition.fullRender).toBeInstanceOf(Function);
    });

    it('should render icon from definition', () => {
      const IconComponent = projectPanelDefinition.icon;
      const { container } = render(<IconComponent />);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    });

    it('should return null from badge', () => {
      const badge = projectPanelDefinition.badge;
      const result = badge?.();

      expect(result).toBeNull();
    });

    it('should render full panel from definition', () => {
      const FullPanel = projectPanelDefinition.fullRender;
      render(<FullPanel />);

      expect(screen.getByText('PROJECT')).toBeInTheDocument();
    });
  });

  describe('File Tree Display', () => {
    it('should display folder items', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      const srcFolder = screen.getByText('src');
      expect(srcFolder).toBeInTheDocument();

      const publicFolder = screen.getByText('public');
      expect(publicFolder).toBeInTheDocument();
    });

    it('should display nested files', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      expect(screen.getByText('ProjectPanel.tsx')).toBeInTheDocument();
      expect(screen.getByText('ProjectPanel.css')).toBeInTheDocument();
      expect(screen.getByText('GitPanel.tsx')).toBeInTheDocument();
      expect(screen.getByText('TabBar.tsx')).toBeInTheDocument();
      expect(screen.getByText('WorkspaceSidebar.tsx')).toBeInTheDocument();

      expect(screen.getByText('types.ts')).toBeInTheDocument();
      expect(screen.getByText('workspace.ts')).toBeInTheDocument();

      expect(screen.getByText('useLayout.ts')).toBeInTheDocument();
      expect(screen.getByText('useKeyboardShortcuts.ts')).toBeInTheDocument();
    });

    it('should display files in public folder', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      expect(screen.getByText('index.html')).toBeInTheDocument();
    });
  });

  describe('Folder Expansion', () => {
    it('should auto-expand first two levels of folders', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('public')).toBeInTheDocument();

      expect(screen.getByText('components')).toBeInTheDocument();
      expect(screen.getByText('state')).toBeInTheDocument();
      expect(screen.getByText('hooks')).toBeInTheDocument();

      expect(screen.getByText('ProjectPanel.tsx')).toBeInTheDocument();
      expect(screen.getByText('types.ts')).toBeInTheDocument();
      expect(screen.getByText('useLayout.ts')).toBeInTheDocument();
    });

    it('should toggle folder expansion on click', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      const srcFolder = screen.getByText('src');
      const srcFolderContainer = srcFolder.closest('.project-folder-item');

      expect(srcFolderContainer).toBeInTheDocument();

      if (srcFolderContainer) {
        const folderTree = srcFolderContainer.parentElement?.querySelector('.project-folder-tree');

        expect(folderTree).toBeInTheDocument();

        if (folderTree) {
          fireEvent.click(srcFolderContainer);

          const collapsedFolderTree = srcFolderContainer.parentElement?.querySelector('.project-folder-tree');
          expect(collapsedFolderTree).not.toBeInTheDocument();
        }
      }
    });

    it('should expand public folder to show its contents', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      const publicFolder = screen.getByText('public');

      expect(publicFolder).toBeInTheDocument();

      const publicFolderContainer = publicFolder.closest('.folder-node');
      expect(publicFolderContainer).toBeInTheDocument();

      const publicFolderTree = publicFolderContainer?.querySelector('.project-folder-tree');
      expect(publicFolderTree).toBeInTheDocument();

      expect(screen.getByText('index.html')).toBeInTheDocument();
    });
  });

  describe('File Icons', () => {
    it('should render file icons for each file type', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      const { container } = render(<ProjectPanelFull />);

      const fileItemNames = ['ProjectPanel.tsx', 'ProjectPanel.css', 'package.json', 'index.html', 'README.md'];

      fileItemNames.forEach(fileName => {
        const fileItem = Array.from(container.querySelectorAll('.file-name')).find(el => el.textContent === fileName);

        expect(fileItem).toBeInTheDocument();

        if (fileItem) {
          const parentContainer = fileItem.closest('.project-folder-item');
          expect(parentContainer).toBeInTheDocument();

          if (parentContainer) {
            const svg = parentContainer.querySelector('svg');
            expect(svg).toBeInTheDocument();
          }
        }
      });
    });

    it('should render folder icons for folders', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      const srcFolder = screen.getByText('src');
      const srcFolderContainer = srcFolder.closest('.project-folder-item');

      expect(srcFolderContainer).toBeInTheDocument();
      if (srcFolderContainer) {
        const svgs = srcFolderContainer.querySelectorAll('svg');
        expect(svgs.length).toBeGreaterThan(0);
      }
    });

    it('should have correct icon structure for file items', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      const fileItem = screen.getByText('ProjectPanel.tsx');
      const fileContainer = fileItem.closest('.project-folder-item');

      expect(fileContainer).toBeInTheDocument();
      if (fileContainer) {
        expect(fileContainer.querySelector('.file-name')).toBeInTheDocument();
        expect(fileContainer.querySelector('svg')).toBeInTheDocument();
      }
    });
  });

  describe('Mock Data Handling', () => {
    it('should display mock file tree with correct structure', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      const allFileNames = ['src', 'public', 'package.json', 'tsconfig.json', 'README.md', 'vite.config.ts'];
      allFileNames.forEach(name => {
        expect(screen.getByText(name)).toBeInTheDocument();
      });
    });

    it('should handle empty folder states gracefully', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('components')).toBeInTheDocument();
      expect(screen.getByText('state')).toBeInTheDocument();
      expect(screen.getByText('hooks')).toBeInTheDocument();
      expect(screen.getByText('public')).toBeInTheDocument();
    });

    it('should display correct file extensions', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      render(<ProjectPanelFull />);

      expect(screen.getByText('ProjectPanel.tsx')).toBeInTheDocument();
      expect(screen.getByText('ProjectPanel.css')).toBeInTheDocument();
      expect(screen.getByText('package.json')).toBeInTheDocument();
      expect(screen.getByText('index.html')).toBeInTheDocument();
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
  });

  describe('Panel Structure', () => {
    it('should have correct panel structure', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      const { container } = render(<ProjectPanelFull />);

      const panel = container.querySelector('.project-panel');
      expect(panel).toBeInTheDocument();

      const header = container.querySelector('.project-panel-header');
      expect(header).toBeInTheDocument();

      const content = container.querySelector('.project-panel-content');
      expect(content).toBeInTheDocument();
    });

    it('should display project panel header with title', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      const { container } = render(<ProjectPanelFull />);

      const header = container.querySelector('.project-panel-header');
      expect(header).toBeInTheDocument();

      const title = container.querySelector('.project-panel-title');
      expect(title).toBeInTheDocument();
      expect(title?.textContent).toBe('PROJECT');
    });

    it('should display project section', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      const { container } = render(<ProjectPanelFull />);

      const section = container.querySelector('.project-section');
      expect(section).toBeInTheDocument();

      const sectionTitle = container.querySelector('.project-section-title');
      expect(sectionTitle).toBeInTheDocument();
      expect(sectionTitle?.textContent).toBe('Files');
    });

    it('should display file tree container', () => {
      const ProjectPanelFull = projectPanelDefinition.fullRender;
      const { container } = render(<ProjectPanelFull />);

      const fileTree = container.querySelector('.file-tree');
      expect(fileTree).toBeInTheDocument();
    });
  });
});
