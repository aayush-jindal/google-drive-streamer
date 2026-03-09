import { useRef, useEffect, useState, useCallback } from 'react';
import LoadingSpinner from './LoadingSpinner.jsx';

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoPlayer({ file, onBack }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const controlsTimerRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [videoError, setVideoError] = useState(null);

  // The proxy at /api/stream-video handles auth server-side and relays only
  // the exact byte range the browser requests — typically 1-2 MB per call.
  // The browser drives all seeking and buffering natively via Range requests.
  const videoSrc = `/api/stream-video?fileId=${encodeURIComponent(file.id)}`;

  // Focus the player container on mount so the Fire Stick browser routes
  // all remote key events here immediately, without needing a click first.
  useEffect(() => {
    playerRef.current?.focus();
  }, []);

  // ── Wake lock — prevent screen saver during playback ─────────────────────
  useEffect(() => {
    let lock = null;
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    }
    return () => lock?.release();
  }, []);

  // ── Controls auto-hide ────────────────────────────────────────────────────
  const revealControls = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => {
    revealControls();
    return () => clearTimeout(controlsTimerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Signal to the browser that we want eager buffering at normal speed.
    v.defaultPlaybackRate = 1.0;

    const handlers = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      timeupdate: () => setCurrentTime(v.currentTime),
      durationchange: () => setDuration(v.duration),
      waiting: () => setBuffering(true),
      canplay: () => setBuffering(false),
      playing: () => setBuffering(false),
      error: () => {
        const code = v.error?.code;
        const ext = file.name.split('.').pop().toUpperCase();
        if (code === 4) {
          // MEDIA_ERR_SRC_NOT_SUPPORTED fires both when the source URL returns
          // a non-video response (auth error, redirect) AND when the codec is
          // truly unsupported. Check the proxy logs for the real cause.
          setVideoError(
            `Could not play ${ext} file. ` +
            `If the file is H.265/HEVC or .mov, try converting it to MP4 (H.264). ` +
            `Otherwise check that the service account has access to this file.`,
          );
        } else if (code === 2) {
          setVideoError('Network error — check your connection and try again.');
        } else {
          setVideoError(`Playback error (code ${code}). Check your connection or try again.`);
        }
      },
    };

    Object.entries(handlers).forEach(([evt, fn]) => v.addEventListener(evt, fn));
    return () => Object.entries(handlers).forEach(([evt, fn]) => v.removeEventListener(evt, fn));
  }, []);

  // ── Playback controls ─────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
    revealControls();
  }, [revealControls]);

  const seek = useCallback((delta) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    revealControls();
  }, [revealControls]);

  // ── Keyboard / remote ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          seek(30);
          break;
        case 'ArrowDown':
          e.preventDefault();
          seek(-30);
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          onBack();
          break;
        // ── Fire Stick dedicated media buttons ──────────────────────────
        case 'MediaPlayPause':
          e.preventDefault();
          togglePlay();
          break;
        case 'MediaFastForward':
          e.preventDefault();
          seek(30);
          break;
        case 'MediaRewind':
          e.preventDefault();
          seek(-30);
          break;
        default:
          revealControls();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, onBack, revealControls]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={playerRef}
      className="player"
      tabIndex={0}
      onClick={togglePlay}
      onMouseMove={revealControls}
      style={{ cursor: showControls ? 'default' : 'none', outline: 'none' }}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        className="player__video"
        autoPlay
        playsInline
        preload="auto"
      />

      {buffering && !videoError && (
        <div className="player__overlay">
          <LoadingSpinner />
        </div>
      )}

      {videoError && (
        <div className="player__overlay player__overlay--error" onClick={(e) => e.stopPropagation()}>
          <p className="player__error-msg">{videoError}</p>
          <button className="btn btn-primary" onClick={onBack}>← Back</button>
        </div>
      )}

      {showControls && !videoError && (
        <div className="player__controls" onClick={(e) => e.stopPropagation()}>
          <p className="player__title">{file.name}</p>

          <div className="player__seek-track">
            <div className="player__seek-fill" style={{ width: `${progress}%` }} />
            <input
              type="range"
              className="player__seek-input"
              min={0}
              max={duration || 100}
              step={1}
              value={currentTime}
              onChange={(e) => {
                const v = videoRef.current;
                if (v) v.currentTime = parseFloat(e.target.value);
              }}
              aria-label="Seek"
            />
          </div>

          <div className="player__bar">
            <button className="player__btn player__btn--back" onClick={onBack}>
              ← Back
            </button>

            <button
              className="player__btn player__btn--play"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '⏸' : '▶'}
            </button>

            <span className="player__time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <span className="player__hint">
              ← → 10s &nbsp;·&nbsp; ↑ ↓ 30s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
