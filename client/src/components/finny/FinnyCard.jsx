import { useNavigate } from 'react-router-dom';

const toSafeArray = (value) => (Array.isArray(value) ? value : []);

export function FinnyCard({ card }) {
  const navigate = useNavigate();

  if (!card || typeof card !== 'object') {
    return null;
  }

  const title = typeof card.title === 'string' ? card.title : '';
  const summary = typeof card.summary === 'string' ? card.summary : '';
  const sections = toSafeArray(card.sections);
  const actions = toSafeArray(card.actions);
  const disclaimer = typeof card.disclaimer === 'string' ? card.disclaimer : '';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {title ? <h3 className="text-lg font-semibold text-slate-900">{title}</h3> : null}
      {summary ? <p className="mt-1 text-sm text-slate-500">{summary}</p> : null}

      {sections.map((section, index) => {
        if (!section || typeof section !== 'object') {
          return null;
        }

        const heading = typeof section.heading === 'string'
          ? section.heading
          : typeof section.title === 'string'
            ? section.title
            : '';
        const content = typeof section.content === 'string'
          ? section.content
          : typeof section.text === 'string'
            ? section.text
            : '';
        const bullets = toSafeArray(section.bullets).filter((item) => typeof item === 'string' && item.trim().length > 0);

        if (!heading && !content && bullets.length === 0) {
          return null;
        }

        return (
          <section key={`${heading || 'section'}-${index}`} className="mt-4">
            {heading ? <h4 className="font-medium text-slate-800">{heading}</h4> : null}
            {content ? <p className="mt-1 text-sm leading-relaxed text-slate-600">{content}</p> : null}
            {bullets.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
                {bullets.map((bullet, bulletIndex) => (
                  <li key={`${heading || 'section'}-bullet-${bulletIndex}`}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      {actions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action, index) => {
            if (!action || typeof action !== 'object') {
              return null;
            }

            const label = typeof action.label === 'string' ? action.label : '';
            const href = typeof action.href === 'string' ? action.href : '';

            if (!label || !href) {
              return null;
            }

            return (
              <button
                key={`${label}-${index}`}
                type="button"
                onClick={() => {
                  if (href.startsWith('/')) {
                    navigate(href);
                    return;
                  }

                  window.open(href, '_blank', 'noopener,noreferrer');
                }}
                className={
                  index === 0
                    ? 'rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1d4ed8]'
                    : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50'
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {disclaimer ? <p className="mt-4 text-xs italic text-slate-500">{disclaimer}</p> : null}
    </div>
  );
}

