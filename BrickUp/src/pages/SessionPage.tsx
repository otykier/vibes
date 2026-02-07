import { useParams, Link } from 'react-router-dom';
import { useState, useCallback, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSession } from '../hooks/useSession';
import type { SessionPart } from '../types';
import { PART_CATEGORIES } from '../lib/categories';
import { saveRecentSession } from '../lib/recentSessions';

function useClipboard() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);
  return { copied, copy };
}

type SortKey = 'color' | 'category' | 'status';
type FilterKey = 'all' | 'found' | 'not-found' | 'complete';

export default function SessionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading, error, incrementFound, resetSession } = useSession(slug);
  const [sortBy, setSortBy] = useState<SortKey>('color');
  const [filterBy, setFilterBy] = useState<FilterKey>('all');
  const [similarPartNum, setSimilarPartNum] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['__spares__']));
  const [groupOrder, setGroupOrder] = useState<string[] | null>(null);
  const { copied, copy } = useClipboard();
  const shareUrl = window.location.origin + window.location.pathname + window.location.hash;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // Reset custom group order when sort key changes
  useEffect(() => { setGroupOrder(null); }, [sortBy]);

  // Save to recent sessions when data loads or progress changes
  useEffect(() => {
    if (!data) return;
    const regular = data.parts.filter((p) => !p.is_spare);
    saveRecentSession({
      slug: data.session.slug,
      set_num: data.session.set_num,
      set_name: data.session.set_name,
      set_img_url: data.session.set_img_url,
      totalFound: regular.reduce((sum, p) => sum + p.qty_found, 0),
      totalNeeded: regular.reduce((sum, p) => sum + p.qty_needed, 0),
    });
  }, [data]);

  if (loading) return <div className="loading">Loading session...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!data) return <div className="error">Session not found</div>;

  const { session, parts } = data;

  // Separate spares from regular parts
  const regularParts = parts.filter((p) => !p.is_spare);
  const spareParts = parts.filter((p) => p.is_spare);

  const totalNeeded = regularParts.reduce((sum, p) => sum + p.qty_needed, 0);
  const totalFound = regularParts.reduce((sum, p) => sum + p.qty_found, 0);
  const progressPct = totalNeeded > 0 ? Math.round((totalFound / totalNeeded) * 100) : 0;

  function filterParts(items: SessionPart[]) {
    let result = items;

    // Apply "similar" filter first
    if (similarPartNum) {
      result = result.filter((p) => p.part_num === similarPartNum);
    }

    switch (filterBy) {
      case 'found':
        return result.filter((p) => p.qty_found > 0 && p.qty_found < p.qty_needed);
      case 'not-found':
        return result.filter((p) => p.qty_found < p.qty_needed);
      case 'complete':
        return result.filter((p) => p.qty_found >= p.qty_needed);
      default:
        return result;
    }
  }

  function sortParts(items: SessionPart[]) {
    return [...items].sort((a, b) => {
      switch (sortBy) {
        case 'color':
          return a.color_name.localeCompare(b.color_name) || a.part_name.localeCompare(b.part_name);
        case 'category':
          return (a.category ?? '').localeCompare(b.category ?? '') || a.part_name.localeCompare(b.part_name);
        case 'status': {
          const aComplete = a.qty_found >= a.qty_needed ? 1 : 0;
          const bComplete = b.qty_found >= b.qty_needed ? 1 : 0;
          return aComplete - bComplete || a.color_name.localeCompare(b.color_name);
        }
        default:
          return 0;
      }
    });
  }

  const filteredRegular = sortParts(filterParts(regularParts));
  const filteredSpares = sortParts(filterParts(spareParts));

  // Group parts by the selected sort key
  interface PartGroup {
    label: string;
    colorRgb?: string;
    parts: SessionPart[];
  }

  function groupParts(items: SessionPart[]): PartGroup[] {
    const groups: PartGroup[] = [];
    const map = new Map<string, PartGroup>();

    for (const p of items) {
      let key: string;
      let label: string;
      let colorRgb: string | undefined;

      switch (sortBy) {
        case 'color':
          key = `${p.color_id}`;
          label = p.color_name;
          colorRgb = p.color_rgb;
          break;
        case 'category':
          key = p.category ?? 'Other';
          label = p.category ? (PART_CATEGORIES[p.category] ?? `Category ${p.category}`) : 'Other';
          break;
        case 'status':
          key = p.qty_found >= p.qty_needed ? 'complete' : 'incomplete';
          label = p.qty_found >= p.qty_needed ? 'Complete' : 'Incomplete';
          break;
      }

      let group = map.get(key);
      if (!group) {
        group = { label, colorRgb, parts: [] };
        map.set(key, group);
        groups.push(group);
      }
      group.parts.push(p);
    }

    return groups;
  }

  const rawGroups = groupParts(filteredRegular);
  const spareGroups = groupParts(filteredSpares);

  // Apply custom order if set, otherwise use natural order
  const regularGroups = groupOrder
    ? [...rawGroups].sort((a, b) => {
        const ai = groupOrder.indexOf(a.label);
        const bi = groupOrder.indexOf(b.label);
        return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
      })
    : rawGroups;

  const allGroupKeys = regularGroups.map((g) => g.label);
  const allCollapsed = allGroupKeys.length > 0 && allGroupKeys.every((k) => collapsedGroups.has(k));

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAllGroups() {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(allGroupKeys));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const keys = regularGroups.map((g) => g.label);
    const fromIdx = keys.indexOf(active.id as string);
    const toIdx = keys.indexOf(over.id as string);
    if (fromIdx === -1 || toIdx === -1) return;
    keys.splice(fromIdx, 1);
    keys.splice(toIdx, 0, active.id as string);
    setGroupOrder(keys);
  }

  // Check if "filter similar" would show multiple colors for a given part_num
  function hasSimilar(partNum: string) {
    const colors = new Set(regularParts.filter((p) => p.part_num === partNum).map((p) => p.color_id));
    return colors.size > 1;
  }

  return (
    <div className="session-page">
      <header className="session-header">
        <Link to="/" className="home-link">BrickUp</Link>
        <div className="session-info">
          {session.set_img_url && <img src={session.set_img_url} alt={session.set_name} className="set-thumb" />}
          <div>
            <h1>{session.set_name}</h1>
            <p className="set-num">{session.set_num}</p>
          </div>
        </div>

        <div className="progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="progress-text">
            {totalFound}/{totalNeeded} pieces ({progressPct}%)
          </span>
        </div>

        <div className="controls">
          <div className="control-group">
            <label>Group by:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value="color">Color</option>
              <option value="category">Category</option>
              <option value="status">Status</option>
            </select>
          </div>
          <div className="control-group">
            <label>Filter:</label>
            <select value={filterBy} onChange={(e) => setFilterBy(e.target.value as FilterKey)}>
              <option value="all">All</option>
              <option value="not-found">Not Complete</option>
              <option value="found">In Progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>
          <button className="btn-secondary" onClick={() => setShowQR(!showQR)}>
            {showQR ? 'Hide QR' : 'Share'}
          </button>
          <button className="btn-danger" onClick={() => { if (confirm('Reset all found counts to zero?')) resetSession(); }}>
            Reset
          </button>
          <button
            className="btn-secondary btn-collapse-all"
            onClick={toggleAllGroups}
            title={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
          >
            {allCollapsed ? '\u25BC' : '\u25B2'}
          </button>
        </div>

        {similarPartNum && (
          <div className="similar-filter-banner">
            <span>All colors: {filteredRegular[0]?.part_name ?? similarPartNum}</span>
            <button className="btn-secondary" onClick={() => setSimilarPartNum(null)}>
              Clear
            </button>
          </div>
        )}

        {showQR && (
          <div className="qr-container">
            <div className="share-url">
              <code className="share-url-text">{shareUrl}</code>
              <button className="btn-copy" onClick={() => copy(shareUrl)}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <QRCodeSVG value={shareUrl} size={160} />
            <p className="qr-hint">Scan to join this session</p>
          </div>
        )}
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => {
          setCollapsedGroups((prev) => new Set([...prev, ...regularGroups.map((g) => g.label)]));
        }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={regularGroups.map((g) => g.label)} strategy={verticalListSortingStrategy}>
          {regularGroups.map((group) => (
            <SortableGroupSection
              key={group.label}
              id={group.label}
              label={group.label}
              colorRgb={sortBy === 'color' ? group.colorRgb : undefined}
              parts={group.parts}
              collapsed={collapsedGroups.has(group.label)}
              onToggle={() => toggleGroup(group.label)}
            >
              <div className="parts-grid">
                {group.parts.map((part) => (
                  <PartCard
                    key={part.id}
                    part={part}
                    onIncrement={incrementFound}
                    onFilterSimilar={hasSimilar(part.part_num) ? () => setSimilarPartNum(part.part_num) : undefined}
                  />
                ))}
              </div>
            </SortableGroupSection>
          ))}
        </SortableContext>
      </DndContext>

      {filteredSpares.length > 0 && (
        <GroupSection
          label="Spare Parts"
          parts={filteredSpares}
          collapsed={collapsedGroups.has('__spares__')}
          onToggle={() => toggleGroup('__spares__')}
        >
          {spareGroups.map((group) => (
            <div key={group.label} className="parts-grid">
              {group.parts.map((part) => (
                <PartCard
                  key={part.id}
                  part={part}
                  onIncrement={incrementFound}
                />
              ))}
            </div>
          ))}
        </GroupSection>
      )}
    </div>
  );
}

interface GroupSectionProps {
  label: string;
  colorRgb?: string;
  parts: SessionPart[];
  collapsed: boolean;
  onToggle: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  style?: React.CSSProperties;
  outerRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}

function GroupSection({ label, colorRgb, parts, collapsed, onToggle, dragHandleProps, style, outerRef, children }: GroupSectionProps) {
  const found = parts.reduce((sum, p) => sum + p.qty_found, 0);
  const needed = parts.reduce((sum, p) => sum + p.qty_needed, 0);
  const pct = needed > 0 ? Math.round((found / needed) * 100) : 0;

  return (
    <div ref={outerRef} className="group-section" style={style}>
      <div className={`group-header ${collapsed ? 'collapsed' : ''}`} onClick={onToggle}>
        <span className="group-header-left">
          <span className={`group-chevron ${collapsed ? 'collapsed' : ''}`}>&#9660;</span>
          {colorRgb && (
            <span className="group-color-swatch" style={{ backgroundColor: `#${colorRgb}` }} />
          )}
          <span>{label} <span className="group-count">({parts.length})</span></span>
          {found >= needed && needed > 0 && <span className="group-check">&#10003;</span>}
        </span>
        <span className="group-header-right">
          <span className="group-stats">{found}/{needed}</span>
          <span className="group-progress-bar">
            <span className="group-progress-fill" style={{ width: `${pct}%` }} />
          </span>
          {dragHandleProps && (
            <span className="group-drag-handle" onClick={(e) => e.stopPropagation()} {...dragHandleProps}>⠿</span>
          )}
        </span>
      </div>
      {!collapsed && <div className="group-content">{children}</div>}
    </div>
  );
}

function SortableGroupSection({ id, ...props }: GroupSectionProps & { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <GroupSection
      {...props}
      outerRef={setNodeRef}
      style={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

function PartCard({
  part,
  onIncrement,
  onFilterSimilar,
}: {
  part: SessionPart;
  onIncrement: (partId: number, delta?: number) => void;
  onFilterSimilar?: () => void;
}) {
  const isComplete = part.qty_found >= part.qty_needed;
  const [menuVisible, setMenuVisible] = useState(false);
  const [addValue, setAddValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuVisible) return;
    function handleClick(e: Event) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuVisible(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [menuVisible]);

  // Reposition menu to stay within viewport
  useEffect(() => {
    if (!menuVisible || !menuRef.current || !cardRef.current) return;
    const menuEl = menuRef.current;
    const menuRect = menuEl.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();

    // Check right overflow
    if (menuRect.right > window.innerWidth) {
      menuEl.style.left = 'auto';
      menuEl.style.right = '0px';
    }
    // Check bottom overflow
    if (menuRect.bottom > window.innerHeight) {
      menuEl.style.top = 'auto';
      menuEl.style.bottom = `${cardRect.height}px`;
    }
  }, [menuVisible]);

  function toggleMenu() {
    setMenuVisible((v) => !v);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    toggleMenu();
  }

  function handleMenuAction(action: () => void) {
    action();
    setMenuVisible(false);
  }

  return (
    <div
      ref={cardRef}
      className={`part-card ${isComplete ? 'complete' : ''}`}
      onContextMenu={handleContextMenu}
    >
      <div className="part-img-container" onClick={toggleMenu}>
        {part.part_img_url ? (
          <img src={part.part_img_url} alt={part.part_name} className="part-img" loading="lazy" />
        ) : (
          <div className="part-img-placeholder" />
        )}
      </div>
      <div className="color-swatch" style={{ backgroundColor: `#${part.color_rgb}` }} title={part.color_name} />
      <span className="part-name">{part.part_name}</span>
      <div className="part-counter">
        <button
          className="counter-btn"
          onClick={() => onIncrement(part.id, -1)}
          disabled={part.qty_found <= 0}
        >
          &minus;
        </button>
        <span className="part-qty" onClick={toggleMenu}>
          {part.qty_found}/{part.qty_needed}
        </span>
        <button
          className="counter-btn"
          onClick={() => onIncrement(part.id, 1)}
          disabled={isComplete}
        >
          +
        </button>
      </div>

      {menuVisible && (
        <div ref={menuRef} className="context-menu">
          <div className="context-menu-quick">
            <button
              className="quick-btn quick-btn-reset"
              onClick={() => handleMenuAction(() => onIncrement(part.id, -part.qty_found))}
              disabled={part.qty_found <= 0}
            >
              <span className="quick-btn-value">&minus;{part.qty_found}</span>
              <span className="quick-btn-label">Reset</span>
            </button>
            <button
              className="quick-btn quick-btn-complete"
              onClick={() => handleMenuAction(() => onIncrement(part.id, part.qty_needed - part.qty_found))}
              disabled={isComplete}
            >
              <span className="quick-btn-value">+{part.qty_needed - part.qty_found}</span>
              <span className="quick-btn-label">Complete</span>
            </button>
          </div>
          <form
            className="context-menu-add"
            onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(addValue, 10);
              if (!isNaN(n) && n !== 0) {
                onIncrement(part.id, n);
              }
              setAddValue('');
              setMenuVisible(false);
            }}
          >
            <input
              type="number"
              className="add-input"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              placeholder="+/-"
            />
            <button type="submit" className="add-submit">Add</button>
          </form>
          {onFilterSimilar && (
            <button
              className="context-menu-item"
              onClick={() => handleMenuAction(onFilterSimilar)}
            >
              Show all colors
            </button>
          )}
        </div>
      )}
    </div>
  );
}
