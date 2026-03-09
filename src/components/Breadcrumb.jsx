export default function Breadcrumb({ items, onNavigate }) {
  return (
    <nav className="breadcrumb" aria-label="Folder path">
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${crumb.id}-${index}`} className="breadcrumb__segment">
            {index > 0 && <span className="breadcrumb__sep">›</span>}
            <button
              className={`breadcrumb__item ${isLast ? 'breadcrumb__item--active' : ''}`}
              onClick={() => !isLast && onNavigate(index)}
              disabled={isLast}
              aria-current={isLast ? 'page' : undefined}
            >
              {crumb.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
