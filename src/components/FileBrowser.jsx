import { useEffect, useRef, useCallback, useState } from 'react';
import { useDriveBrowser } from '../hooks/useDriveBrowser.js';
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
// Cursor hovers → row highlights (via onMouseEnter → parent state).
// Select/Enter/Click → opens the item.
// No arrow-key navigation — Silk browser moves the cursor with arrow keys,
// so we embrace cursor-based hover instead.

function FileRow({ file, focused, onMouseEnter, onClick }) {
  const isFolder = file.mimeType === FOLDER_MIME;
  const thumb = scaleThumbnail(file.thumbnailLink, 320);
  const duration = formatDuration(file.videoMediaMetadata?.durationMillis);

  return (
    <div
      className={`file-row ${focused ? 'file-row--focused' : ''}`}
      onMouseEnter={onMouseEnter}
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
}

// ── Phone: Compact grid card ──────────────────────────────────────────────────

function FileCard({ file, onClick }) {
  const isFolder = file.mimeType === FOLDER_MIME;
  const thumb = scaleThumbnail(file.thumbnailLink, 480);
  const duration = formatDuration(file.videoMediaMetadata?.durationMillis);

  return (
    <div
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
}

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

  // TV nav: which row the cursor is currently over (-1 = none).
  // Updated by onMouseEnter on each FileRow — no arrow keys needed.
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  // Ref on the scrollable container for the auto-scroll zones.
  const listRef = useRef(null);

  // Used by the rAF scroll loop below — avoids re-creating the loop on state changes.
  const scrollDirRef = useRef(0);   // -1 | 0 | 1
  const scrollRafRef = useRef(null);

  // Load root on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Reset hovered row and scroll position whenever files change (new folder loaded).
  useEffect(() => {
    setHoveredIndex(-1);
    if (listRef.current) listRef.current.scrollTo({ top: 0 });
  }, [files]);

  // ── Auto-scroll zones (TV only) ───────────────────────────────────────────
  // Moving the cursor into the top or bottom 15% of the screen smoothly
  // scrolls the list — no manual scrollbar needed.
  // The rAF loop runs at ~60 fps; scrollDir=0 means no scrolling.
  useEffect(() => {
    if (!isTVDevice || !active) return;

    const loop = () => {
      if (scrollDirRef.current !== 0 && listRef.current) {
        listRef.current.scrollBy({ top: scrollDirRef.current * 8 });
      }
      scrollRafRef.current = requestAnimationFrame(loop);
    };
    scrollRafRef.current = requestAnimationFrame(loop);

    const onMouseMove = (e) => {
      const h = window.innerHeight;
      if (e.clientY < h * 0.15)      scrollDirRef.current = -1;
      else if (e.clientY > h * 0.85) scrollDirRef.current =  1;
      else                            scrollDirRef.current =  0;
    };
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      cancelAnimationFrame(scrollRafRef.current);
      window.removeEventListener('mousemove', onMouseMove);
      scrollDirRef.current = 0;
    };
  }, [isTVDevice, active]);

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
        window.history.pushState({ gdSentinel: true }, '');
        navigateTo(item);
      } else {
        onPlayVideo(item);
      }
    },
    [navigateTo, onPlayVideo],
  );

  // ── Keyboard handler (TV + phone, when active) ────────────────────────────
  // TV:    Enter / Space → open whichever row the cursor is hovering
  //        Backspace / Escape → go up a folder (Fire Stick back button)
  //        Arrow keys intentionally NOT handled — Silk moves the cursor with
  //        them, so intercepting arrows would break cursor navigation.
  // Phone: only Escape / Backspace are meaningful here.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (hoveredIndex >= 0 && files[hoveredIndex]) {
            handleSelect(files[hoveredIndex]);
          }
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
  }, [active, hoveredIndex, files, handleSelect, navigateBack]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="browser">
      {/* Header */}
      <header className="browser__header">
        {isPhone && breadcrumbs.length > 1 && (
          <button className="browser__back-btn" onClick={navigateBack}>
            ← Back
          </button>
        )}
        {isTVDevice && breadcrumbs.length > 1 && (
          <button className="browser__back-btn" onClick={navigateBack}>
            ← Back
          </button>
        )}
        <Breadcrumb items={breadcrumbs} onNavigate={navigateToCrumb} />
        <div className="browser__header-right">
          {loading && <LoadingSpinner size="small" />}
        </div>
      </header>

      {/* Content — this element is the scroll container */}
      <main className="browser__content" ref={listRef}>
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

        {/* TV: single-column list, cursor-hover navigation */}
        {files.length > 0 && isTVDevice && (
          <div
            className="file-list"
            onMouseLeave={() => setHoveredIndex(-1)}
          >
            {files.map((file, index) => (
              <FileRow
                key={file.id}
                file={file}
                focused={hoveredIndex === index}
                onMouseEnter={() => setHoveredIndex(index)}
                onClick={() => handleSelect(file)}
              />
            ))}
          </div>
        )}

        {/* Phone: 2-column card grid, touch-only */}
        {files.length > 0 && isPhone && (
          <div className="file-grid file-grid--phone">
            {files.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onClick={() => handleSelect(file)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer hint — TV only */}
      {isTVDevice && (
        <footer className="browser__footer">
          <span>Hover to highlight &nbsp;·&nbsp; OK / Click&nbsp; Open &nbsp;·&nbsp; Back ⬅ Go up</span>
        </footer>
      )}
    </div>
  );
}
