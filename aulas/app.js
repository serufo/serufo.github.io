// ===== SPA + Catálogo Dinâmico do Google Drive (via Apps Script) =====

const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('[data-page]');
const menuToggle = document.getElementById('menuToggle');
const navLinksContainer = document.getElementById('navLinks');
const yearEl = document.getElementById('year');

if (yearEl) yearEl.textContent = new Date().getFullYear();

const SESSION_CACHE_KEY = 'serufo_drive_catalog_v1';
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/** @type {Array<{id:string, name:string, pasta:string, subpasta:string, path:string, mimeType:string, size:number, updatedAt?:string, viewUrl:string, downloadUrl?:string, thumbUrl?:string}>} */
let catalogFiles = [];
let catalogLoaded = false;
let loadSequence = 0;

// ---------- Navegação SPA ----------
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown').forEach(d => {
    d.classList.remove('open');
    d.querySelector('.dropdown-btn')?.setAttribute('aria-expanded', 'false');
  });
}

function closeMobileMenu() {
  navLinksContainer?.classList.remove('open');
  menuToggle?.classList.remove('active');
  menuToggle?.setAttribute('aria-expanded', 'false');
}

function showPage(rawPageId) {
  const pageId = rawPageId && document.getElementById(rawPageId) ? rawPageId : 'home';

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

  // Destaca o botão dropdown pai quando uma subpágina está ativa
  document.querySelectorAll('.dropdown').forEach(dropdown => {
    const hasActiveChild = dropdown.querySelector(`.dropdown-content a[data-page="${pageId}"]`);
    if (hasActiveChild) {
      dropdown.querySelector('.dropdown-btn')?.classList.add('active');
    }
  });

  closeMobileMenu();
  closeAllDropdowns();

  if (pageId === 'outros' && !catalogLoaded) {
    loadDriveCatalog(false);
  }
}

function handleRoute() {
  const hash = decodeURIComponent(window.location.hash.slice(1));
  showPage(hash || 'home');
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', () => {
  handleRoute();
  document.getElementById('pdfSearch')?.addEventListener('input', renderCatalog);
  document.getElementById('pdfFilter')?.addEventListener('change', renderCatalog);
  document.getElementById('btnRefreshPdfs')?.addEventListener('click', () => loadDriveCatalog(true));
});

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    const page = link.dataset.page;
    if (page) {
      e.preventDefault();
      if (window.location.hash === `#${page}`) {
        showPage(page);
      } else {
        window.location.hash = page;
      }
    }
  });
});

menuToggle?.addEventListener('click', () => {
  const isOpen = navLinksContainer.classList.toggle('open');
  menuToggle.classList.toggle('active', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.dropdown-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropdown = btn.closest('.dropdown');
    const wasOpen = dropdown.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) {
      dropdown.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    closeAllDropdowns();
  }
  if (
    window.innerWidth <= 1180 &&
    navLinksContainer?.classList.contains('open') &&
    !navLinksContainer.contains(e.target) &&
    !menuToggle.contains(e.target)
  ) {
    closeMobileMenu();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllDropdowns();
    closeMobileMenu();
  }
});

// ---------- Configuração e Status ----------
function getDriveConfig() {
  const catalogUrl = document.querySelector('meta[name="drive-catalog-url"]')?.content?.trim() || '';
  const folderUrl = document.querySelector('meta[name="drive-folder-url"]')?.content?.trim() || '';
  return { catalogUrl, folderUrl };
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('pdfStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

function readSessionCache(catalogUrl) {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.catalogUrl !== catalogUrl) return null;
    if (Date.now() - parsed.savedAt > SESSION_CACHE_TTL_MS) return null;
    if (!Array.isArray(parsed.files)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeSessionCache(catalogUrl, data) {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
      catalogUrl,
      savedAt: Date.now(),
      folderUrl: data.folderUrl || '',
      generatedAt: data.generatedAt || '',
      files: data.files || []
    }));
  } catch (_) {
    // Ignora se o navegador restringir sessionStorage
  }
}

// ---------- Carregamento do Catálogo do Google Drive ----------
async function loadDriveCatalog(forceRefresh = false) {
  const seq = ++loadSequence;
  const { catalogUrl, folderUrl } = getDriveConfig();
  const tree = document.getElementById('pdfTree');
  const empty = document.getElementById('pdfEmpty');
  const emptyTitle = document.getElementById('pdfEmptyTitle');
  const emptyDesc = document.getElementById('pdfEmptyDesc');

  if (folderUrl) {
    const btnOpenDrive = document.getElementById('btnOpenDrive');
    if (btnOpenDrive) btnOpenDrive.href = folderUrl;
  }

  if (!catalogUrl) {
    catalogFiles = [];
    catalogLoaded = false;
    updateFolderFilter([]);
    if (tree) tree.innerHTML = '';
    const countEl = document.getElementById('pdfCount');
    if (countEl) countEl.textContent = '';
    setStatus('Catálogo aguardando a URL do Google Apps Script (veja aulas/google-apps-script.gs).');
    if (empty) empty.style.display = 'block';
    if (emptyTitle) emptyTitle.textContent = 'Catálogo conectado ao Google Drive';
    if (emptyDesc) {
      emptyDesc.textContent = 'A pasta pública no Google Drive já está disponível. Assim que a URL do Web App do Apps Script for configurada, os arquivos aparecerão automaticamente aqui.';
    }
    return;
  }

  if (!forceRefresh) {
    const cached = readSessionCache(catalogUrl);
    if (cached) {
      catalogFiles = cached.files;
      catalogLoaded = true;
      updateFolderFilter(catalogFiles);
      setStatus(`${catalogFiles.length} arquivo(s) carregado(s) do Google Drive.`);
      renderCatalog();
      return;
    }
  }

  setStatus('Consultando pasta no Google Drive…');
  if (empty) empty.style.display = 'none';
  if (tree) tree.innerHTML = '<div class="pdf-loading">Carregando materiais do Google Drive…</div>';

  try {
    const url = new URL(catalogUrl);
    if (forceRefresh) url.searchParams.set('refresh', '1');

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Falha ao consultar Google Drive (HTTP ${res.status})`);

    const data = await res.json();
    if (seq !== loadSequence) return; // Descarta resposta obsoleta

    if (data.ok === false) {
      throw new Error(data.error || 'O Apps Script retornou um erro ao ler a pasta do Drive.');
    }

    const files = Array.isArray(data.files) ? data.files : [];
    catalogFiles = files;
    catalogLoaded = true;
    writeSessionCache(catalogUrl, data);
    updateFolderFilter(files);

    if (data.folderUrl) {
      const btnOpenDrive = document.getElementById('btnOpenDrive');
      if (btnOpenDrive) btnOpenDrive.href = data.folderUrl;
    }

    if (files.length === 0) {
      setStatus('A pasta do Google Drive está vazia no momento.');
    } else {
      setStatus(`${files.length} arquivo(s) sincronizado(s) com o Google Drive.`);
    }
    renderCatalog();
  } catch (err) {
    if (seq !== loadSequence) return;
    console.error(err);
    catalogFiles = [];
    catalogLoaded = false;
    renderCatalog();
    setStatus(
      (err && err.message) || 'Não foi possível carregar o catálogo do Google Drive. Use o botão "Abrir no Drive".',
      true
    );
  }
}

// ---------- Utilitários de Texto, Tipo e Tamanho ----------
function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getFileTypeInfo(mimeType = '', name = '') {
  const mime = String(mimeType).toLowerCase();
  const ext = (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

  if (mime === 'application/pdf' || ext === 'pdf') {
    return { label: 'PDF', icon: '📄', cls: 'type-pdf' };
  }
  if (
    mime === 'application/vnd.google-apps.presentation' ||
    mime.includes('presentation') ||
    ['ppt', 'pptx', 'odp', 'key'].includes(ext)
  ) {
    return { label: 'Slides', icon: '📊', cls: 'type-slides' };
  }
  if (
    mime === 'application/vnd.google-apps.document' ||
    mime.includes('wordprocessing') ||
    mime === 'application/msword' ||
    ['doc', 'docx', 'odt', 'rtf'].includes(ext)
  ) {
    return { label: 'Doc', icon: '📝', cls: 'type-doc' };
  }
  if (
    mime === 'application/vnd.google-apps.spreadsheet' ||
    mime.includes('spreadsheet') ||
    mime === 'application/vnd.ms-excel' ||
    ['xls', 'xlsx', 'ods', 'csv'].includes(ext)
  ) {
    return { label: 'Planilha', icon: '📈', cls: 'type-sheet' };
  }
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
    return { label: 'Imagem', icon: '🖼️', cls: 'type-image' };
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
    return { label: 'Vídeo', icon: '🎬', cls: 'type-video' };
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return { label: 'Áudio', icon: '🎵', cls: 'type-audio' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
    return { label: 'Arquivo', icon: '🗜️', cls: 'type-archive' };
  }
  if (['py', 'js', 'ts', 'html', 'css', 'json', 'ipynb', 'tex', 'md', 'txt', 'sql', 'c', 'cpp', 'java'].includes(ext)) {
    return { label: ext.toUpperCase(), icon: '💻', cls: 'type-code' };
  }
  if (mime === 'application/vnd.google-apps.form') {
    return { label: 'Formulário', icon: '📋', cls: 'type-doc' };
  }
  return { label: ext ? ext.toUpperCase() : 'Arquivo', icon: '📎', cls: 'type-other' };
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function stripExtension(name) {
  return String(name || '').replace(/\.[a-z0-9]{1,6}$/i, '');
}

// ---------- Filtros e Renderização ----------
function updateFolderFilter(files) {
  const select = document.getElementById('pdfFilter');
  if (!select) return;
  const pastas = [...new Set(files.map(f => f.pasta || 'Geral'))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
  );
  const current = select.value;
  select.innerHTML = '<option value="todos">Todas as pastas</option>' +
    pastas.map(p => `<option value="${escapeAttr(p)}">${escapeHtml(p)}/</option>`).join('');
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

function renderCatalog() {
  const tree = document.getElementById('pdfTree');
  const empty = document.getElementById('pdfEmpty');
  const emptyTitle = document.getElementById('pdfEmptyTitle');
  const emptyDesc = document.getElementById('pdfEmptyDesc');
  const countEl = document.getElementById('pdfCount');
  const searchInput = document.getElementById('pdfSearch');
  const filterSelect = document.getElementById('pdfFilter');
  if (!tree) return;

  const query = normalizeText((searchInput?.value || '').trim());
  const filter = filterSelect?.value || 'todos';

  let list = [...catalogFiles];
  if (filter !== 'todos') list = list.filter(f => (f.pasta || 'Geral') === filter);
  if (query) {
    list = list.filter(f => {
      const typeInfo = getFileTypeInfo(f.mimeType, f.name);
      const haystack = normalizeText(`${f.name} ${f.path} ${f.pasta} ${f.subpasta} ${typeInfo.label}`);
      return haystack.includes(query);
    });
  }

  list.sort((a, b) =>
    (a.path || a.name).localeCompare(b.path || b.name, 'pt-BR', { numeric: true, sensitivity: 'base' })
  );

  if (countEl) {
    countEl.textContent = list.length === 0
      ? 'Nenhum arquivo'
      : list.length === 1 ? '1 arquivo' : `${list.length} arquivos`;
  }

  if (list.length === 0) {
    tree.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (emptyTitle) emptyTitle.textContent = 'Nenhum arquivo encontrado';
    if (emptyDesc) {
      emptyDesc.textContent = query || filter !== 'todos'
        ? 'Nenhum material corresponde à busca ou pasta selecionada.'
        : 'Adicione arquivos na pasta compartilhada do Google Drive e clique em Atualizar.';
    }
    return;
  }

  if (empty) empty.style.display = 'none';

  const groups = {};
  for (const f of list) {
    const pasta = f.pasta || 'Geral';
    if (!groups[pasta]) groups[pasta] = [];
    groups[pasta].push(f);
  }

  let html = '';
  for (const pasta of Object.keys(groups).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
  )) {
    const files = groups[pasta];
    html += `
      <div class="folder-block">
        <div class="folder-header">
          <span class="folder-icon" aria-hidden="true">📁</span>
          <div>
            <h3 class="folder-name">${escapeHtml(pasta)}</h3>
            <span class="folder-path">Google Drive / ${escapeHtml(pasta)}/</span>
          </div>
          <span class="folder-count">${files.length}</span>
        </div>
        <div class="pdf-cards">
          ${files.map(fileCard).join('')}
        </div>
      </div>`;
  }

  tree.innerHTML = html;

  // Fallback limpo caso alguma miniatura do Drive não esteja disponível
  tree.querySelectorAll('img.thumb').forEach(img => {
    img.addEventListener('error', () => {
      const wrap = img.closest('.thumb-wrap');
      if (!wrap) return;
      const icon = img.dataset.fallbackIcon || '📄';
      const label = img.dataset.fallbackLabel || 'Arquivo';
      wrap.innerHTML = `<div class="thumb-placeholder"><span>${escapeHtml(icon)}</span><small>${escapeHtml(label)}</small></div>`;
    }, { once: true });
  });
}

function fileCard(f) {
  const typeInfo = getFileTypeInfo(f.mimeType, f.name);
  const label = stripExtension(f.name) || f.name;
  const sizeStr = formatBytes(f.size);
  const sub = f.subpasta ? `<span class="file-subpath">${escapeHtml(f.subpasta)}/</span>` : '';
  const viewUrl = f.viewUrl || `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`;
  const downloadUrl = f.downloadUrl || '';

  return `
    <article class="pdf-card-thumb">
      <div class="thumb-wrap">
        <span class="file-type-badge ${typeInfo.cls}">${escapeHtml(typeInfo.label)}</span>
        ${f.thumbUrl
          ? `<img class="thumb" src="${escapeAttr(f.thumbUrl)}" alt="Prévia de ${escapeAttr(label)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback-icon="${escapeAttr(typeInfo.icon)}" data-fallback-label="${escapeAttr(typeInfo.label)}" />`
          : `<div class="thumb-placeholder"><span>${escapeHtml(typeInfo.icon)}</span><small>${escapeHtml(typeInfo.label)}</small></div>`
        }
      </div>
      <div class="pdf-card-body">
        <h3 class="pdf-card-title" title="${escapeAttr(f.name)}">${escapeHtml(label)}</h3>
        <div class="pdf-card-meta">
          ${sub}<span class="file-name">${escapeHtml(f.name)}</span>
          ${sizeStr ? `<span class="file-size">${escapeHtml(sizeStr)}</span>` : ''}
        </div>
        <div class="pdf-actions">
          <a href="${escapeAttr(viewUrl)}" class="btn btn-primary btn-sm" target="_blank" rel="noopener">Abrir</a>
          ${downloadUrl
            ? `<a href="${escapeAttr(downloadUrl)}" class="btn btn-secondary btn-sm" target="_blank" rel="noopener">Baixar</a>`
            : ''
          }
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
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
