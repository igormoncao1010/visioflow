// All persistence goes through authenticated, scoped database functions.
const sbConfig=window.VISIOFLOW_SUPABASE;
let sbSession=null, sbProfile=null, sbBusy=false;
try{sbSession=JSON.parse(sessionStorage.getItem('vf-auth')||'null')}catch{}
async function sbRequest(path,body,authenticated=true){
  if(authenticated&&!sbSession)throw new Error('Faça login novamente.');
  if(authenticated&&sbSession.expires_at<Date.now()/1000+60){
    const refreshed=await sbRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:sbSession.refresh_token},false);
    keepSession(refreshed);
  }
  const response=await fetch(sbConfig.url+path,{method:'POST',headers:{apikey:sbConfig.anonKey,Authorization:`Bearer ${authenticated?sbSession.access_token:sbConfig.anonKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.message||result.error_description||result.msg||'Falha ao acessar o Supabase.');
  return result;
}
function keepSession(session){sbSession={...session,expires_at:Date.now()/1000+session.expires_in};sessionStorage.setItem('vf-auth',JSON.stringify(sbSession))}
function applySnapshot(snapshot){
  sbProfile=snapshot.profile;
  state={clients:snapshot.clients,prescriptions:snapshot.prescriptions,notifications:snapshot.notifications,payments:snapshot.payments};
  role=sbProfile.role;
  roles[role].name=sbProfile.name;
  renderNav();render();updateNotificationBadge();
  $('#profileName').textContent=sbProfile.name;$('#topUserName').textContent=sbProfile.name;
  $('#workspaceName').textContent=sbProfile.name;
  $('.app-shell').hidden=false;
  $('#profileRole').textContent=roles[role].type;$('.top-user small').textContent=roles[role].type;
  $('.live-pill').textContent='Supabase conectado';
}
async function reloadDatabase(){applySnapshot(await sbRequest('/rest/v1/rpc/vf_snapshot',{}))}
async function command(action,payload={}){
  if(sbBusy)throw new Error('Aguarde a operação anterior.');
  sbBusy=true;
  const buttons=[...document.querySelectorAll('#modal button[type=submit]')];buttons.forEach(b=>b.disabled=true);
  try{const result=await sbRequest('/rest/v1/rpc/vf_command',{action,payload});applySnapshot(result);return result;}
  finally{sbBusy=false;buttons.forEach(b=>b.disabled=false)}
}
const localAuthRenderer=renderAuth;
renderAuth=function(target){
  $('.app-shell').hidden=true;
  localAuthRenderer(target);
  $('.auth-hint').textContent='Entre com sua conta cadastrada no Supabase.';
  $('.auth-story-foot').textContent='VisioFlow · Acesso à sua rede';
  $('#authEmail').value='';
  $('#authLoginForm').onsubmit=async event=>{
    event.preventDefault();const fd=new FormData(event.currentTarget),button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
    try{
      keepSession(await sbRequest('/auth/v1/token?grant_type=password',{email:String(fd.get('email')).trim(),password:String(fd.get('password'))},false));
      const snapshot=await sbRequest('/rest/v1/rpc/vf_snapshot',{});
      if(snapshot.profile.role!==(target||fd.get('role')))throw new Error('Esta conta pertence a outro painel.');
      page='overview';applySnapshot(snapshot);$('#authGate').hidden=true;
    }catch(error){sbSession=null;sessionStorage.removeItem('vf-auth');$('#authError').textContent=error.message;$('#authError').hidden=false;}
    finally{button.disabled=false}
  };
};
// Keep the existing form layout, replacing local callbacks with awaited server commands.
function remoteForm(original,operation,payloadFor){return function(...args){
  const originalModal=openModal;
  openModal=function(title,subtitle,body,label,callback){
    return originalModal(title,subtitle,body,label,callback?async fd=>{
      try{
        const payload=payloadFor(fd,args);
        if(!payload)return;
        await command(operation,payload);closeModal();notify('Salvo no Supabase.');
        if(operation==='create'){const client=state.clients.find(c=>c.name===payload.name&&c.phone===payload.phone);if(client)showVoucher(client)}
        if(operation==='quote')await showQuoteMessage(payload.id);
      }catch(error){notify(error.message)}
    }:callback);
  };
  try{return original(...args)}finally{openModal=originalModal}
}}
newClient=remoteForm(newClient,'create',fd=>({...Object.fromEntries(fd),phone:String(fd.get('phone')).replace(/\D/g,'')}));
newPrescription=remoteForm(newPrescription,'prescription',fd=>Object.fromEntries(fd));
newQuote=remoteForm(newQuote,'quote',(fd,args)=>({...Object.fromEntries(fd),id:(state.prescriptions.find(p=>p.id===args[0])||state.prescriptions.find(p=>!p.quote)||state.prescriptions[0]).id}));
advanceOrder=remoteForm(advanceOrder,'order',(fd,args)=>({id:args[0],expected:state.prescriptions.find(p=>p.id===args[0]).status}));
deleteClient=remoteForm(deleteClient,'delete',(fd,args)=>fd.get('confirmation')==='EXCLUIR'?{id:args[0]}:null);
validateCode=async function(code){try{await command('validate',{code});notify('Voucher validado no Supabase.')}catch(error){notify(error.message)}};
const localAction=action;
action=function(name){if(name==='mark-read'){command('read').then(()=>notify('Notificações atualizadas.')).catch(e=>notify(e.message));return}localAction(name)};
save=function(){throw new Error('Gravação local desativada. Use as operações do Supabase.')};
$('#content').addEventListener('click',event=>{
  const button=event.target.closest('[data-payment]');
  if(!button)return;
  const payment=state.payments[Number(button.dataset.payment)];
  if(payment.status==='paid')return;
  event.preventDefault();event.stopImmediatePropagation();
  command('pay',{id:payment.id}).then(()=>notify('Repasse registrado no banco.')).catch(e=>notify(e.message));
},true);
async function showQuoteMessage(id){
  const rx = state.prescriptions.find(item => item.id === id);
  const client = rx && state.clients.find(item => item.code === rx.code);
  const phone = client?.phone?.replace(/\D/g,'');
  if (!phone || !rx.quote) {
    notify('Confira o telefone do cliente e o valor do orçamento.');
    return;
  }

  openModal('Enviar orçamento', 'Gerando o link do provador…', '', 'Fechar');
  const modalTitle = $('#modalTitle');
  const stillOpen = () => !$('#modalBackdrop').hidden && $('#modalTitle') === modalTitle;
  try {
    const link = await createTryonUrl(client.id);
    if (!stillOpen()) return;
    const message = [
      `Olá, ${client.name}! Segue o seu orçamento.`,
      `Valor: ${money(rx.quote)}`,
      `Lente: ${rx.eye}`,
      rx.delivery && `Prazo: ${rx.delivery}`,
      rx.payment && `Pagamento: ${rx.payment}`,
      rx.quoteNotes,
      '',
      'Experimente as armações pelo celular e toque em “Quero esta armação” para enviar sua escolha à ótica:',
      link
    ].filter(line => line !== null && line !== undefined && line !== false).join('\n');
    const whatsapp = `https://wa.me/${phone.length<=11?'55':''}${phone}?text=${encodeURIComponent(message)}`;
    openModal('Enviar orçamento e provador', 'Revise a mensagem e confirme o envio no WhatsApp.',
      `<pre class="quote-message-preview">${esc(message.replace(link,'[link individual do provador]'))}</pre><a class="button primary" target="_blank" rel="noopener" href="${esc(whatsapp)}">Abrir WhatsApp</a>`, 'Fechar');
  } catch (error) {
    if (!stillOpen()) return;
    openModal('Orçamento salvo', 'O link do provador ainda não foi gerado.',
      `<p role="alert">${esc(error.message)}</p><button class="button primary" id="retryQuoteShare">Tentar novamente</button>`, 'Fechar');
    $('#retryQuoteShare').onclick = () => showQuoteMessage(id);
  }
}
$('#logoutButton').onclick=async()=>{try{await sbRequest('/auth/v1/logout',{})}catch{}sbSession=null;sessionStorage.removeItem('vf-auth');state={clients:[],prescriptions:[],notifications:[],payments:[]};location.assign('/')};
$('.live-pill').textContent='Supabase';
async function startSupabase(){
  state={clients:[],prescriptions:[],notifications:[],payments:[]};
  const slug=location.pathname.split('/')[2],target=demoAccounts.find(a=>a.slug===slug)?.role||null;
  renderAuth(target);
  if(sbSession){try{await reloadDatabase();if(target&&target!==sbProfile.role)throw new Error('Entre com a conta deste painel.');$('#authGate').hidden=true}catch(error){$('#authError').textContent=error.message;$('#authError').hidden=false;sbSession=null;sessionStorage.removeItem('vf-auth')}}
}
const isCustomerTryon = location.pathname.replace(/\/$/, '') === '/experimentar';
if (!isCustomerTryon) startSupabase();
// Poll only while signed in and visible; notifications arrive across devices.
if (!isCustomerTryon) setInterval(()=>{if(sbSession&&!sbBusy&&!document.hidden&&page!=='tryonCatalog')reloadDatabase().catch(e=>{ $('.live-pill').textContent='Falha na sincronização'; });},15000);

usersPage=function(){return heading('Links dos painéis','O papel de cada usuário é definido no banco pelo administrador.')+`<div class="access-grid">${demoAccounts.map(a=>`<section class="access-card"><h3>${esc(a.label)}</h3><p>Entre com a conta cadastrada no Supabase Auth.</p><input readonly value="${esc(location.origin+'/acesso/'+a.slug)}" aria-label="Link de ${esc(a.label)}"><button class="button" data-portal-url="${esc(location.origin+'/acesso/'+a.slug)}">Copiar link</button></section>`).join('')}</div>`};
$('#content').addEventListener('click',event=>{const button=event.target.closest('[data-portal-url]');if(button)copyValue(button.dataset.portalUrl)});
accessPage=function(){const origins=[...new Set(state.clients.map(c=>c.origin))];return heading('Rede de atendimento','Organizações com clientes visíveis para sua conta.')+tablePanel('Instituições',`${origins.length} instituições`,['NOME','CLIENTES'],origins.map(name=>`<tr><td>${esc(name)}</td><td>${state.clients.filter(c=>c.origin===name).length}</td></tr>`).join('')||'<tr><td colspan="2">Nenhuma indicação cadastrada.</td></tr>')};
reportsPage=function(){return heading('Relatórios','Dados consultados no Supabase.','<button class="button" data-action="export">Exportar CSV</button>')+tablePanel('Clientes',`${state.clients.length} registros`,['CLIENTE','DATA','ORIGEM','STATUS',''],clientRows(state.clients))+chartPanel()};
chartPanel=function(){const year=new Date().getFullYear();const values=Array.from({length:12},(_,month)=>state.clients.filter(c=>new Date(c.created+'T12:00:00').getFullYear()===year&&new Date(c.created+'T12:00:00').getMonth()===month).length);const max=Math.max(1,...values);return `<section class="panel chart-panel"><div class="panel-title">Indicações em ${year}</div><div class="chart">${values.map((count,i)=>`<div class="chart-col"><span class="bar dark" title="${count} indicações" style="height:${count/max*90}%"></span><span class="chart-month">${i+1}: ${count}</span></div>`).join('')}</div></section>`};
const liveRender=render;
render=function(){liveRender();document.querySelectorAll('.metric-foot,.finance-tile span').forEach(el=>el.textContent='Dados do período cadastrado');};
