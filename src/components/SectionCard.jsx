function SectionCard({ title, subtitle, children, actions, className = '' }) {
  return (
    <section className={`card section-card${className ? ` ${className}` : ''}`}>
      {title || subtitle || actions ? (
        <div className="section-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="section-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export default SectionCard;
