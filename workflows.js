// Workflow extensions for the local demonstration. Remote persistence is not configured.
function ordersPage() {
  const orders=state.prescriptions.filter(p=>p.quote>0);
  const stages={quote:'Aguardando aprovação',inprogress:'Em produção',ready:'Pronto para retirada',complete:'Entregue'};
  return heading('Pedidos da ótica','Acompanhe a aprovação do cliente, a produção e a entrega.')+tablePanel('Pedidos',`${orders.length} pedidos com orçamento`,['CLIENTE','VOUCHER','VALOR','ETAPA','AÇÃO'],orders.map(p=>`<tr><td>${esc(p.client)}</td><td>${esc(p.code)}</td><td>${money(p.quote)}</td><td>${stages[p.status]||'Aguardando aprovação'}</td><td>${p.status==='complete'?'<span class="status complete">Entregue</span>':`<button class="button small" data-order="${p.id}">${p.status==='inprogress'?'Marcar como pronto':p.status==='ready'?'Confirmar entrega':'Registrar aprovação'}</button>`}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-row">Prepare um orçamento para iniciar um pedido.</td></tr>');
}

function advanceOrder(id) {
  if(role!=='optics'&&role!=='admin')return;
  const order=state.prescriptions.find(p=>p.id===id);
  if(!order||!order.quote||order.status==='complete')return;
  const next=order.status==='inprogress'?'ready':order.status==='ready'?'complete':'inprogress';
  const names={inprogress:'Produção autorizada',ready:'Óculos prontos para retirada',complete:'Entrega confirmada'};
  openModal(names[next],order.client,`<p>Confirme esta etapa do pedido ${esc(order.code)}.</p><form id="modalForm"><div class="field"><label>Observação</label><input name="note" placeholder="Responsável, prazo ou informação sobre a entrega"></div></form>`,'Confirmar',fd=>{
    order.status=next;
    order.history=order.history||[];
    order.history.push({stage:next,note:String(fd.get('note')),at:new Date().toISOString()});
    const client=state.clients.find(c=>c.code===order.code);
    if(client&&next==='complete')client.status='complete';
    state.notifications.unshift({title:names[next],text:order.client,time:'Agora',icon:'✓'});
    save();closeModal();render();notify(names[next]);
  });
}

function deleteClient(id) {
  if(role!=='admin')return;
  const client=state.clients.find(c=>c.id===id);
  if(!client)return;
  openModal('Excluir cadastro',client.name,`<p>Esta ação exclui o cadastro e suas receitas desta demonstração. Digite EXCLUIR para confirmar.</p><form id="modalForm"><div class="field"><label>Confirmação</label><input name="confirmation" required pattern="EXCLUIR" autocomplete="off"></div></form>`,'Excluir',fd=>{
    if(fd.get('confirmation')!=='EXCLUIR')return;
    state.clients=state.clients.filter(c=>c.id!==id);
    state.prescriptions=state.prescriptions.filter(p=>p.code!==client.code);
    save();closeModal();render();notify('Cadastro excluído.');
  });
}

// Add contextual actions to client details, without recreating navigation handlers.
const originalViewClient=viewClient;
viewClient=function(id){
  originalViewClient(id);
  const client=state.clients.find(c=>c.id===id);
  if(!client)return;
  const actions=$('#modal .modal-actions');
  const add=(label,handler)=>{const b=document.createElement('button');b.type='button';b.className='button';b.textContent=label;b.onclick=handler;actions.prepend(b)};
  if(role==='clinic') {
    if(!client.validated)add('Validar atendimento',()=>{validateCode(client.code);closeModal()});
    else add('Enviar receita à ótica',()=>newPrescription(client.id));
  }
  if(role==='admin')add('Excluir cadastro',()=>deleteClient(id));
};

$('#content').addEventListener('click',event=>{
  const button=event.target.closest('[data-order]');
  if(button)advanceOrder(button.dataset.order);
});

// Other tabs in the same browser receive changes made by another profile.


// Clipboard fallback for browsers that block the Clipboard API.
async function copyValue(value) {
  try{await navigator.clipboard.writeText(value);notify('Copiado.');}
  catch{
    openModal('Copiar conteúdo','Selecione e copie o conteúdo abaixo.',`<div class="field"><textarea readonly>${esc(value)}</textarea></div>`,'Fechar');
  }
}
$('#modal').addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.id==='copyCode'){
    event.stopImmediatePropagation();event.preventDefault();
    copyValue($('#modal .voucher-code').textContent);
  }else if(button.textContent==='Copiar link'){
    event.stopImmediatePropagation();event.preventDefault();
    copyValue($('#generatedAccessLink').value);
  }
},true);
