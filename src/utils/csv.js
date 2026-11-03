function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Cells starting with = + - @ are prefixed with ' so spreadsheets don't run them as formulas.
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function downloadCSV(filename, rows) {
  const csv = '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\n');
  download(filename, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
}

export function downloadJSON(filename, data) {
  download(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}
