import { useEffect, useRef, useCallback, forwardRef } from 'react';
import { useDriveBrowser } from '../hooks/useDriveBrowser.js';
import { useFocusNav } from '../hooks/useFocusNav.js';
import { FOLDER_MIME, scaleThumbnail } from '../utils/driveApi.js';
import Breadcrumb from './Breadcrumb.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

const COLUMNS = 3;

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

// ── FileCard ─────────────────────────────────────────────────────────────────

const FileCard = forwardRef(function FileCard({ file, focused, onClick }, ref) {
  const isFolder = file.mimeType === FOLDER_MIME;
  const thumb = scaleThumbnail(file.thumbnailLink, 640);
  const duration = formatDuration(file.videoMediaMetadata?.durationMillis);

  return (
    <div
      ref={ref}
      className={`file-card ${focused ? 'file-card--focused' : ''}`}
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
              {isFolder ? <FolderIcon /> : <VideoIcon />}
            </div>
          </>
        ) : (
          <div className="file-card__icon">
            {isFolder ? <FolderIcon /> : <VideoIcon />}
          </div>
        )}

        {/* Play button badge — only on video files */}
        {!isFolder && (
          <div className="file-card__play-badge">
            <PlayBadgeIcon />
          </div>
        )}

        {/* Duration badge */}
        {duration && (
          <span className="file-card__duration">{duration}</span>
        )}
      </div>

      <p className="file-card__name">{file.name}</p>
    </div>
  );
});

// ── SVG icons ─────────────────────────────────────────────────────────────────

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="64" height="64" style={{ color: '#4fc3f7' }}>
      <path d="M10 4H2C.9 4 0 4.9 0 6v12c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-10l-2-2z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="64" height="64" style={{ color: '#666' }}>
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

// ── FileBrowser ───────────────────────────────────────────────────────────────

export default function FileBrowser({ onPlayVideo, active = true }) {
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

  const { focusIndex, setFocusIndex, moveFocus } = useFocusNav(files.length, COLUMNS);
  const itemRefs = useRef([]);

  // Load root on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Scroll focused item into view AND set real browser focus so the
  // Fire Stick browser's native focus model stays in sync with ours.
  useEffect(() => {
    const el = itemRefs.current[focusIndex];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.focus({ preventScroll: true });
  }, [focusIndex]);

  // ── History API — Fire Stick back button support ───────────────────────
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

  // ── Keyboard / remote navigation ─────────────────────────────────────────
  useEffect(() => {
    if (!active) return; // Disabled while a video is playing
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
  }, [active, focusIndex, files, moveFocus, handleSelect, navigateBack]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="browser">
      {/* Header */}
      <header className="browser__header">
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

        {files.length > 0 && (
          <div className="file-grid">
            {files.map((file, index) => (
              <FileCard
                key={file.id}
                file={file}
                focused={focusIndex === index}
                ref={(el) => { itemRefs.current[index] = el; }}
                onClick={() => handleSelect(file)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Remote hint */}
      <footer className="browser__footer">
        <span>↑ ↓ ← →&nbsp; Navigate &nbsp;·&nbsp; OK&nbsp; Select &nbsp;·&nbsp; Back ⬅ Go up</span>
      </footer>
    </div>
  );
}
