import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSession } from '../hooks/useSession';
import type { SessionPart } from '../types';

type SortKey = 'color' | 'category' | 'status';
type FilterKey = 'all' | 'found' | 'not-found' | 'complete';

export default function SessionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading, error, incrementFound, resetSession } = useSession(slug);
  const [sortBy, setSortBy] = useState<SortKey>('color');
  const [filterBy, setFilterBy] = useState<FilterKey>('all');
  const [showQR, setShowQR] = useState(false);

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
    switch (filterBy) {
      case 'found':
        return items.filter((p) => p.qty_found > 0);
      case 'not-found':
        return items.filter((p) => p.qty_found < p.qty_needed);
      case 'complete':
        return items.filter((p) => p.qty_found >= p.qty_needed);
      default:
        return items;
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
          <button className="btn-danger" onClick={resetSession}>
            Reset
          </button>
        </div>

        {showQR && (
          <div className="qr-container">
            <QRCodeSVG value={window.location.href} size={160} />
            <p className="qr-hint">Scan to join this session</p>
          </div>
        )}
      </header>

      <div className="parts-grid">
        {displayParts.map((part) => (
          <PartCard key={part.id} part={part} onIncrement={incrementFound} />
        ))}
      </div>

      {displaySpares.length > 0 && (
        <>
          <h2 className="spares-heading">Spare Parts</h2>
          <div className="parts-grid">
            {displaySpares.map((part) => (
              <PartCard key={part.id} part={part} onIncrement={incrementFound} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PartCard({
  part,
  onIncrement,
}: {
  part: SessionPart;
  onIncrement: (partId: number, delta?: number) => void;
}) {
  const isComplete = part.qty_found >= part.qty_needed;

  return (
    <div className={`part-card ${isComplete ? 'complete' : ''}`}>
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
    </div>
  );
}
