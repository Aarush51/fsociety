import React from "react";

export function AppShell({ children }) {
  return <div className="hm-app-shell">{children}</div>;
}

export function Navbar({ children }) {
  return <header className="hm-navbar site-header">{children}</header>;
}

export function Sidebar({ children }) {
  return <aside className="hm-sidebar" aria-label="Workspace navigation">{children}</aside>;
}

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <header className="hm-page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="section-description">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="hm-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Button({ as: Component = "button", variant = "primary", className = "", ...props }) {
  return <Component className={`hm-button hm-button-${variant} ${className}`.trim()} {...props} />;
}

export function Card({ as: Component = "article", className = "", ...props }) {
  return <Component className={`hm-card ${className}`.trim()} {...props} />;
}

export function Badge({ tone = "neutral", className = "", ...props }) {
  return <span className={`hm-badge hm-badge-${tone} ${className}`.trim()} {...props} />;
}

export function Input({ className = "", ...props }) {
  return <input className={`hm-input ${className}`.trim()} {...props} />;
}

export function Select({ className = "", ...props }) {
  return <select className={`hm-select ${className}`.trim()} {...props} />;
}

export function Tabs({ items = [], value, onChange, className = "" }) {
  return (
    <div className={`hm-tabs ${className}`.trim()} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={value === item.value ? "is-active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, children, footer, onClose }) {
  if (!open) return null;
  return (
    <div className="hm-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="hm-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="hm-modal-header">
          <h2>{title}</h2>
          <button type="button" className="hm-icon-button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="hm-modal-body">{children}</div>
        {footer ? <footer className="hm-modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function StatCard({ label, value, detail, tone = "primary" }) {
  return (
    <Card className={`hm-stat-card hm-stat-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </Card>
  );
}

export function StatusBadge({ status, children }) {
  const normalized = String(status || children || "").toLowerCase();
  const tone = normalized.includes("success") || normalized.includes("approved") || normalized.includes("active") || normalized.includes("registered")
    ? "success"
    : normalized.includes("warn") || normalized.includes("pending")
      ? "warning"
      : normalized.includes("error") || normalized.includes("reject") || normalized.includes("failed")
        ? "error"
        : "primary";
  return <Badge tone={tone}>{children || status}</Badge>;
}
