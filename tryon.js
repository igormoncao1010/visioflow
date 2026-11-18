const tryonRoute = isCustomerTryon;
const tryonToken = new URLSearchParams(location.hash.slice(1)).get('chave');
const tryonRpc = (operation, frame = null) =>
  sbRequest('/rest/v1/rpc/vf_tryon_customer', { operation, link_token: tryonToken, frame }, false);
const catalogRpc = (operation, payload = {}) =>
  sbRequest('/rest/v1/rpc/vf_tryon_manage', { operation, payload });

function editFrame(frame) {
  if (!frame) return;
  openModal('Editar armação', 'Ajuste a referência e a escala do provador.',
    '<form id="modalForm" class="form-grid">' +
    '<label class="field">Referência<input name="sku" required maxlength="60" value="'+esc(frame.sku)+'"></label>' +
    '<label class="field">Modelo<input name="name" required maxlength="120" value="'+esc(frame.name)+'"></label>' +
    '<label class="field">Largura total em mm<input name="width_mm" type="number" min="80" max="200" step="0.1" required value="'+frame.width_mm+'"></label>' +
    '<label class="field">Ponte horizontal (0 a 1)<input name="bridge_x" type="number" min="0" max="1" step=".01" required value="'+frame.bridge_x+'"></label>' +
    '<label class="field">Ponte vertical (0 a 1)<input name="bridge_y" type="number" min="0" max="1" step=".01" required value="'+frame.bridge_y+'"></label></form>',
    'Salvar alterações', async form => {
      const button = $('#modal button[type=submit]');
      button.disabled = true;
      try {
        catalogData = await catalogRpc('edit',{id:frame.id,...Object.fromEntries(form)});
        closeModal();
        if (page==='tryonCatalog') render();
        notify('Armação atualizada.');
      } catch (error) { notify(error.message); }
      finally { button.disabled = false; }
    });
}
let catalogData;
async function loadFrameCatalog() {
  try {
    catalogData = await catalogRpc('list');
    if (page === 'tryonCatalog') render();
  } catch (error) { notify(error.message); }
}
async function startTryon() {
  const gate = $('#authGate');
  $('.app-shell').hidden = true;
  gate.classList.add('tryon-gate');
  gate.hidden = false;
  gate.innerHTML = '<main class="tryon-panel"><p class="eyebrow">VisioFlow</p><h1 id="authTitle">Provador virtual</h1>' +
    '<p id="tryonStatus" role="status">Carregando armações…</p>' +
    '<div id="tryonControls" hidden><label class="field">Armação<select id="tryonFrame"></select></label>' +
    '<div class="tryon-stage"><video hidden id="tryonVideo" playsinline muted></video>' +
    '<div id="faceGuide" hidden aria-hidden="true"></div><canvas hidden id="tryonCanvas"></canvas></div>' +
    '<div class="tryon-actions"><button class="button" id="tryonCamera">Abrir câmera</button>' +
    '<button hidden class="button" id="tryonCapture">Tirar foto</button>' +
    '<label class="button tryon-file">Usar foto frontal<input type="file" id="tryonPhoto" accept="image/*"></label></div>' +
    '<label class="field">Distância pupilar em mm (opcional, se já medida)<input id="tryonPd" type="number" min="45" max="80" step="0.1" placeholder="Ex.: 62"></label>' +
    '<p>A foto fica neste dispositivo. A prévia frontal estima o encaixe.</p>' +
    '<button class="button primary" id="tryonRequest" disabled>Quero esta armação</button></div></main>';
  const status = $('#tryonStatus');
  const report = message => { status.textContent = message; };
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(tryonToken || '')) {
    report('Abra o link do provador enviado pela ótica.');
    return;
  }

  let frames;
  try { frames = await tryonRpc('catalog'); }
  catch (error) { report(error.message); return; }
  if (!frames.length) { report('A ótica ainda não publicou armações para experimentar.'); return; }

  const select = $('#tryonFrame'), video = $('#tryonVideo'), canvas = $('#tryonCanvas');
  const guide = $('#faceGuide'), capture = $('#tryonCapture'), camera = $('#tryonCamera');
  const request = $('#tryonRequest'), pd = $('#tryonPd'), photoInput = $('#tryonPhoto');
  const photo = document.createElement('canvas'), images = new Map();
  let stream, detector, points, selected, drawing = 0, photographing = false, submitting = false, submittedFrame;
  select.innerHTML = frames.map(frame => '<option value="' + esc(frame.id) + '">' + esc(frame.name + ' · ' + frame.sku) + '</option>').join('');
  $('#tryonControls').hidden = false;
  report('Enquadre o rosto de frente, retire os óculos e alinhe os olhos à linha do molde.');

  function stopCamera() {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    guide.hidden = true;
    capture.hidden = true;
    camera.textContent = 'Abrir câmera';
  }
  window.addEventListener('pagehide', stopCamera);

  async function faceDetector() {
    if (!detector) {
      const cdn = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
      const {FaceLandmarker,FilesetResolver} = await import(cdn + '/+esm');
      detector = await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(cdn + '/wasm'), {
        baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'},
        runningMode:'IMAGE',numFaces:2
      });
    }
    return detector;
  }

  async function drawPreview() {
    if (!points) return;
    const sequence = ++drawing;
    const frame = frames.find(item => item.id === select.value);
    selected = null;
    request.disabled = true;
    canvas.hidden = true;
    try {
      if (!images.has(frame.id)) {
        const image = new Image();
        image.src = await tryonRpc('image',frame.id);
        await image.decode();
        images.set(frame.id,image);
      }
      if (sequence !== drawing) return;
      const image = images.get(frame.id);
      const left = points[468], right = points[473], bridge = points[168];
      const dx = (right.x-left.x)*photo.width, dy = (right.y-left.y)*photo.height;
      const pupilMm = pd.valueAsNumber || 63;
      if (pupilMm < 45 || pupilMm > 80) throw new Error('Informe uma distância pupilar entre 45 e 80 mm ou deixe em branco.');
      const width = Math.hypot(dx,dy) * frame.width_mm / pupilMm;
      const height = width * image.naturalHeight / image.naturalWidth;
      canvas.width = photo.width;
      canvas.height = photo.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(photo,0,0);
      ctx.translate(bridge.x*photo.width,bridge.y*photo.height);
      ctx.rotate(Math.atan(dy/dx));
      ctx.drawImage(image,-width*frame.bridge_x,-height*frame.bridge_y,width,height);
      canvas.hidden = false;
      selected = frame;
      request.disabled = submitting || submittedFrame === frame.id;
      report('Armação: ' + frame.name + (pd.value ? '.' : ' · Escala aproximada.'));
    } catch(error) { if (sequence === drawing) report(error.message); }
  }

  async function processPhoto(source, width, height) {
    if (photographing) return;
    photographing = true;
    capture.disabled = true;
    camera.disabled = true;
    photoInput.disabled = true;
    points = null;
    selected = null;
    drawing++;
    request.disabled = true;
    canvas.hidden = true;
    report('Localizando olhos e nariz…');
    try {
      const scale = Math.min(1,960/Math.max(width,height));
      photo.width = Math.max(1,Math.round(width*scale));
      photo.height = Math.max(1,Math.round(height*scale));
      photo.getContext('2d').drawImage(source,0,0,photo.width,photo.height);
      const model = await faceDetector();
      const [face,extra] = model.detect(photo).faceLandmarks;
      if (!face?.[473] || extra) throw new Error('Tire outra foto com apenas um rosto bem iluminado.');
      const [a,b,nose] = [face[468],face[473],face[1]];
      const span = Math.hypot(b.x-a.x,(b.y-a.y)*photo.height/photo.width);
      const offset = Math.abs(nose.x-(a.x+b.x)/2);
      if (span < .10 || offset > span*.26 || Math.abs(b.y-a.y)*photo.height > span*photo.width*.22)
        throw new Error('Aproxime o rosto e olhe de frente, com os olhos na linha do molde.');
      points = face;
      stopCamera();
      camera.textContent = 'Tirar outra foto';
      await drawPreview();
    } catch(error) { report(error.message || 'Não foi possível analisar a foto.'); }
    finally { photographing = false; capture.disabled = false; camera.disabled = false; photoInput.disabled = false; }
  }

  camera.onclick = async () => {
    if (stream) return;
    camera.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      guide.hidden = false;
      drawing++;
      points = null;
      selected = null;
      canvas.hidden = true;
      request.disabled = true;
      capture.hidden = false;
      report('Centralize o rosto e alinhe os olhos ao molde.');
    } catch {
      stopCamera();
      report('Não foi possível abrir a câmera. Permita o acesso ou use uma foto frontal.');
    } finally { camera.disabled = false; }
  };
  capture.onclick = () => {
    if (video.videoWidth) processPhoto(video,video.videoWidth,video.videoHeight);
  };
  photoInput.onchange = async () => {
    const file = photoInput.files[0];
    photoInput.value = '';
    if (!file) return;
    try {
      if (file.size > 20000000) throw new Error('Use uma foto de até 20 MB.');
      const image = await createImageBitmap(file);
      try { await processPhoto(image,image.width,image.height); }
      finally { image.close(); }
    } catch(error) { report(error.message); }
  };
  select.onchange = pd.onchange = () => { if (!stream) drawPreview(); };
  request.onclick = async () => {
    if (!selected || submitting) return;
    const frame = selected;
    submitting = true;
    request.disabled = true;
    try {
      const result = await tryonRpc('request',frame.id);
      submittedFrame = frame.id;
      report('Pedido enviado à ótica: ' + result.name + ' (' + result.sku + ').');
    } catch(error) { report(error.message); }
    finally { submitting = false; request.disabled = !selected || submittedFrame === selected.id; }
  };
}
if (tryonRoute) startTryon();

function catalogPage() {
  const customers = state.clients.map(client =>
    '<option value="' + esc(client.id) + '">' + esc(client.name + ' · ' + client.code) + '</option>').join('');
  const frames = (catalogData?.frames || []).map(frame =>
    '<tr><td>' + esc(frame.sku) + '</td><td>' + esc(frame.name) + '</td><td>' + esc(frame.width_mm) +
    ' mm</td><td><button class="button" data-frame-id="' + esc(frame.id) + '" data-frame-active="' +
    !frame.active + '">' + (frame.active ? 'Desativar' : 'Ativar') + '</button> <button class="button" data-edit-frame="' +
    esc(frame.id) + '">Editar</button></td></tr>').join('');
  const requests = (catalogData?.requests || []).map(request =>
    '<tr><td>' + esc(request.client + ' · ' + request.code) + '</td><td>' +
    esc(request.sku + ' · ' + request.name) + '</td><td>' + esc(request.date) + '</td></tr>').join('');
  return heading('Catálogo do provador', 'Cadastre armações reais e veja os pedidos dos clientes.',
    '<button class="button" id="refreshFrames">Atualizar</button><button class="button primary" id="newFrame">Cadastrar armação</button>') +
    '<section class="panel"><form id="tryonLink" class="field"><label for="tryonClient">Link do cliente</label>' +
    '<select id="tryonClient" name="client" required><option value="">Selecione um cliente</option>' + customers +
    '</select><button class="button" ' + (customers ? '' : 'disabled') + '>Gerar link do provador</button></form>' +
    '<p class="content-footer-note">A ótica pode gerar o link depois de receber a receita. A instituição e a clínica também podem copiá-lo nos detalhes do cliente.</p></section>' +
    tablePanel('Armações', 'Catálogo da sua ótica', ['REFERÊNCIA','MODELO','LARGURA','DISPONIBILIDADE'],
      frames || '<tr><td colspan="4">Nenhuma armação cadastrada.</td></tr>') +
    tablePanel('Pedidos do provador', 'Use a referência ao preparar o orçamento em Receitas.',
      ['CLIENTE','ARMAÇÃO','DATA'], requests || '<tr><td colspan="3">Nenhum pedido recebido.</td></tr>');
}

async function createTryonUrl(id, quoteId) {
  const payload = {id};
  if (quoteId) payload.quote_id = quoteId;
  const token = await catalogRpc('link', payload);
  const link = new URL('/', location.origin);
  link.searchParams.set('provador', '1');
  link.hash = new URLSearchParams({chave:token}).toString();
  return link.href;
}

async function showTryonLink(id) {
  try {
    const link = await createTryonUrl(id);
    openModal('Link do provador','Compartilhe com este cliente. O link é válido por 14 dias a partir da emissão.',
      '<div class="field"><label for="customerTryonUrl">Endereço</label><input readonly id="customerTryonUrl" value="' +
      esc(link) + '"><button class="button" id="copyTryonUrl">Copiar link</button></div>', 'Fechar');
    $('#copyTryonUrl').onclick = () => copyValue(link);
  } catch (error) { notify(error.message); }
}

function frameForm() {
  const suppliedImages = {
    'gatinho - feminina.png':'Gatinho feminino',
    'oversized - feminina.png':'Oversized feminino',
    'tartaruga ambar - feminina.png':'Tartaruga âmbar feminino',
    'wayfarer - masculina.png':'Wayfarer masculino'
  };
  openModal('Cadastrar armação', 'Use uma foto frontal recortada na largura total da armação, com fundo transparente.',
    '<form id="modalForm" class="form-grid"><label class="field">Modelo e cor<input name="name" maxlength="120" required></label>' +
    '<label class="field">Referência (SKU)<input name="sku" maxlength="60" required></label>' +
    '<label class="field">Largura total em mm<input name="width_mm" type="number" min="80" max="200" step="0.1" required></label>' +
    '<label class="field">Imagem PNG ou WebP<input id="frameFile" type="file" accept="image/png,image/webp"></label>' +
    '<label class="field full">Ou use uma imagem fornecida<select id="framePreset"><option value="">Selecione uma imagem</option>' +
    Object.entries(suppliedImages).map(([file,label])=>'<option value="'+esc(file)+'">'+esc(label)+'</option>').join('')+'</select></label>' +
    '<div class="field full"><label for="framePreview">Clique no centro da ponte, onde a armação apoia no nariz</label>' +
    '<canvas hidden id="framePreview" class="frame-preview"></canvas><span role="status" id="frameFeedback"></span></div></form>',
    'Salvar no catálogo', async form => {
      if (!image || !bridge) { $('#frameFeedback').textContent = 'Escolha uma imagem e marque a ponte.'; return; }
      const button = $('#modal button[type=submit]');
      button.disabled = true;
      try {
        catalogData = await catalogRpc('save', {...Object.fromEntries(form), image, bridge_x:bridge.x, bridge_y:bridge.y});
        closeModal();
        if (page === 'tryonCatalog') render();
        notify('Armação cadastrada.');
      } catch (error) { notify(error.message); }
      finally { button.disabled = false; }
    });
  const preview = $('#framePreview');
  const fileInput = $('#frameFile');
  let image = null, bridge = null, loadSequence = 0;
  const draw = async (file, sequence) => {
    const bitmap = await createImageBitmap(file);
    if (sequence !== loadSequence || !preview.isConnected) { bitmap.close(); return; }
    const scale = Math.min(1, 720 / Math.max(bitmap.width,bitmap.height));
    preview.width = Math.max(1,Math.round(bitmap.width*scale));
    preview.height = Math.max(1,Math.round(bitmap.height*scale));
    preview.getContext('2d').drawImage(bitmap,0,0,preview.width,preview.height);
    bitmap.close();
    const encoded = preview.toDataURL('image/webp',0.86);
    if (encoded.length>350000) throw new Error('Imagem grande demais. Reduza o arquivo.');
    return encoded;
  };
  async function loadImage(getFile) {
    const sequence = ++loadSequence;
    image = null;
    bridge = null;
    preview.hidden = true;
    try {
      const file = await getFile();
      if (!file || sequence !== loadSequence) return;
      if (file.size > 10000000 || !['image/png','image/webp'].includes(file.type)) throw new Error('Escolha um PNG ou WebP de até 10 MB.');
      const encoded = await draw(file,sequence);
      if (!encoded || sequence !== loadSequence) return;
      image = encoded;
      preview.hidden = false;
      $('#frameFeedback').textContent = 'Marque a ponte na imagem.';
    } catch (error) { if (sequence === loadSequence && fileInput.isConnected) $('#frameFeedback').textContent = error.message; }
  }
  const preset = $('#framePreset');
  fileInput.onchange = () => {
    preset.value = '';
    loadImage(() => fileInput.files[0]);
  };
  preset.onchange = () => {
    fileInput.value = '';
    const file = preset.value;
    const name = $('#modalForm [name=name]');
    if (file && !name.value) name.value = suppliedImages[file];
    loadImage(async () => {
      if (!file) return;
      const response = await fetch('/provador/'+encodeURIComponent(file));
      if (!response.ok) throw new Error('Não foi possível abrir a imagem fornecida.');
      return response.blob();
    });
  };
  preview.onclick = event => {
    if (!image) return;
    const bounds = preview.getBoundingClientRect();
    bridge = {x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height};
    $('#frameFeedback').textContent = 'Ponte marcada em ' + Math.round(bridge.x*100) + '% × ' + Math.round(bridge.y*100) + '%.';
  };
}

if (!tryonRoute) {
  menu.optics.push(['tryonCatalog','◎']);
  labels.tryonCatalog = 'Catálogo do provador';
  const renderDashboard = render;
  render = function () {
    if (page !== 'tryonCatalog' || role !== 'optics') {
      renderDashboard();
      if (role === 'optics' && page === 'quotes') {
        document.querySelectorAll('#content [data-prescription]').forEach(details => {
          const share = document.createElement('button');
          share.type = 'button';
          share.className = 'button small';
          share.textContent = 'Enviar orçamento e provador';
          share.onclick = () => showQuoteMessage(details.dataset.prescription);
          details.after(share);
        });
      }
      return;
    }
    $('#content').innerHTML = catalogPage();
    $('#refreshFrames').onclick = loadFrameCatalog;
    $('#newFrame').onclick = frameForm;
    document.querySelectorAll('[data-edit-frame]').forEach(button => {
      button.onclick = () => editFrame(catalogData.frames.find(frame => frame.id === button.dataset.editFrame));
    });
    $('#tryonLink').onsubmit = event => {
      event.preventDefault();
      showTryonLink(new FormData(event.currentTarget).get('client'));
    };
    document.querySelectorAll('[data-frame-id]').forEach(button => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          catalogData = await catalogRpc('toggle', {id:button.dataset.frameId,active:button.dataset.frameActive==='true'});
          if (page === 'tryonCatalog') render();
        } catch (error) { notify(error.message); button.disabled = false; }
      };
    });
  };
  const dashboardGo = go;
  go = function (destination) {
    dashboardGo(destination);
    if (destination === 'tryonCatalog' && role === 'optics') loadFrameCatalog();
  };
  const dashboardClient = viewClient;
  viewClient = function(id) {
    dashboardClient(id);
    if (!['optics','clinic','institution'].includes(role) || !state.clients.some(client => client.id===id)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button';
    button.textContent = 'Link do provador';
    button.onclick = () => showTryonLink(id);
    $('#modal .modal-actions').prepend(button);
  };
}
