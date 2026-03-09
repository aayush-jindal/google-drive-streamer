import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// No StrictMode — avoids double-firing of effects that manage timers/polling
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
