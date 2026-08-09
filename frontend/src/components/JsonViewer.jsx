// Lightweight regex-based JSON syntax highlighter (no heavy editor
// dependency needed for a read-only viewer).
function highlight(json) {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-sky-300'; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'text-accent-300' : 'text-emerald-300'; // key vs string value
      } else if (/true|false/.test(match)) {
        cls = 'text-amber-300';
      } else if (/null/.test(match)) {
        cls = 'text-red-300';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export default function JsonViewer({ value }) {
  return (
    <pre
      className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all bg-surface-950 rounded-lg p-4 border border-surface-800 max-h-[60vh] overflow-auto"
      dangerouslySetInnerHTML={{ __html: highlight(value) }}
    />
  );
}
