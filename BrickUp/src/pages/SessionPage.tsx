import { useParams } from 'react-router-dom';
import { useState, useCallback, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSession } from '../hooks/useSession';
import type { SessionPart } from '../types';

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
  const { copied, copy } = useClipboard();
  const shareUrl = window.location.href;

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
        return result.filter((p) => p.qty_found > 0);
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

  const displayParts = sortParts(filterParts(regularParts));
  const displaySpares = sortParts(filterParts(spareParts));

  // Check if "filter similar" would show multiple colors for a given part_num
  function hasSimilar(partNum: string) {
    const colors = new Set(regularParts.filter((p) => p.part_num === partNum).map((p) => p.color_id));
    return colors.size > 1;
  }

  return (
    <div className="session-page">
      <header className="session-header">
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
            <label>Sort:</label>
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
        </div>

        {similarPartNum && (
          <div className="similar-filter-banner">
            <span>All colors: {displayParts[0]?.part_name ?? similarPartNum}</span>
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

      <div className="parts-grid">
        {displayParts.map((part) => (
          <PartCard
            key={part.id}
            part={part}
            onIncrement={incrementFound}
            onFilterSimilar={hasSimilar(part.part_num) ? () => setSimilarPartNum(part.part_num) : undefined}
          />
        ))}
      </div>

      {displaySpares.length > 0 && (
        <>
          <h2 className="spares-heading">Spare Parts</h2>
          <div className="parts-grid">
            {displaySpares.map((part) => (
              <PartCard
                key={part.id}
                part={part}
                onIncrement={incrementFound}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
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
  const [menu, setMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menu.visible) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu((m) => ({ ...m, visible: false }));
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [menu.visible]);

  function openMenu(clientX: number, clientY: number) {
    // Position relative to the card
    const cardRect = cardRef.current?.getBoundingClientRect();
    if (cardRect) {
      setMenu({
        visible: true,
        x: clientX - cardRect.left,
        y: clientY - cardRect.top,
      });
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    longPressTimer.current = setTimeout(() => {
      openMenu(x, y);
    }, 500);
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTouchMove() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }

  function handleMenuAction(action: () => void) {
    action();
    setMenu((m) => ({ ...m, visible: false }));
  }

  return (
    <div
      ref={cardRef}
      className={`part-card ${isComplete ? 'complete' : ''}`}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <div className="part-img-container">
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
        <span className="part-qty">
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

      {menu.visible && (
        <div ref={menuRef} className="context-menu" style={{ top: menu.y, left: menu.x }}>
          <button
            className="context-menu-item"
            onClick={() => handleMenuAction(() => onIncrement(part.id, -part.qty_found))}
            disabled={part.qty_found <= 0}
          >
            Clear
          </button>
          <button
            className="context-menu-item"
            onClick={() => handleMenuAction(() => onIncrement(part.id, part.qty_needed - part.qty_found))}
            disabled={isComplete}
          >
            Complete
          </button>
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
