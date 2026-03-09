import { useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { useDevice } from './hooks/useDevice.js';
import PasswordScreen from './components/PasswordScreen.jsx';
import FileBrowser from './components/FileBrowser.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';

export default function App() {
  const { authenticated, loading, login } = useAuth();
  const [currentVideo, setCurrentVideo] = useState(null);
  const { isPhone, isTVDevice } = useDevice();

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
      {/* Keep FileBrowser mounted so folder navigation state survives video playback. */}
      <div style={currentVideo ? { display: 'none' } : undefined}>
        <FileBrowser
          onPlayVideo={setCurrentVideo}
          active={!currentVideo}
          isTVDevice={isTVDevice}
          isPhone={isPhone}
        />
      </div>

      {currentVideo && (
        <VideoPlayer
          file={currentVideo}
          onBack={() => setCurrentVideo(null)}
          isTVDevice={isTVDevice}
        />
      )}
    </>
  );
}
