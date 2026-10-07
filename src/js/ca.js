// Click-to-copy for the contract slot. Only the stated branch renders a [data-ca-copy] button, so the inert
// branches have nothing to bind and cannot copy anything.
export function initCopy(doc, { clipboard = globalThis.navigator && globalThis.navigator.clipboard, set = setTimeout, resetMs = 1600 } = {}) {
  const fallback = text => {
    const ta = doc.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    doc.body.appendChild(ta); ta.select();
    let ok = false; try { ok = doc.execCommand && doc.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  };
  doc.querySelectorAll('[data-ca-copy]').forEach(btn => {
    const label = btn.querySelector('[data-ca-label]');
    const root = btn.closest('[data-ca]');
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-ca-copy');
      let ok = false;
      try { if (clipboard && clipboard.writeText) { await clipboard.writeText(text); ok = true; } } catch { ok = false; }
      if (!ok) ok = fallback(text);
      label.textContent = ok ? 'COPIED' : 'FAILED';
      btn.classList.toggle('done', ok);
      const v = root && root.querySelector('[data-ca-value]');
      if (ok && v) { v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash'); }
      set(() => { label.textContent = 'COPY'; btn.classList.remove('done'); if (v) v.classList.remove('flash'); }, resetMs);
    });
  });
}
