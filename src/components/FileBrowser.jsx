import { useEffect, useRef, useCallback, forwardRef } from 'react';
import { useDriveBrowser } from '../hooks/useDriveBrowser.js';
import { useFocusNav } from '../hooks/useFocusNav.js';
import { FOLDER_MIME, scaleThumbnail } from '../utils/driveApi.js';
import Breadcrumb from './Breadcrumb.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  if (!ms) return null;
  const s = Math.floor(Number(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function FolderIcon({ size = 64 }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} style={{ color: '#4fc3f7' }}>
      <path d="M10 4H2C.9 4 0 4.9 0 6v12c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-10l-2-2z" />
    </svg>
  );
}

function VideoIcon({ size = 64 }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} style={{ color: '#666' }}>
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
  );
}

function PlayBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="44" height="44">
      <circle cx="12" cy="12" r="12" fill="rgba(0,0,0,0.55)" />
      <polygon points="9.5,7 19,12 9.5,17" fill="white" />
    </svg>
  );
}

// ── TV: Full-width list row ───────────────────────────────────────────────────
//
// One row per file; easy up/down d-pad navigation.
// Thumbnail on left, name + metadata in middle, arrow indicator on right.

const FileRow = forwardRef(function FileRow({ file, focused, onClick }, ref) {
  const isFolder = file.mimeType === FOLDER_MIME;
  const thumb = scaleThumbnail(file.thumbnailLink, 320);
  const duration = formatDuration(file.videoMediaMetadata?.durationMillis);

  return (
    <div
      ref={ref}
      className={`file-row ${focused ? 'file-row--focused' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={file.name}
    >
      <div className="file-row__thumb">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="file-row__img"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="file-row__icon">
            {isFolder ? <FolderIcon size={40} /> : <VideoIcon size={40} />}
          </div>
        )}
      </div>

      <div className="file-row__info">
        <p className="file-row__name">{file.name}</p>
        <p className="file-row__meta">
          {isFolder ? 'Folder' : (duration || 'Video')}
        </p>
      </div>

      <div className="file-row__arrow" aria-hidden="true">
        {isFolder ? '›' : '▶'}
      </div>
    </div>
  );
});

// ── Phone: Compact grid card ──────────────────────────────────────────────────
//
// 2-column card grid; no focus ring (touch users tap, not navigate).

const FileCard = forwardRef(function FileCard({ file, onClick }, ref) {
  const isFolder = file.mimeType === FOLDER_MIME;
  const thumb = scaleThumbnail(file.thumbnailLink, 480);
  const duration = formatDuration(file.videoMediaMetadata?.durationMillis);

  return (
    <div
      ref={ref}
      className="file-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={file.name}
    >
      <div className="file-card__thumb">
        {thumb ? (
          <>
            <img
              src={thumb}
              alt=""
              className="file-card__img"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextSibling.style.display = 'flex';
              }}
            />
            <div className="file-card__icon" style={{ display: 'none' }}>
              {isFolder ? <FolderIcon size={40} /> : <VideoIcon size={40} />}
            </div>
          </>
        ) : (
          <div className="file-card__icon">
            {isFolder ? <FolderIcon size={40} /> : <VideoIcon size={40} />}
          </div>
        )}

        {!isFolder && (
          <div className="file-card__play-badge">
            <PlayBadgeIcon />
          </div>
        )}

        {duration && (
          <span className="file-card__duration">{duration}</span>
        )}
      </div>

      <p className="file-card__name">{file.name}</p>
    </div>
  );
});

// ── FileBrowser ───────────────────────────────────────────────────────────────

export default function FileBrowser({
  onPlayVideo,
  active = true,
  isTVDevice = true,
  isPhone = false,
}) {
  const {
    files,
    loading,
    error,
    breadcrumbs,
    initialize,
    navigateTo,
    navigateBack,
    navigateToCrumb,
  } = useDriveBrowser();

  // TV uses a 1-column list (columns=1 makes ArrowLeft/Right no-ops in useFocusNav,
  // while ArrowUp/Down move ±1 — exactly right for a list).
  // Phone uses 2 columns for the grid but keyboard nav is disabled anyway.
  const columns = isTVDevice ? 1 : 2;
  const { focusIndex, setFocusIndex, moveFocus } = useFocusNav(files.length, columns);
  const itemRefs = useRef([]);

  // Load root on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Scroll focused row into view and sync real browser focus.
  // TV: centre the row vertically so it's never at the edge of the viewport.
  // Phone: skip — touch users scroll freely, no focus indicator shown.
  useEffect(() => {
    if (!isTVDevice) return;
    const el = itemRefs.current[focusIndex];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }, [focusIndex, isTVDevice]);

  // ── History API — Fire Stick back button & Android hardware back ─────────
  const navigateBackRef = useRef(navigateBack);
  useEffect(() => { navigateBackRef.current = navigateBack; }, [navigateBack]);

  useEffect(() => {
    window.history.pushState({ gdSentinel: true }, '');
    const onPop = () => {
      const wentBack = navigateBackRef.current();
      if (wentBack) window.history.pushState({ gdSentinel: true }, '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── Item selection ────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (item) => {
      if (item.mimeType === FOLDER_MIME) {
        setFocusIndex(0);
        window.history.pushState({ gdSentinel: true }, '');
        navigateTo(item);
      } else {
        onPlayVideo(item);
      }
    },
    [navigateTo, onPlayVideo, setFocusIndex],
  );

  // ── Keyboard / d-pad navigation (TV only) ────────────────────────────────
  // Disabled on phone — touch users tap items directly.
  // Disabled while a video is playing (active=false) — VideoPlayer owns keys.
  useEffect(() => {
    if (!active || isPhone) return;
    const onKey = (e) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault();
          moveFocus(e.key);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (files[focusIndex]) handleSelect(files[focusIndex]);
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          navigateBack();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, isPhone, focusIndex, files, moveFocus, handleSelect, navigateBack]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="browser">
      {/* Header */}
      <header className="browser__header">
        {/* Phone back button — visible in header instead of relying on remote */}
        {isPhone && breadcrumbs.length > 1 && (
          <button className="browser__back-btn" onClick={navigateBack}>
            ← Back
          </button>
        )}
        <Breadcrumb items={breadcrumbs} onNavigate={navigateToCrumb} />
        <div className="browser__header-right">
          {loading && <LoadingSpinner size="small" />}
        </div>
      </header>

      {/* Content */}
      <main className="browser__content">
        {loading && files.length === 0 && (
          <div className="page-center">
            <LoadingSpinner />
            <p className="status-text">Loading files…</p>
          </div>
        )}

        {error && !loading && (
          <div className="page-center">
            <p className="status-text status-text--error">Error: {error}</p>
            <button className="btn btn-primary" onClick={initialize}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && files.length === 0 && (
          <div className="page-center">
            <p className="status-text">No videos or folders here.</p>
          </div>
        )}

        {/* TV: single-column list view for easy up/down remote navigation */}
        {files.length > 0 && isTVDevice && (
          <div className="file-list">
            {files.map((file, index) => (
              <FileRow
                key={file.id}
                file={file}
                focused={focusIndex === index}
                ref={(el) => { itemRefs.current[index] = el; }}
                onClick={() => handleSelect(file)}
              />
            ))}
          </div>
        )}

        {/* Phone: 2-column card grid, touch-only */}
        {files.length > 0 && isPhone && (
          <div className="file-grid file-grid--phone">
            {files.map((file, index) => (
              <FileCard
                key={file.id}
                file={file}
                ref={(el) => { itemRefs.current[index] = el; }}
                onClick={() => handleSelect(file)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Remote hint footer — TV only */}
      {isTVDevice && (
        <footer className="browser__footer">
          <span>↑ ↓&nbsp; Navigate &nbsp;·&nbsp; OK&nbsp; Select &nbsp;·&nbsp; Back ⬅ Go up</span>
        </footer>
      )}
    </div>
  );
}
