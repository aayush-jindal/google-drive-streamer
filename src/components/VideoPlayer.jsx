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
  const [seekHint, setSeekHint] = useState(null);     // { label: string } | null
  const seekHintTimerRef = useRef(null);

  // Double-press back: first press shows a toast, second press exits.
  // Prevents accidental exits when the remote Back button is bumped.
  const [showBackToast, setShowBackToast] = useState(false);
  const backPressRef  = useRef(0);
  const backTimerRef  = useRef(null);

  // Hidden video element kept 60 s ahead of main playback for prefetching.
  const prefetchRef = useRef(null);

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

  // ── Buffer diagnostics (temporary) ──────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onWaiting = () =>
      console.log('[video] buffering started at', video.currentTime);
    const onPlaying = () =>
      console.log('[video] buffering ended at', video.currentTime);
    const onProgress = () => {
      if (video.buffered.length > 0) {
        console.log(
          '[video] buffered up to',
          video.buffered.end(video.buffered.length - 1),
          'current:', video.currentTime,
        );
      }
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('progress', onProgress);

    return () => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('progress', onProgress);
    };
  }, []);

  // ── Prefetch: keep a hidden video 60 s ahead of main playback ───────────────
  //
  // A hidden, muted <video> element is kept 60 s ahead of the main player.
  // This causes the browser to fetch and buffer the NEXT 40 MB chunk well
  // before the main player reaches the chunk boundary, eliminating the stall
  // that would otherwise occur while waiting for the next range response.
  //
  // Seek recovery: when the user seeks, the prefetch element is silenced
  // immediately (isSeeking = true, src cleared) so the main player gets all
  // available bandwidth for seek recovery.  The prefetch is not restarted
  // until the main player has buffered at least 20 s ahead of the new
  // position, polled every 2 s via waitForBuffer.
  //
  // Caching: stream-video.js returns Cache-Control: private, max-age=300 so
  // the browser can serve the same byte range to the main player from its
  // own cache when it catches up, rather than re-fetching from the server.
  //
  // play()+pause() is used because some browsers only issue range requests
  // when the element is in a "wants to play" state.  The 'playing' listener
  // immediately pauses so no audio leaks (muted is also set on the element).
  useEffect(() => {
    const main = videoRef.current;
    const prefetch = prefetchRef.current;
    if (!main || !prefetch) return;

    let started = false;
    let isSeeking = false;
    let waitTimer = null;

    // Seconds buffered in the main player ahead of its current position.
    const getBufferedAhead = (video) => {
      for (let i = 0; i < video.buffered.length; i++) {
        if (
          video.buffered.start(i) <= video.currentTime &&
          video.buffered.end(i)   >= video.currentTime
        ) {
          return video.buffered.end(i) - video.currentTime;
        }
      }
      return 0;
    };

    const syncPrefetch = () => {
      if (isSeeking || !started || !main.duration || main.duration === Infinity) return;
      const target = Math.min(main.currentTime + 60, main.duration - 1);

      // No-op if the main player's own buffer already covers this position.
      for (let i = 0; i < main.buffered.length; i++) {
        if (main.buffered.start(i) <= target && main.buffered.end(i) >= target) return;
      }

      if (Math.abs(prefetch.currentTime - target) > 10) {
        console.log(
          '[prefetch] seeking to', target.toFixed(1), 's',
          '(main at', main.currentTime.toFixed(1), 's)',
        );
        prefetch.currentTime = target;
        prefetch.play().catch(() => {});
      }
    };

    const stopPrefetch = () => {
      prefetch.pause();
      prefetch.removeAttribute('src');
      prefetch.load();
    };

    // Re-enable prefetch: clears the seeking guard, assigns src, and syncs
    // the hidden element to 60 s ahead of the main player's current position.
    const restartPrefetch = () => {
      isSeeking = false;
      prefetch.src = videoSrc;
      prefetch.load();
      syncPrefetch();
    };

    // Poll every 2 s until the main player has 20 s of buffer ahead.
    // Only then re-enable the prefetch so it doesn't compete with recovery.
    const waitForBuffer = () => {
      const ahead = getBufferedAhead(main);
      if (ahead > 20) {
        console.log('[prefetch] main buffered', ahead.toFixed(1), 's — restarting prefetch');
        restartPrefetch();
      } else {
        waitTimer = setTimeout(waitForBuffer, 2000);
      }
    };

    // Assign src only after main video starts playing to avoid
    // a duplicate metadata request competing with initial load.
    const onFirstPlaying = () => {
      if (started) return;
      started = true;
      main.removeEventListener('playing', onFirstPlaying);
      prefetch.src = videoSrc;
      prefetch.load();
    };

    // Seek start — give main player 100% bandwidth immediately.
    const onMainSeeking = () => {
      isSeeking = true;
      clearTimeout(waitTimer);
      stopPrefetch();
      console.log('[prefetch] paused — seek in progress');
    };

    // Seek complete — wait for main player to rebuild its buffer first.
    const onMainSeeked = () => {
      clearTimeout(waitTimer);
      waitForBuffer();
    };

    // Immediately pause whenever the prefetch element starts playing.
    const onPrefetchPlaying = () => prefetch.pause();

    main.addEventListener('playing', onFirstPlaying);
    main.addEventListener('seeking', onMainSeeking);
    main.addEventListener('seeked', onMainSeeked);
    prefetch.addEventListener('playing', onPrefetchPlaying);
    const interval = setInterval(syncPrefetch, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(waitTimer);
      main.removeEventListener('playing', onFirstPlaying);
      main.removeEventListener('seeking', onMainSeeking);
      main.removeEventListener('seeked', onMainSeeked);
      prefetch.removeEventListener('playing', onPrefetchPlaying);
      prefetch.pause();
      prefetch.removeAttribute('src');
      prefetch.load();
    };
  }, [videoSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up back-press timer on unmount.
  useEffect(() => () => clearTimeout(backTimerRef.current), []);

  // ── Double-press back ─────────────────────────────────────────────────────
  // First press: show a toast and arm a 2-second window.
  // Second press within that window: exit the player.
  // If 2 seconds pass without a second press, reset silently.
  const handleBack = useCallback(() => {
    backPressRef.current += 1;
    if (backPressRef.current === 1) {
      setShowBackToast(true);
      revealControls();
      backTimerRef.current = setTimeout(() => {
        backPressRef.current = 0;
        setShowBackToast(false);
      }, 2000);
    } else {
      clearTimeout(backTimerRef.current);
      backPressRef.current = 0;
      setShowBackToast(false);
      onBack();
    }
  }, [onBack, revealControls]);

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

  // ── Keyboard handler (TV only) ────────────────────────────────────────────
  // Arrow keys are intentionally NOT handled here — in Silk Browser, arrow
  // keys move the on-screen cursor, so intercepting them would break cursor
  // movement. All seeking is done via the dedicated media buttons instead.
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
        // Select / OK button → play/pause
        case ' ':
        case 'Enter':
          e.preventDefault();
          togglePlay();
          break;
        // Back button → double-press to exit (prevents accidental exits)
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          handleBack();
          break;
        // Play/Pause media key — W3C name + keyCode 179
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
  }, [isTVDevice, togglePlay, seek, handleBack, revealControls]);

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

        {/* Hidden prefetch element — src assigned by useEffect after first play */}
        <video ref={prefetchRef} muted preload="auto" style={{ display: 'none' }} />

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
      style={{ cursor: 'default', outline: 'none' }}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        className="player__video"
        autoPlay
        playsInline
        preload="auto"
      />

      {/* Hidden prefetch element — src assigned by useEffect after first play */}
      <video ref={prefetchRef} muted preload="auto" style={{ display: 'none' }} />

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

      {/* Double-press back toast — shown on first Back press, clears on second */}
      {showBackToast && (
        <div className="player__back-toast">
          Press back again to exit
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
            <button className="player__btn player__btn--back" onClick={handleBack}>
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
              ⏪ Rewind &nbsp;·&nbsp; ⏩ Fast Fwd &nbsp;·&nbsp; ▶⏸ Play/Pause
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
