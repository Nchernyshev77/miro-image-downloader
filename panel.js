const ACCESS_TOKEN = 'gggg';

const statusEl = document.getElementById('status');
const btn = document.getElementById('downloadBtn');

btn.addEventListener('click', () => {
  downloadSelectedImages().catch(err => {
    console.error(err);
    setStatus('Неожиданная ошибка: ' + (err.message || err));
  });
});

function setStatus(text) {
  console.log('[ImageDownloader]', text);
  statusEl.textContent = text;
}

async function downloadSelectedImages() {
  if (!ACCESS_TOKEN || ACCESS_TOKEN.startsWith('ПОДСТАВЬ')) {
    setStatus('Сначала вставь ACCESS_TOKEN в panel.js');
    return;
  }

  // 1. boardId
  const boardInfo = await miro.board.getInfo();
  const boardId = boardInfo.id;
  setStatus('Борд: ' + boardId + '\nЧитаю выделение...');

  // 2. выделение
  const selection = await miro.board.getSelection();
  console.log('Selection:', selection);

  if (!selection.length) {
    setStatus('Ничего не выделено на борде.');
    return;
  }

  const images = selection.filter(item => item.type === 'image');
  console.log('Images in selection:', images);

  if (!images.length) {
    setStatus('Во выделении нет image-элементов.');
    return;
  }

  setStatus(`Найдено изображений: ${images.length}. Запрашиваю данные через REST API...`);

  const downloaded = [];
  const errors = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const prefix = `(${i + 1}/${images.length}) [${img.id}]`;

    try {
      setStatus(`${prefix} Получаю item через /items/{id}...`);

      // 3. Получаем item целиком: /v2/boards/{boardId}/items/{itemId}
      const metaResp = await fetch(
        `https://api.miro.com/v2/boards/${boardId}/items/${img.id}`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
          },
        },
      );

      if (!metaResp.ok) {
        const txt = await metaResp.text();
        console.error('Item meta error', metaResp.status, txt);
        errors.push(`${prefix} Ошибка meta ${metaResp.status}`);
        continue;
      }

      const metaJson = await metaResp.json();
      console.log('Item meta:', metaJson);

      const imageUrl = metaJson?.data?.imageUrl;
      if (!imageUrl) {
        console.warn('Нет data.imageUrl для', img.id, metaJson);
        errors.push(`${prefix} Нет imageUrl в data`);
        continue;
      }

      // 4. Получаем одноразовый download URL (format=original, redirect=false)
      setStatus(`${prefix} Получаю download URL...`);

      const urlObj = new URL(imageUrl);
      urlObj.searchParams.set('format', 'original');
      urlObj.searchParams.set('redirect', 'false');

      const resourceResp = await fetch(urlObj.toString(), {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
        },
      });

      if (!resourceResp.ok) {
        const txt = await resourceResp.text();
        console.error('Resource error', resourceResp.status, txt);
        errors.push(`${prefix} Ошибка resource ${resourceResp.status}`);
        continue;
      }

      const resourceJson = await resourceResp.json();
      console.log('Resource json:', resourceJson);

      const downloadUrl = resourceJson.url;
      if (!downloadUrl) {
        console.warn('Нет поля url в resourceJson', resourceJson);
        errors.push(`${prefix} В ответе resource нет url`);
        continue;
      }

      // 5. Скачиваем сам файл
      setStatus(`${prefix} Скачиваю файл...`);

      const fileResp = await fetch(downloadUrl);
      if (!fileResp.ok) {
        const txt = await fileResp.text();
        console.error('Download error', fileResp.status, txt);
        errors.push(`${prefix} Ошибка download ${fileResp.status}`);
        continue;
      }

      const blob = await fileResp.blob();
      const blobUrl = URL.createObjectURL(blob);

      const extFromType = (() => {
        const ct = fileResp.headers.get('Content-Type') || '';
        if (ct.includes('jpeg')) return 'jpg';
        if (ct.includes('png')) return 'png';
        if (ct.includes('gif')) return 'gif';
        if (ct.includes('svg')) return 'svg';
        if (ct.includes('webp')) return 'webp';
        return 'bin';
      })();

      const fileName =
        (metaJson.title && metaJson.title.trim())
        || `miro_image_${i.toString().padStart(3, '0')}.${extFromType}`;

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      downloaded.push(fileName);
    } catch (e) {
      console.error('Unexpected error for image', img.id, e);
      errors.push(`${prefix} Неожиданная ошибка`);
    }
  }

  if (downloaded.length) {
    let msg = `Готово. Скачано файлов: ${downloaded.length}.`;
    if (errors.length) {
      msg += '\nНо были ошибки:\n' + errors.join('\n');
    }
    setStatus(msg);
  } else {
    let msg = 'Не получилось скачать ни одной картинки :(';
    if (errors.length) {
      msg += '\nПодробности:\n' + errors.join('\n');
    }
    setStatus(msg);
  }
}

