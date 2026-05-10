const isBulletLine = (line) => /^[-*]\s+/.test(line);
const isHeadingLine = (line) => /^#{1,3}\s+/.test(line) || /^[A-Z][A-Za-z0-9\s&/-]{2,}:\s*$/.test(line);

const normalizeHeading = (line) => line.replace(/^#{1,3}\s+/, '').replace(/:\s*$/, '').trim();
const normalizeBullet = (line) => line.replace(/^[-*]\s+/, '').trim();

const parseTextToBlocks = (text) => {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  let bulletBuffer = [];

  const flushBullets = () => {
    if (bulletBuffer.length > 0) {
      blocks.push({ type: 'bullets', items: bulletBuffer });
      bulletBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushBullets();
      continue;
    }

    if (isBulletLine(line)) {
      bulletBuffer.push(normalizeBullet(line));
      continue;
    }

    flushBullets();

    if (isHeadingLine(line)) {
      blocks.push({ type: 'heading', text: normalizeHeading(line) });
      continue;
    }

    blocks.push({ type: 'paragraph', text: line });
  }

  flushBullets();
  return blocks;
};

export function FinnyTextMessage({ text }) {
  const blocks = parseTextToBlocks(text);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <p key={`heading-${index}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {block.text}
            </p>
          );
        }

        if (block.type === 'bullets') {
          return (
            <ul key={`bullets-${index}`} className="list-disc space-y-1 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={`bullet-${index}-${itemIndex}`} className="leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`paragraph-${index}`} className="leading-relaxed">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
