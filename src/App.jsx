import { useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import PasswordScreen from './components/PasswordScreen.jsx';
import FileBrowser from './components/FileBrowser.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';

export default function App() {
  const { authenticated, loading, login } = useAuth();
  const [currentVideo, setCurrentVideo] = useState(null);

  if (loading) {
    return (
      <div className="page-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!authenticated) {
    return <PasswordScreen onLogin={login} />;
  }

  return (
    <>
      {/* Keep FileBrowser mounted at all times so folder navigation state
          (breadcrumbs, scroll position, file list) survives video playback. */}
      {/* active={false} disables FileBrowser's keyboard handler while a
          video is playing, preventing double-handling of arrow keys. */}
      <div style={currentVideo ? { display: 'none' } : undefined}>
        <FileBrowser onPlayVideo={setCurrentVideo} active={!currentVideo} />
      </div>

      {currentVideo && (
        <VideoPlayer
          file={currentVideo}
          onBack={() => setCurrentVideo(null)}
        />
      )}
    </>
  );
}
