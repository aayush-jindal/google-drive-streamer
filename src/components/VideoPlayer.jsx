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

export default function VideoPlayer({ file, onBack, isTVDevice = true }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const controlsTimerRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [videoError, setVideoError] = useState(null);
  const [seekHint, setSeekHint] = useState(null); // { label: string } | null
  const seekHintTimerRef = useRef(null);

  const isPhone = !isTVDevice;

  const videoSrc = `/api/stream-video?fileId=${encodeURIComponent(file.id)}`;

  // TV: focus the player container immediately so d-pad events arrive here.
  // Phone: don't steal focus — the native video controls manage themselves.
  useEffect(() => {
    if (isTVDevice) playerRef.current?.focus();
  }, [isTVDevice]);

  // Wake lock — prevent screen saver on both TV and phone.
  useEffect(() => {
    let lock = null;
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    }
    return () => lock?.release();
  }, []);

  // Phone: push a history entry when the player opens so the Android hardware
  // back button (which fires popstate, not keydown) closes the player.
  useEffect(() => {
    if (!isPhone) return;
    window.history.pushState({ videoPlaying: true }, '');
    const onPop = () => onBack();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isPhone, onBack]);

  // ── Controls auto-hide (TV only) ──────────────────────────────────────────
  const revealControls = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    if (!isTVDevice) return;
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback controls (TV) ────────────────────────────────────────────────
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

    // Flash a seek indicator centred on screen so the user can see how far
    // they jumped. Clears and restarts if the user seeks again quickly.
    clearTimeout(seekHintTimerRef.current);
    setSeekHint({ label: delta > 0 ? `⏩  +${delta}s` : `⏪  ${delta}s` });
    seekHintTimerRef.current = setTimeout(() => setSeekHint(null), 900);
  }, [revealControls]);

  // ── Keyboard / d-pad (TV only) ────────────────────────────────────────────
  // Focus is trapped here while the player is mounted:
  //   • FileBrowser's keyboard handler is disabled via active=false in App.jsx
  //   • All remote keys are consumed here and never bubble further
  //
  // Fire Stick Silk key-name notes
  // ──────────────────────────────
  //   Play/Pause  → e.key 'MediaPlayPause'  | keyCode 179
  //   Fast Fwd    → e.key 'FastFwd'         | keyCode 228  (NOT 'MediaFastForward')
  //   Rewind      → e.key 'Rewind'          | keyCode 227  (NOT 'MediaRewind')
  //   Older Silk versions may report e.key = 'Unidentified', rely on keyCode.
  useEffect(() => {
    if (!isTVDevice) return;
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
        // Play/Pause — W3C name + keyCode 179
        case 'MediaPlayPause':
          e.preventDefault();
          togglePlay();
          break;
        // Fast-forward — W3C name AND Fire Stick Silk name
        case 'MediaFastForward':
        case 'FastFwd':
          e.preventDefault();
          seek(30);
          break;
        // Rewind — W3C name AND Fire Stick Silk name
        case 'MediaRewind':
        case 'Rewind':
          e.preventDefault();
          seek(-30);
          break;
        default:
          // Fallback for older Silk that reports e.key = 'Unidentified'
          // eslint-disable-next-line no-fallthrough
          if (e.keyCode === 179) { e.preventDefault(); togglePlay(); }
          else if (e.keyCode === 228) { e.preventDefault(); seek(30); }
          else if (e.keyCode === 227) { e.preventDefault(); seek(-30); }
          else { revealControls(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTVDevice, togglePlay, seek, onBack, revealControls]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Phone layout ──────────────────────────────────────────────────────────
  // Uses the browser's built-in video controls (scrubber, play/pause, full-screen).
  // A floating back button is always visible so users can exit without needing
  // the remote — the hardware back button is handled via popstate (see above).
  if (isPhone) {
    return (
      <div className="player player--phone">
        <button className="player__phone-back" onClick={onBack}>
          ← Back
        </button>

        <video
          ref={videoRef}
          src={videoSrc}
          className="player__video"
          autoPlay
          playsInline
          preload="auto"
          controls
        />

        {/* Buffering spinner — shown until the browser has enough data to play */}
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
      </div>
    );
  }

  // ── TV layout ─────────────────────────────────────────────────────────────
  // Full custom controls: click-to-pause, seek bar, time readout, auto-hide.
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

      {/* Seek flash — centred on screen, auto-fades after ~900 ms */}
      {seekHint && (
        <div key={seekHint.label} className="player__seek-hint">
          {seekHint.label}
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
