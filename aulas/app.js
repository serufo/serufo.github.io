// ===== SPA + varredura automática de pdfs/ + thumbs da 1ª página =====

const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('[data-page]');
const menuToggle = document.getElementById('menuToggle');
const navLinksContainer = document.getElementById('navLinks');
const yearEl = document.getElementById('year');

if (yearEl) yearEl.textContent = new Date().getFullYear();

/** @type {{ path: string, name: string, pasta: string, url: string, blobUrl?: string }[]} */
let pdfFiles = [];
let thumbCache = new Map(); // path -> dataURL

function showPage(pageId) {
  pages.forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.page === pageId || link.getAttribute('href') === `#${pageId}`) {
      link.classList.add('active');
    }
  });

  navLinksContainer?.classList.remove('open');
  menuToggle?.classList.remove('active');
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));

  if (pageId === 'outros') {
    scanPdfs();
  }
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'home';
  showPage(hash);
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', () => {
  handleRoute();
  document.getElementById('pdfSearch')?.addEventListener('input', renderPdfTree);
  document.getElementById('pdfFilter')?.addEventListener('change', renderPdfTree);
  document.getElementById('btnRefreshPdfs')?.addEventListener('click', () => scanPdfs(true));
  document.getElementById('btnSelectFolder')?.addEventListener('click', pickFolderManually);
});

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    const page = link.dataset.page;
    if (page) {
      e.preventDefault();
      window.location.hash = page;
    }
  });
});

menuToggle?.addEventListener('click', () => {
  navLinksContainer.classList.toggle('open');
  menuToggle.classList.toggle('active');
});

document.querySelectorAll('.dropdown-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (window.innerWidth <= 1100) {
      e.preventDefault();
      e.stopPropagation();
      btn.closest('.dropdown').classList.toggle('open');
    }
  });
});

document.addEventListener('click', (e) => {
  if (window.innerWidth <= 1100 &&
      navLinksContainer?.classList.contains('open') &&
      !navLinksContainer.contains(e.target) &&
      !menuToggle.contains(e.target)) {
    navLinksContainer.classList.remove('open');
    menuToggle.classList.remove('active');
  }
});

// ---------- Status ----------
function setStatus(msg, isError) {
  const el = document.getElementById('pdfStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

// ---------- Varredura automática via listagem do servidor HTTP ----------
async function fetchDirLinks(dirUrl) {
  const res = await fetch(dirUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${dirUrl}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = dirUrl.endsWith('/') ? dirUrl : dirUrl + '/';
  const links = [];

  for (const a of doc.querySelectorAll('a')) {
    let href = a.getAttribute('href');
    if (!href) continue;
    // Ignora parent / query
    if (href === '../' || href === '..' || href.startsWith('?') || href.startsWith('/')) continue;
    // Decode
    try { href = decodeURIComponent(href); } catch (_) {}
    const name = href.replace(/\/$/, '');
    if (!name || name === '.' || name.startsWith('.')) continue;
    const isDir = href.endsWith('/');
    const fullUrl = new URL(href, base).href;
    // relative path from site root for display
    links.push({ name, isDir, url: fullUrl, href });
  }
  return links;
}

async function scanDirRecursive(dirUrl, pastaRel = '') {
  const found = [];
  let entries;
  try {
    entries = await fetchDirLinks(dirUrl);
  } catch (e) {
    console.warn('Falha ao listar', dirUrl, e);
    return found;
  }

  for (const entry of entries) {
    if (entry.isDir) {
      const subPasta = pastaRel ? `${pastaRel}/${entry.name}` : entry.name;
      const subUrl = entry.url.endsWith('/') ? entry.url : entry.url + '/';
      const nested = await scanDirRecursive(subUrl, subPasta);
      found.push(...nested);
    } else if (/\.pdf$/i.test(entry.name)) {
      const topFolder = pastaRel.split('/')[0] || 'raiz';
      found.push({
        path: pastaRel ? `${pastaRel}/${entry.name}` : entry.name,
        name: entry.name,
        pasta: topFolder,
        subpasta: pastaRel.includes('/') ? pastaRel.split('/').slice(1).join('/') : '',
        url: entry.url
      });
    }
  }
  return found;
}

async function scanPdfs(force) {
  setStatus('Varrendo pasta pdfs/…');
  const tree = document.getElementById('pdfTree');
  if (tree) tree.innerHTML = '<div class="pdf-loading">Carregando arquivos…</div>';

  try {
    // Tenta listagem automática (funciona com python -m http.server e similares)
    const base = new URL('pdfs/', window.location.href).href;
    const files = await scanDirRecursive(base, '');
    pdfFiles = files;

    // Atualiza filtro de pastas
    updateFolderFilter(files);

    if (files.length === 0) {
      setStatus('Nenhum PDF encontrado em pdfs/. Coloque arquivos e clique em Atualizar.', false);
    } else {
      setStatus(`${files.length} PDF(s) encontrado(s). Gerando miniaturas…`);
    }
    renderPdfTree();
    // Gera thumbs em background
    generateThumbs(files);
  } catch (err) {
    console.error(err);
    pdfFiles = [];
    renderPdfTree();
    setStatus(
      'Não foi possível listar pdfs/ automaticamente. Use “Selecionar pasta pdfs” ou sirva o site com: python -m http.server 8080',
      true
    );
  }
}

function updateFolderFilter(files) {
  const select = document.getElementById('pdfFilter');
  if (!select) return;
  const pastas = [...new Set(files.map(f => f.pasta))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const current = select.value;
  select.innerHTML = '<option value="todos">Todas as pastas</option>' +
    pastas.map(p => `<option value="${escapeAttr(p)}">${escapeHtml(p)}/</option>`).join('');
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

// ---------- File System Access API (fallback) ----------
async function pickFolderManually() {
  if (!window.showDirectoryPicker) {
    setStatus('Seu navegador não suporta seleção de pasta. Use Chrome/Edge e sirva com python -m http.server.', true);
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    setStatus('Lendo pasta selecionada…');
    const files = await walkDirectoryHandle(dirHandle, '');
    pdfFiles = files;
    updateFolderFilter(files);
    setStatus(`${files.length} PDF(s) na pasta selecionada. Gerando miniaturas…`);
    renderPdfTree();
    generateThumbs(files);
  } catch (e) {
    if (e.name !== 'AbortError') {
      setStatus('Falha ao ler a pasta: ' + e.message, true);
    }
  }
}

async function walkDirectoryHandle(dirHandle, pastaRel) {
  const found = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      const sub = pastaRel ? `${pastaRel}/${entry.name}` : entry.name;
      found.push(...await walkDirectoryHandle(entry, sub));
    } else if (entry.kind === 'file' && /\.pdf$/i.test(entry.name)) {
      const file = await entry.getFile();
      const blobUrl = URL.createObjectURL(file);
      const topFolder = pastaRel.split('/')[0] || 'raiz';
      found.push({
        path: pastaRel ? `${pastaRel}/${entry.name}` : entry.name,
        name: entry.name,
        pasta: topFolder,
        subpasta: pastaRel.includes('/') ? pastaRel.split('/').slice(1).join('/') : '',
        url: blobUrl,
        blobUrl
      });
    }
  }
  return found;
}

// ---------- Miniaturas (1ª página com PDF.js) ----------
async function generateThumbs(files) {
  if (!window.pdfjsLib) {
    setStatus((files.length ? `${files.length} PDF(s). ` : '') + 'PDF.js não carregou — miniaturas indisponíveis.');
    return;
  }

  let done = 0;
  for (const f of files) {
    if (thumbCache.has(f.path)) {
      done++;
      continue;
    }
    try {
      const dataUrl = await renderFirstPageThumb(f.url);
      if (dataUrl) {
        thumbCache.set(f.path, dataUrl);
        // Atualiza só o card correspondente se já estiver na tela
        const img = document.querySelector(`img[data-thumb-path="${CSS.escape(f.path)}"]`);
        if (img) {
          img.src = dataUrl;
          img.classList.add('loaded');
        }
      }
    } catch (e) {
      console.warn('Thumb falhou:', f.name, e);
    }
    done++;
    if (done % 3 === 0 || done === files.length) {
      setStatus(`${files.length} PDF(s) · miniaturas ${done}/${files.length}`);
    }
  }
  setStatus(`${files.length} PDF(s) · miniaturas prontas`);
}

async function renderFirstPageThumb(url) {
  const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const desiredWidth = 180;
  const viewport0 = page.getViewport({ scale: 1 });
  const scale = desiredWidth / viewport0.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  try { pdf.destroy(); } catch (_) {}
  return canvas.toDataURL('image/jpeg', 0.72);
}

// ---------- Render árvore ----------
function renderPdfTree() {
  const tree = document.getElementById('pdfTree');
  const empty = document.getElementById('pdfEmpty');
  const countEl = document.getElementById('pdfCount');
  const searchInput = document.getElementById('pdfSearch');
  const filterSelect = document.getElementById('pdfFilter');
  if (!tree) return;

  const query = (searchInput?.value || '').trim().toLowerCase();
  const filter = filterSelect?.value || 'todos';

  let list = [...pdfFiles];
  if (filter !== 'todos') list = list.filter(f => f.pasta === filter);
  if (query) {
    list = list.filter(f =>
      f.name.toLowerCase().includes(query) ||
      f.path.toLowerCase().includes(query)
    );
  }

  list.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR', { sensitivity: 'base' }));

  if (countEl) {
    countEl.textContent = list.length === 0 ? 'Nenhum arquivo' :
      list.length === 1 ? '1 arquivo' : `${list.length} arquivos`;
  }

  if (list.length === 0) {
    tree.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Agrupa por pasta
  const groups = {};
  for (const f of list) {
    if (!groups[f.pasta]) groups[f.pasta] = [];
    groups[f.pasta].push(f);
  }

  const pastas = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let html = '';

  for (const pasta of pastas) {
    const files = groups[pasta];
    html += `
      <div class="folder-block">
        <div class="folder-header">
          <span class="folder-icon">📁</span>
          <div>
            <h3 class="folder-name">${escapeHtml(pasta)}</h3>
            <span class="folder-path">pdfs/${escapeHtml(pasta)}/</span>
          </div>
          <span class="folder-count">${files.length}</span>
        </div>
        <div class="pdf-cards">
          ${files.map(fileCard).join('')}
        </div>
      </div>`;
  }

  tree.innerHTML = html;
}

function fileCard(f) {
  const thumb = thumbCache.get(f.path);
  const label = f.name.replace(/\.pdf$/i, '');
  const sub = f.subpasta ? `<span class="file-subpath">${escapeHtml(f.subpasta)}/</span>` : '';

  return `
    <article class="pdf-card-thumb">
      <div class="thumb-wrap">
        ${thumb
          ? `<img class="thumb loaded" src="${thumb}" alt="Prévia de ${escapeAttr(f.name)}" data-thumb-path="${escapeAttr(f.path)}" />`
          : `<div class="thumb-placeholder" data-thumb-path="${escapeAttr(f.path)}">
               <img class="thumb" alt="" data-thumb-path="${escapeAttr(f.path)}" style="display:none" />
               <span>📄</span>
               <small>carregando…</small>
             </div>`
        }
      </div>
      <div class="pdf-card-body">
        <h3 class="pdf-card-title" title="${escapeAttr(f.name)}">${escapeHtml(label)}</h3>
        <div class="pdf-card-meta">
          ${sub}
          <span class="file-name">${escapeHtml(f.name)}</span>
        </div>
        <div class="pdf-actions">
          <a href="${escapeAttr(f.url)}" class="btn btn-primary btn-sm" target="_blank" rel="noopener" download="${escapeAttr(f.name)}">Baixar</a>
          <a href="${escapeAttr(f.url)}" class="btn btn-secondary btn-sm" target="_blank" rel="noopener">Abrir</a>
        </div>
      </div>
    </article>`;
}

// Quando thumb carrega via cache update, troca placeholder
const _origSet = thumbCache.set.bind(thumbCache);
thumbCache.set = function (key, value) {
  _origSet(key, value);
  const placeholder = document.querySelector(`.thumb-placeholder[data-thumb-path="${CSS.escape(key)}"]`);
  if (placeholder) {
    const img = placeholder.querySelector('img.thumb') || document.createElement('img');
    img.className = 'thumb loaded';
    img.src = value;
    img.alt = '';
    img.dataset.thumbPath = key;
    placeholder.replaceWith(img);
  }
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
