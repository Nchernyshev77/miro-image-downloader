const ACCESS_TOKEN = 'TODO_PUT_TOKEN_HERE';

const statusEl = document.getElementById('status');
const btn = document.getElementById('downloadBtn');

btn.addEventListener('click', () => {
  downloadSelectedImages().catch(err => {
    console.error(err);
    setStatus('Ошибка: ' + (err.message || err));
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

  setStatus('Читаю выделение на борде...');

  // 1. Получаем инфо о борде, чтобы знать boardId
  const boardInfo = await miro.board.getInfo(); // { id, name, ... }
  const boardId = boardInfo.id;

  // 2. Получаем выделенные элементы
  const selection = await miro.board.getSelection();
  if (!selection.length) {
    setStatus('Ничего не выделено на борде.');
    return;
  }

  const images = selection.filter(item => item.type === 'image');
  if (!images.length) {
    setStatus('Во выделении нет image-элементов.');
    return;
  }

  setStatus(`Найдено изображений: ${images.length}. Готовлю скачивание...`);

  // 3. Для каждой картинки: REST GET /v2/boards/{boardId}/images/{itemId}
  const downloaded = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    setStatus(`(${i + 1}/${images.length}) Получаю imageUrl...`);

    const imageMeta = await fetch(
      `https://api.miro.com/v2/boards/${boardId}/images/${img.id}`,
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
        },
      },
    );

    if (!imageMeta.ok) {
      console.error('Image meta error', await imageMeta.text());
      continue;
    }

    const metaJson = await imageMeta.json();
    // data.imageUrl – ссылка на ресурс картинки 
    const imageUrl = metaJson?.data?.imageUrl;
    if (!imageUrl) {
      console.warn('Нет imageUrl для', img.id, metaJson);
      continue;
    }

    // 4. По imageUrl получаем одноразовый download URL
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
      console.error('Resource error', await resourceResp.text());
      continue;
    }

    const resourceJson = await resourceResp.json();
    const downloadUrl = resourceJson.url; // реальный URL файла (живёт ~60 секунд) 
    if (!downloadUrl) {
      console.warn('Нет download url для', img.id, resourceJson);
      continue;
    }

    // 5. Качаем файл как blob, чтобы задать своё имя
    setStatus(`(${i + 1}/${images.length}) Скачиваю файл...`);

    const fileResp = await fetch(downloadUrl);
    if (!fileResp.ok) {
      console.error('Download error', await fileResp.text());
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
      (metaJson.title && metaJson.title.trim()) ||
      `miro_image_${i.toString().padStart(3, '0')}.${extFromType}`;

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    downloaded.push(fileName);
  }

  if (downloaded.length) {
    setStatus(`Готово. Скачано файлов: ${downloaded.length}`);
  } else {
    setStatus('Не получилось скачать ни одной картинки :(');
  }
}
