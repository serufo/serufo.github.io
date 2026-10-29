// ===== SPA + listagem de PDFs (GitHub Pages / servidor local) + thumbs =====

const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('[data-page]');
const menuToggle = document.getElementById('menuToggle');
const navLinksContainer = document.getElementById('navLinks');
const yearEl = document.getElementById('year');

if (yearEl) yearEl.textContent = new Date().getFullYear();

/** @type {{ path: string, name: string, pasta: string, subpasta: string, url: string }[]} */
let pdfFiles = [];
const thumbCache = new Map();

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

  if (pageId === 'outros') scanPdfs();
}

function handleRoute() {
  showPage(window.location.hash.slice(1) || 'home');
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

function setStatus(msg, isError) {
  const el = document.getElementById('pdfStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

// ---------- Detecta GitHub Pages ----------
function getGitHubRepoInfo() {
  const host = window.location.hostname;
  if (!host.endsWith('github.io')) return null;

  const owner = host.replace(/\.github\.io$/i, '');
  // Project page: username.github.io/repo-name/
  // User page: username.github.io/
  const parts = window.location.pathname.split('/').filter(Boolean);
  // Se o primeiro segmento parece ser o nome do repo (não é arquivo)
  let repo = owner + '.github.io'; // default: site de usuário
  if (parts.length >= 1 && !parts[0].includes('.')) {
    repo = parts[0];
  }

  // Permite override via meta tags ou config global
  const metaOwner = document.querySelector('meta[name="github-owner"]')?.content;
  const metaRepo = document.querySelector('meta[name="github-repo"]')?.content;
  if (window.GITHUB_OWNER && window.GITHUB_REPO) {
    return { owner: window.GITHUB_OWNER, repo: window.GITHUB_REPO };
  }
  if (metaOwner && metaRepo) {
    return { owner: metaOwner, repo: metaRepo };
  }

  return { owner, repo };
}

/** URL pública do arquivo no site (github.io) */
function pagesFileUrl(pathInRepo) {
  // pathInRepo tipo: pdfs/algoritmos/aula.pdf
  const base = document.querySelector('base')?.href || window.location.origin + basePath();
  const clean = pathInRepo.replace(/^\/+/, '');
  return new URL(clean, base.endsWith('/') ? base : base + '/').href;
}

function basePath() {
  // Em project pages: /repo-name/
  const info = getGitHubRepoInfo();
  if (!info) {
    // local: raiz
    const path = window.location.pathname;
    if (path.endsWith('.html')) {
      return path.substring(0, path.lastIndexOf('/') + 1) || '/';
    }
    return path.endsWith('/') ? path : path + '/';
  }
  const host = window.location.hostname;
  const owner = host.replace(/\.github\.io$/i, '');
  if (info.repo === owner + '.github.io') return '/';
  return '/' + info.repo + '/';
}

// ---------- GitHub API: lista conteúdo do repositório ----------
async function scanViaGitHubAPI() {
  const info = getGitHubRepoInfo();
  if (!info) throw new Error('Não está no GitHub Pages');

  const { owner, repo } = info;
  setStatus(`Consultando repositório ${owner}/${repo}…`);

  // Tree API recursiva (1 request) — precisa do SHA do branch default
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (!repoRes.ok) {
    throw new Error(`Repo ${owner}/${repo} não encontrado (${repoRes.status}). Confira se o repositório é público.`);
  }
  const repoData = await repoRes.json();
  const branch = repoData.default_branch || 'main';

  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { Accept: 'application/vnd.github+json' } }
  );
  if (!treeRes.ok) throw new Error(`Falha ao listar arquivos (${treeRes.status})`);

  const treeData = await treeRes.json();
  const files = [];

  for (const item of treeData.tree || []) {
    if (item.type !== 'blob') continue;
    if (!/^pdfs\//i.test(item.path)) continue;
    if (!/\.pdf$/i.test(item.path)) continue;

    // pdfs/algoritmos/aula.pdf → pasta=algoritmos, subpasta=...
    const rel = item.path.replace(/^pdfs\//i, '');
    const segments = rel.split('/');
    const name = segments[segments.length - 1];
    const pasta = segments.length > 1 ? segments[0] : 'raiz';
    const subpasta = segments.length > 2 ? segments.slice(1, -1).join('/') : '';

    files.push({
      path: rel,
      name,
      pasta,
      subpasta,
      url: pagesFileUrl(item.path)
    });
  }

  return files;
}

// ---------- Servidor local (python -m http.server) ----------
async function fetchDirLinks(dirUrl) {
  const res = await fetch(dirUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = dirUrl.endsWith('/') ? dirUrl : dirUrl + '/';
  const links = [];

  for (const a of doc.querySelectorAll('a')) {
    let href = a.getAttribute('href');
    if (!href) continue;
    if (href === '../' || href === '..' || href.startsWith('?')) continue;
    // ignore absolute paths that leave the dir
    try { href = decodeURIComponent(href); } catch (_) {}
    const name = href.replace(/\/$/, '');
    if (!name || name === '.' || name.startsWith('.')) continue;
    const isDir = href.endsWith('/');
    links.push({ name, isDir, url: new URL(href, base).href });
  }
  return links;
}

async function scanDirRecursive(dirUrl, pastaRel = '') {
  const found = [];
  let entries;
  try {
    entries = await fetchDirLinks(dirUrl);
  } catch (e) {
    return found;
  }
  for (const entry of entries) {
    if (entry.isDir) {
      const subPasta = pastaRel ? `${pastaRel}/${entry.name}` : entry.name;
      found.push(...await scanDirRecursive(entry.url.endsWith('/') ? entry.url : entry.url + '/', subPasta));
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

async function scanViaLocalServer() {
  const base = new URL('pdfs/', window.location.href).href;
  return scanDirRecursive(base, '');
}

// ---------- Orquestração ----------
async function scanPdfs() {
  setStatus('Procurando PDFs…');
  const tree = document.getElementById('pdfTree');
  if (tree) tree.innerHTML = '<div class="pdf-loading">Carregando arquivos…</div>';

  try {
    let files = [];
    const gh = getGitHubRepoInfo();

    if (gh) {
      files = await scanViaGitHubAPI();
    } else {
      files = await scanViaLocalServer();
    }

    pdfFiles = files;
    updateFolderFilter(files);

    if (files.length === 0) {
      setStatus('Nenhum PDF em pdfs/. Faça commit dos arquivos na pasta pdfs/ do repositório e aguarde o deploy.');
    } else {
      setStatus(`${files.length} PDF(s) encontrado(s). Gerando miniaturas…`);
    }
    renderPdfTree();
    generateThumbs(files);
  } catch (err) {
    console.error(err);
    pdfFiles = [];
    renderPdfTree();
    setStatus(
      (err && err.message) ||
      'Falha ao listar PDFs. No GitHub Pages o repositório precisa ser público e os arquivos devem estar em pdfs/.',
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

// ---------- Fallback: File System Access (só local) ----------
async function pickFolderManually() {
  if (!window.showDirectoryPicker) {
    setStatus('Seleção de pasta não disponível neste navegador. No GitHub Pages, coloque os PDFs em pdfs/ e faça push.', true);
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    setStatus('Lendo pasta…');
    const files = await walkDirectoryHandle(dirHandle, '');
    pdfFiles = files;
    updateFolderFilter(files);
    setStatus(`${files.length} PDF(s). Gerando miniaturas…`);
    renderPdfTree();
    generateThumbs(files);
  } catch (e) {
    if (e.name !== 'AbortError') setStatus('Falha: ' + e.message, true);
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
      found.push({
        path: pastaRel ? `${pastaRel}/${entry.name}` : entry.name,
        name: entry.name,
        pasta: pastaRel.split('/')[0] || 'raiz',
        subpasta: pastaRel.includes('/') ? pastaRel.split('/').slice(1).join('/') : '',
        url: blobUrl
      });
    }
  }
  return found;
}

// ---------- Miniaturas PDF.js ----------
async function generateThumbs(files) {
  if (!window.pdfjsLib) {
    setStatus(`${files.length} PDF(s). Miniaturas indisponíveis (PDF.js).`);
    return;
  }
  let done = 0;
  for (const f of files) {
    if (thumbCache.has(f.path)) { done++; continue; }
    try {
      const dataUrl = await renderFirstPageThumb(f.url);
      if (dataUrl) {
        thumbCache.set(f.path, dataUrl);
        const ph = document.querySelector(`[data-thumb-path="${cssAttr(f.path)}"]`);
        if (ph) {
          if (ph.tagName === 'IMG') {
            ph.src = dataUrl;
            ph.classList.add('loaded');
          } else {
            const img = document.createElement('img');
            img.className = 'thumb loaded';
            img.src = dataUrl;
            img.alt = f.name;
            img.dataset.thumbPath = f.path;
            ph.replaceWith(img);
          }
        }
      }
    } catch (e) {
      console.warn('Thumb falhou:', f.name, e);
    }
    done++;
    if (done === files.length || done % 2 === 0) {
      setStatus(`${files.length} PDF(s) · miniaturas ${done}/${files.length}`);
    }
  }
  setStatus(`${files.length} PDF(s) · miniaturas prontas`);
}

async function renderFirstPageThumb(url) {
  const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
  const page = await pdf.getPage(1);
  const desiredWidth = 180;
  const v0 = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: desiredWidth / v0.width });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  try { pdf.destroy(); } catch (_) {}
  return canvas.toDataURL('image/jpeg', 0.72);
}

function cssAttr(s) {
  // escape for CSS attribute selector
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ---------- UI ----------
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
      f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query)
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

  const groups = {};
  for (const f of list) {
    if (!groups[f.pasta]) groups[f.pasta] = [];
    groups[f.pasta].push(f);
  }

  let html = '';
  for (const pasta of Object.keys(groups).sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
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
          ? `<img class="thumb loaded" src="${thumb}" alt="${escapeAttr(label)}" data-thumb-path="${escapeAttr(f.path)}" />`
          : `<div class="thumb-placeholder" data-thumb-path="${escapeAttr(f.path)}">
               <span>📄</span><small>carregando…</small>
             </div>`
        }
      </div>
      <div class="pdf-card-body">
        <h3 class="pdf-card-title" title="${escapeAttr(f.name)}">${escapeHtml(label)}</h3>
        <div class="pdf-card-meta">
          ${sub}<span class="file-name">${escapeHtml(f.name)}</span>
        </div>
        <div class="pdf-actions">
          <a href="${escapeAttr(f.url)}" class="btn btn-primary btn-sm" target="_blank" rel="noopener" download="${escapeAttr(f.name)}">Baixar</a>
          <a href="${escapeAttr(f.url)}" class="btn btn-secondary btn-sm" target="_blank" rel="noopener">Abrir</a>
        </div>
      </div>
    </article>`;
}

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
