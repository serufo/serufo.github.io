// ===== SPA Router + Catálogo de PDFs (estrutura de pastas) =====

const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('[data-page]');
const menuToggle = document.getElementById('menuToggle');
const navLinksContainer = document.getElementById('navLinks');
const yearEl = document.getElementById('year');

if (yearEl) yearEl.textContent = new Date().getFullYear();

let catalogData = null; // { pastas, labels, arquivos }

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
    loadAndRenderCatalog();
  }
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'home';
  showPage(hash);
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);

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

// ===== Catálogo (estrutura de arquivos) =====

async function loadAndRenderCatalog() {
  if (!catalogData) {
    try {
      const res = await fetch('catalogo.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('catalogo.json não encontrado');
      catalogData = await res.json();
    } catch (err) {
      // Fallback vazio se abrir como file:// ou ainda não gerou
      catalogData = {
        pastas: [
          'algoritmos',
          'sistemas-operacionais',
          'desenvolvimento-de-jogos',
          'intro-jogos-mobile',
          'programacao-mobile',
          'geral'
        ],
        labels: {
          algoritmos: 'Algoritmos e Estruturas de Dados',
          'sistemas-operacionais': 'Sistemas Operacionais',
          'desenvolvimento-de-jogos': 'Desenvolvimento de Jogos',
          'intro-jogos-mobile': 'Introdução Jogos e Mobile',
          'programacao-mobile': 'Programação Mobile',
          geral: 'Geral'
        },
        arquivos: []
      };
      console.warn('Não foi possível carregar catalogo.json. Rode: python gerar-catalogo.py', err);
    }
  }
  renderPdfTree();
}

function renderPdfTree() {
  const tree = document.getElementById('pdfTree');
  const empty = document.getElementById('pdfEmpty');
  const countEl = document.getElementById('pdfCount');
  const searchInput = document.getElementById('pdfSearch');
  const filterSelect = document.getElementById('pdfFilter');

  if (!tree || !catalogData) return;

  const query = (searchInput?.value || '').trim().toLowerCase();
  const filter = filterSelect?.value || 'todos';

  let arquivos = [...(catalogData.arquivos || [])];

  if (filter !== 'todos') {
    arquivos = arquivos.filter(a => a.pasta === filter);
  }

  if (query) {
    arquivos = arquivos.filter(a =>
      (a.titulo && a.titulo.toLowerCase().includes(query)) ||
      (a.nomeArquivo && a.nomeArquivo.toLowerCase().includes(query)) ||
      (a.subpasta && a.subpasta.toLowerCase().includes(query))
    );
  }

  // Ordena por pasta, subpasta, título
  arquivos.sort((a, b) => {
    if (a.pasta !== b.pasta) return a.pasta.localeCompare(b.pasta, 'pt-BR');
    const sa = a.subpasta || '';
    const sb = b.subpasta || '';
    if (sa !== sb) return sa.localeCompare(sb, 'pt-BR');
    return (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR', { sensitivity: 'base' });
  });

  if (countEl) {
    countEl.textContent = arquivos.length === 0
      ? 'Nenhum arquivo'
      : arquivos.length === 1
        ? '1 arquivo'
        : `${arquivos.length} arquivos`;
  }

  if (arquivos.length === 0) {
    tree.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Agrupa por pasta > subpasta
  const groups = {};
  for (const a of arquivos) {
    if (!groups[a.pasta]) groups[a.pasta] = { root: [], subs: {} };
    if (a.subpasta) {
      if (!groups[a.pasta].subs[a.subpasta]) groups[a.pasta].subs[a.subpasta] = [];
      groups[a.pasta].subs[a.subpasta].push(a);
    } else {
      groups[a.pasta].root.push(a);
    }
  }

  const pastasOrder = catalogData.pastas || Object.keys(groups);
  const labels = catalogData.labels || {};

  let html = '';
  for (const pasta of pastasOrder) {
    if (!groups[pasta]) continue;
    const label = labels[pasta] || pasta;
    const { root, subs } = groups[pasta];
    const total = root.length + Object.values(subs).reduce((s, arr) => s + arr.length, 0);

    html += `
      <div class="folder-block">
        <div class="folder-header">
          <span class="folder-icon">📁</span>
          <div>
            <h3 class="folder-name">${escapeHtml(label)}</h3>
            <span class="folder-path">pdfs/${escapeHtml(pasta)}/</span>
          </div>
          <span class="folder-count">${total}</span>
        </div>
        <div class="folder-files">
    `;

    for (const a of root) {
      html += fileRow(a);
    }

    for (const sub of Object.keys(subs).sort((x, y) => x.localeCompare(y, 'pt-BR'))) {
      html += `
        <div class="subfolder">
          <div class="subfolder-header">
            <span class="folder-icon">📂</span>
            <span class="subfolder-name">${escapeHtml(sub)}/</span>
          </div>
          <div class="subfolder-files">
            ${subs[sub].map(fileRow).join('')}
          </div>
        </div>
      `;
    }

    html += `</div></div>`;
  }

  tree.innerHTML = html;
}

function fileRow(a) {
  const dataFmt = a.data
    ? new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR')
    : '';
  return `
    <div class="file-row">
      <span class="file-icon">📄</span>
      <div class="file-info">
        <div class="file-title">${escapeHtml(a.titulo || a.nomeArquivo)}</div>
        <div class="file-meta">
          <span class="file-name">${escapeHtml(a.nomeArquivo)}</span>
          ${dataFmt ? `<span>· ${dataFmt}</span>` : ''}
        </div>
      </div>
      <div class="file-actions">
        <a href="${escapeAttr(a.arquivo)}" class="btn btn-primary btn-sm" target="_blank" rel="noopener" download>Baixar</a>
        <a href="${escapeAttr(a.arquivo)}" class="btn btn-secondary btn-sm" target="_blank" rel="noopener">Abrir</a>
      </div>
    </div>
  `;
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pdfSearch')?.addEventListener('input', () => renderPdfTree());
  document.getElementById('pdfFilter')?.addEventListener('change', () => renderPdfTree());
});
