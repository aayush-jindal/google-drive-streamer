export default function LoadingSpinner({ size = 'medium' }) {
  return <div className={`spinner spinner--${size}`} aria-label="Loading" />;
}
