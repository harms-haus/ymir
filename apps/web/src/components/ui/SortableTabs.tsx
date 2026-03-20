import { useState, useCallback, useRef, useEffect, ReactNode } from 'react';

interface UseSortableTabsOptions {
  onReorder: (fromIndex: number, toIndex: number) => void;
  tabWidthEstimate?: number;
}

export function useSortableTabs({
  onReorder,
  tabWidthEstimate = 120,
}: UseSortableTabsOptions) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [isDropping, setIsDropping] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartXRef = useRef(0);
  const tabsListRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDraggedIndex(index);
    setDropTargetIndex(null);
    setDragOffset(0);
    dragStartXRef.current = e.clientX;
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((clientX: number) => {
    if (draggedIndex === null || !tabsListRef.current) return;

    const newOffset = clientX - dragStartXRef.current;
    setDragOffset(newOffset);

    const allTabs = Array.from(tabsListRef.current.querySelectorAll('[data-tab="true"]'));
    if (allTabs.length === 0) return;

    const draggedRect = allTabs[draggedIndex]?.getBoundingClientRect();
    if (!draggedRect) return;

    const draggedCenter = draggedRect.left + draggedRect.width / 2 + newOffset;

    let newIndex = draggedIndex;
    for (let i = 0; i < allTabs.length; i++) {
      if (i === draggedIndex) continue;
      const otherRect = allTabs[i].getBoundingClientRect();
      const otherCenter = otherRect.left + otherRect.width / 2;

      if (newOffset > 0 && draggedCenter > otherCenter && draggedIndex < i) {
        newIndex = i;
        break;
      } else if (newOffset < 0 && draggedCenter < otherCenter && draggedIndex > i) {
        newIndex = i;
        break;
      }
    }

    setDropTargetIndex(newIndex !== draggedIndex ? newIndex : null);
  }, [draggedIndex]);

  const handleMouseUp = useCallback(() => {
    if (draggedIndex !== null && dropTargetIndex !== null && dropTargetIndex !== draggedIndex) {
      setIsDropping(true);
      onReorder(draggedIndex, dropTargetIndex);
      setTimeout(() => setIsDropping(false), 50);
    }
    setDraggedIndex(null);
    setDropTargetIndex(null);
    setDragOffset(0);
  }, [draggedIndex, dropTargetIndex, onReorder]);

  useEffect(() => {
    if (draggedIndex === null) return;

    const onMove = (e: MouseEvent) => handleMouseMove(e.clientX);
    const onUp = () => handleMouseUp();

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [draggedIndex, handleMouseMove, handleMouseUp]);

  const getTabStyle = (index: number): React.CSSProperties => {
    if (draggedIndex === null) {
      return { transform: 'translateX(0)', transition: 'transform 0.2s ease' };
    }

    if (index === draggedIndex) {
      return {
        transform: `translateX(${dragOffset}px)`,
        transition: 'none',
        opacity: 0.3,
        cursor: 'grabbing',
      };
    }

    if (dropTargetIndex === null) {
      return { transform: 'translateX(0)', transition: 'transform 0.2s ease' };
    }

    let shift = 0;
    if (draggedIndex < dropTargetIndex) {
      if (index > draggedIndex && index <= dropTargetIndex) {
        shift = -tabWidthEstimate;
      }
    } else {
      if (index >= dropTargetIndex && index < draggedIndex) {
        shift = tabWidthEstimate;
      }
    }

    return {
      transform: `translateX(${shift}px)`,
      transition: isDropping ? 'none' : 'transform 0.2s ease',
    };
  };

  return {
    draggedIndex,
    dropTargetIndex,
    tabsListRef,
    getTabStyle,
    handleMouseDown,
  };
}

interface SortableTabProps {
  index: number;
  draggedIndex: number | null;
  dropTargetIndex: number | null;
  getTabStyle: (index: number) => React.CSSProperties;
  onMouseDown: (index: number, e: React.MouseEvent) => void;
  children: ReactNode;
}

export function SortableTab({
  index,
  getTabStyle,
  onMouseDown,
  children,
}: SortableTabProps) {
  const style = getTabStyle(index);

  const handleMouseDown = (e: React.MouseEvent) => {
    onMouseDown(index, e);
  };

  return (
    <div
      data-tab="true"
      role="button"
      tabIndex={0}
      style={style}
      onMouseDown={handleMouseDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
        }
      }}
    >
      {children}
    </div>
  );
}
