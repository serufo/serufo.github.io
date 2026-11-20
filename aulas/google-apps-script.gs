/**
 * Catálogo dinâmico do Google Drive para https://serufo.github.io/aulas/
 *
 * COMO IMPLANTAR (passo único, ~2 minutos):
 * 1. Acesse https://script.google.com e clique em "Novo projeto".
 * 2. Apague o conteúdo inicial e cole todo este arquivo.
 * 3. Clique em "Implantar" -> "Nova implantação".
 * 4. Em "Selecionar tipo", escolha "App da Web".
 * 5. Em "Executar como", escolha "Eu".
 * 6. Em "Quem pode acessar", escolha "Qualquer pessoa".
 * 7. Clique em "Implantar", autorize o acesso somente leitura ao seu Drive
 *    e copie a URL gerada (https://script.google.com/macros/s/.../exec).
 * 8. Cole essa URL na meta tag <meta name="drive-catalog-url"> em aulas/index.html.
 *
 * IMPORTANTE: A pasta abaixo deve estar compartilhada como
 * "Qualquer pessoa com o link pode visualizar" para que os alunos
 * consigam abrir, baixar e ver as miniaturas dos arquivos.
 */

const FOLDER_ID = '1QPJn-eJP5-Sh8jvajASOQuNzWkamwjaW';
const CACHE_KEY = 'serufo_aulas_catalog_v1';
const CACHE_SECONDS = 300; // 5 minutos

function doGet(e) {
  const forceRefresh = e && e.parameter && e.parameter.refresh === '1';
  const cache = CacheService.getScriptCache();

  if (!forceRefresh) {
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      return jsonResponse(cached);
    }
  }

  try {
    const root = DriveApp.getFolderById(FOLDER_ID);
    const files = [];
    walkFolder(root, '', files);

    files.sort(function (a, b) {
      return a.path.localeCompare(b.path, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

    const payload = JSON.stringify({
      ok: true,
      folderId: FOLDER_ID,
      folderName: root.getName(),
      folderUrl: 'https://drive.google.com/drive/folders/' + FOLDER_ID,
      generatedAt: new Date().toISOString(),
      count: files.length,
      files: files
    });

    try {
      cache.put(CACHE_KEY, payload, CACHE_SECONDS);
    } catch (_) {
      // CacheService limita entradas a ~100 KB; ignora se o catálogo ficar muito grande.
    }

    return jsonResponse(payload);
  } catch (err) {
    return jsonResponse(JSON.stringify({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }));
  }
}

function walkFolder(folder, relPath, out) {
  const fileIter = folder.getFiles();
  while (fileIter.hasNext()) {
    const file = fileIter.next();
    if (file.isTrashed()) continue;

    const id = file.getId();
    const name = file.getName();
    const mimeType = file.getMimeType();
    const segments = relPath ? relPath.split('/') : [];
    const pasta = segments.length > 0 ? segments[0] : 'Geral';
    const subpasta = segments.length > 1 ? segments.slice(1).join('/') : '';

    out.push({
      id: id,
      name: name,
      pasta: pasta,
      subpasta: subpasta,
      path: relPath ? relPath + '/' + name : name,
      mimeType: mimeType,
      size: file.getSize() || 0,
      updatedAt: file.getLastUpdated().toISOString(),
      viewUrl: file.getUrl() || ('https://drive.google.com/file/d/' + id + '/view'),
      downloadUrl: buildDownloadUrl(id, mimeType),
      thumbUrl: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w480'
    });
  }

  const subIter = folder.getFolders();
  while (subIter.hasNext()) {
    const sub = subIter.next();
    if (sub.isTrashed()) continue;
    const subName = sub.getName();
    const nextRel = relPath ? relPath + '/' + subName : subName;
    walkFolder(sub, nextRel, out);
  }
}

function buildDownloadUrl(id, mimeType) {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':
      return 'https://docs.google.com/document/d/' + id + '/export?format=pdf';
    case 'application/vnd.google-apps.presentation':
      return 'https://docs.google.com/presentation/d/' + id + '/export/pdf';
    case 'application/vnd.google-apps.spreadsheet':
      return 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx';
    case 'application/vnd.google-apps.drawing':
      return 'https://docs.google.com/drawings/d/' + id + '/export/pdf';
    case 'application/vnd.google-apps.form':
      return '';
    default:
      return 'https://drive.google.com/uc?export=download&id=' + id;
  }
}

function jsonResponse(jsonString) {
  return ContentService
    .createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}
