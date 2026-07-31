lucide.createIcons();

// ===== STATE =====
let allData = [];
const PILLARS = ['Utilização','Limpeza','Padronização','Disciplina'];
const PILLAR_COLORS = ['#eab308','#06b6d4','#f43f5e','#10b981'];
let auditResponses = {};
let currentAuditData = null;
let lastSavedAudit = null;

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function getDepts(){return allData.filter(r=>r.type==='department'&&r.status!=='inactive').sort((a,b)=>(a.name||'').localeCompare(b.name||''))}
function getAllDepts(){return allData.filter(r=>r.type==='department').sort((a,b)=>(a.name||'').localeCompare(b.name||''))}
function getCriteria(){return allData.filter(r=>r.type==='criterion'&&r.status!=='inactive')}
function getAllCriteria(){return allData.filter(r=>r.type==='criterion')}
function getAudits(){return allData.filter(r=>r.type==='audit')}
function getConfig(key,def){const c=allData.find(r=>r.type==='config'&&r.config_key===key);return c?c.config_value:def}

function classify(val){
  const otimo=parseFloat(getConfig('otimo','95'));
  const bom=parseFloat(getConfig('bom','80'));
  const regular=parseFloat(getConfig('regular','60'));
  if(val>=otimo)return{text:'ÓTIMO',color:'#16a34a',emoji:'😀'};
  if(val>=bom)return{text:'BOM',color:'#2563eb',emoji:'🙂'};
  if(val>=regular)return{text:'REGULAR',color:'#eab308',emoji:'😐'};
  return{text:'RUIM',color:'#ef4444',emoji:'☹️'};
}

// ===== DATA SDK (agora via API Flask, ver static/data-sdk-shim.js) =====
const handler={onDataChanged(data){
  allData=data;
  refreshAll();
}};
(async()=>{
  await window.dataSdk.init(handler);
})();

// Lista de critérios padrão. Não roda automaticamente — só quando o
// usuário clica em "Carregar Padrão" na aba Critérios, para nunca
// duplicar dados sem querer.
const DEFAULT_CRITERIA = [
  {checklist:'Escritório',senso:'Utilização',item_number:'1.1',question:'Os arquivos, armários, escaninhos, pastas e prateleiras estão organizados?',criterion:'Armários/Lockers sinalizados e sem itens em cima'},
  {checklist:'Escritório',senso:'Utilização',item_number:'1.2',question:'Existe algum material sem uso ou desnecessário no setor?',criterion:'Sem excesso de canetas, papéis, post-its'},
  {checklist:'Escritório',senso:'Utilização',item_number:'1.3',question:'Os objetos de uso pessoal são guardados em local adequado?',criterion:'Sem chaves, capacetes, óculos sobre a mesa'},
  {checklist:'Escritório',senso:'Utilização',item_number:'1.4',question:'Existe organização dos itens sobre as mesas e bancadas?',criterion:'Sem maquiagem/cremes sobre mesa; cabos organizados'},
  {checklist:'Escritório',senso:'Utilização',item_number:'1.5',question:'A pontuação da verificação está visível e atualizada?',criterion:'Quadro de auditoria atualizado'},
  {checklist:'Escritório',senso:'Utilização',item_number:'1.6',question:'As pastas digitais estão organizadas?',criterion:'Pastas pessoais e área de trabalho organizadas'},
  {checklist:'Escritório',senso:'Utilização',item_number:'1.7',question:'Organização digital',criterion:'OneDrive e SharePoint organizados'},
  {checklist:'Escritório',senso:'Utilização',item_number:'1.8',question:'Pasta do setor',criterion:'Pasta do setor organizada'},
  {checklist:'Escritório',senso:'Limpeza',item_number:'2.1',question:'O ambiente de trabalho está limpo?',criterion:'Mesa de trabalho limpa; Piso limpo'},
  {checklist:'Escritório',senso:'Limpeza',item_number:'2.2',question:'Os resíduos são descartados corretamente?',criterion:'Estação sem embalagens ou resíduos'},
  {checklist:'Escritório',senso:'Limpeza',item_number:'2.3',question:'Lixeiras',criterion:'Sem lixeiras improvisadas nos setores ou mesas'},
  {checklist:'Escritório',senso:'Padronização',item_number:'3.1',question:'Identificação de equipamentos',criterion:'Monitores identificados'},
  {checklist:'Escritório',senso:'Padronização',item_number:'3.2',question:'Utilização do crachá',criterion:'Colaborador utilizando crachá visível'},
  {checklist:'Escritório',senso:'Padronização',item_number:'3.3',question:'Padronização de arquivos',criterion:'Arquivos com nomes padronizados'},
  {checklist:'Escritório',senso:'Padronização',item_number:'3.4',question:'Padronização de pastas',criterion:'Pastas com nomenclatura padronizada'},
  {checklist:'Escritório',senso:'Disciplina',item_number:'4.1',question:'Segurança da informação',criterion:'Computadores bloqueados quando não em uso'},
  {checklist:'Escritório',senso:'Disciplina',item_number:'4.2',question:'Organização durante a auditoria',criterion:'Setor permanece organizado'},
  {checklist:'Escritório',senso:'Disciplina',item_number:'4.3',question:'Atendimento ao auditor',criterion:'Equipe receptiva e prestativa'},
  {checklist:'Escritório',senso:'Disciplina',item_number:'4.4',question:'Plano de Ação',criterion:'Plano de ação executado'},
  {checklist:'Escritório',senso:'Disciplina',item_number:'4.5',question:'Continuidade da melhoria',criterion:'Evidência de melhorias contínuas'},
  {checklist:'Área Comum',senso:'Utilização',item_number:'1.1',question:'Uso consciente de energia e água',criterion:'Lâmpadas/TVs desligadas; torneiras sem vazamento'},
  {checklist:'Área Comum',senso:'Utilização',item_number:'1.2',question:'Cozinha organizada',criterion:'Sem potes sobre bancadas; sem utensílios sujos'},
  {checklist:'Área Comum',senso:'Utilização',item_number:'1.3',question:'Banheiros organizados',criterion:'Sem itens pessoais; sem roupas armazenadas'},
  {checklist:'Área Comum',senso:'Utilização',item_number:'1.4',question:'Sala de reunião organizada',criterion:'Mesas e cadeiras organizadas; cabos organizados'},
  {checklist:'Área Comum',senso:'Limpeza',item_number:'2.1',question:'Cozinha e área de descanso',criterion:'Bancadas limpas; sofás e cadeiras limpos'},
  {checklist:'Área Comum',senso:'Limpeza',item_number:'2.2',question:'Banheiros',criterion:'Sem papel no chão; cabines limpas; pia seca'},
  {checklist:'Área Comum',senso:'Limpeza',item_number:'2.3',question:'Salas de reunião',criterion:'Mesas limpas; resíduos removidos'},
  {checklist:'Área Comum',senso:'Padronização',item_number:'3.1',question:'Padrão de utilização',criterion:'Resíduos descartados corretamente; alimentos identificados'},
  {checklist:'Área Comum',senso:'Disciplina',item_number:'4.1',question:'Organização após utilização',criterion:'Utensílios guardados após o uso'},
  {checklist:'Área Comum',senso:'Disciplina',item_number:'4.2',question:'Área Gourmet',criterion:'Porta mantida fechada'},
  {checklist:'Área Comum',senso:'Disciplina',item_number:'4.3',question:'Controle de alimentos',criterion:'Alimentos vencidos descartados'},
];

async function seedDefaultCriteria(){
  if(!confirm('Isso vai adicionar os critérios padrão que ainda não existirem. Continuar?'))return;
  const existing=new Set(getAllCriteria().map(c=>c.checklist+'|'+c.item_number));
  const btn=document.getElementById('seed-criteria-btn');
  btn.disabled=true;btn.textContent='Carregando...';
  let added=0;
  try{
    for(const c of DEFAULT_CRITERIA){
      const key=c.checklist+'|'+c.item_number;
      if(existing.has(key))continue;
      await window.dataSdk.create({type:'criterion',entity_id:uid(),checklist:c.checklist,senso:c.senso,item_number:c.item_number,question:c.question,criterion:c.criterion,status:'active'});
      added++;
    }
  }finally{
    btn.disabled=false;btn.innerHTML='<i data-lucide="refresh-cw" class="w-4 h-4"></i> Carregar Padrão';
    lucide.createIcons();
  }
  alert(`${added} critério(s) adicionado(s).`);
}
document.getElementById('seed-criteria-btn').addEventListener('click',seedDefaultCriteria);

// ===== NAVIGATION =====
function showTab(nav){
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  const tab=document.getElementById('tab-'+nav);if(tab)tab.classList.add('active');
  document.querySelectorAll('.nav-link[data-nav]').forEach(l=>l.classList.remove('active'));
  const link=document.querySelector(`.nav-link[data-nav="${nav}"]`);if(link)link.classList.add('active');
  document.getElementById('header-controls').style.display=nav==='dashboard'?'flex':'none';
  document.getElementById('sidebar').classList.remove('open');

  if(nav==='relatorios'){
    window.currentReportType='';
    document.getElementById('rel-type-label').textContent='';
    document.getElementById('rel-type-selector').classList.remove('hidden');
    document.getElementById('rel-filters-section').classList.remove('show');
    document.getElementById('rel-dept').value='';
    document.getElementById('rel-classification').value='';
    document.getElementById('rel-search').value='';
    document.getElementById('rel-date-from').value='';
    document.getElementById('rel-date-to').value='';
  }
}
document.querySelectorAll('.nav-link[data-nav]').forEach(link=>{link.addEventListener('click',()=>showTab(link.dataset.nav))});
const mobileBtn=document.getElementById('mobile-menu-btn');
if(mobileBtn)mobileBtn.addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));

// ===== REFRESH =====
function refreshAll(){updateDeptSelects();renderDeptTable();renderCriteriaTable();updateDashboard();renderReports();renderRanking();loadConfigUI()}

function updateDeptSelects(){
  const depts=getDepts().map(d=>d.name);
  [['dept-select-dash','Todos'],['audit-dept','Selecione...'],['rel-dept','Todos Departamentos']].forEach(([id,ph])=>{
    const sel=document.getElementById(id);if(!sel)return;
    const cur=sel.value;sel.innerHTML=`<option value="">${ph}</option>`;
    depts.forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d;sel.appendChild(o)});
    if(cur&&depts.includes(cur))sel.value=cur;
  });
}

// ===== DASHBOARD =====
function updateDashboard(){
  const dept=document.getElementById('dept-select-dash').value;
  const audits=getAudits();
  document.getElementById('hero-dept-name').textContent=dept||'Todos';

  let officeAudits=audits.filter(a=>a.audit_type==='Escritório');
  if(dept)officeAudits=officeAudits.filter(a=>a.department===dept);
  const latestOffice=officeAudits.length?officeAudits.reduce((l,c)=>(c.audit_timestamp||'')>(l.audit_timestamp||'')?c:l):null;

  const commonAudits=audits.filter(a=>a.audit_type==='Área Comum');
  const latestCommon=commonAudits.length?commonAudits.reduce((l,c)=>(c.audit_timestamp||'')>(l.audit_timestamp||'')?c:l):null;

  let officeAvg=latestOffice?parseFloat(latestOffice.overall_average)||0:0;
  let commonAvg=latestCommon?parseFloat(latestCommon.overall_average)||0:0;
  let generalAvg=0;
  if(officeAvg>0&&commonAvg>0)generalAvg=(officeAvg+commonAvg)/2;
  else if(officeAvg>0)generalAvg=officeAvg;
  else generalAvg=commonAvg;

  const SCORE_FIELDS=['utilization_score','cleanliness_score','standardization_score','discipline_score'];
  const scores=SCORE_FIELDS.map(f=>{
    let t=0,c=0;
    if(latestOffice&&latestOffice[f]){t+=parseFloat(latestOffice[f]);c++}
    if(latestCommon&&latestCommon[f]){t+=parseFloat(latestCommon[f]);c++}
    return c>0?t/c:0;
  });

  const cards=document.querySelectorAll('#kpi-container .kpi-card[data-pillar]');
  const pillarMap={'Utilização':0,'Limpeza':1,'Padronização':2,'Disciplina':3};
  cards.forEach(card=>{
    const p=card.dataset.pillar;const i=pillarMap[p];if(i===undefined)return;
    const val=scores[i];const cls=classify(val);
    card.querySelector('.kpi-value').textContent=val.toFixed(1);
    card.querySelector('.kpi-value').style.color=cls.color;
    card.querySelector('.kpi-bar').style.width=val+'%';
    card.querySelector('.kpi-bar').style.backgroundColor=cls.color;
    card.querySelector('.emoji').textContent=cls.emoji;
    card.querySelector('.classification').textContent=cls.text;
    card.querySelector('.classification').style.color=cls.color;
  });

  const avgCls=classify(generalAvg);
  const circ=2*Math.PI*50;
  document.getElementById('donut-progress').style.strokeDasharray=`${(generalAvg/100)*circ} ${circ}`;
  document.getElementById('donut-progress').style.stroke=avgCls.color;
  document.getElementById('donut-value').textContent=generalAvg.toFixed(1)+'%';
  document.getElementById('donut-value').style.color=avgCls.color;
  document.getElementById('sector-emoji').textContent=avgCls.emoji;
  document.getElementById('sector-text').textContent=avgCls.text;
  document.getElementById('sector-text').style.color=avgCls.color;
  document.getElementById('dash-office-avg').textContent=officeAvg.toFixed(1)+'%';
  document.getElementById('dash-office-avg').style.color=classify(officeAvg).color;
  document.getElementById('dash-common-avg').textContent=commonAvg.toFixed(1)+'%';
  document.getElementById('dash-common-avg').style.color=classify(commonAvg).color;
  document.getElementById('dash-audit-count').textContent=audits.length;

  if(audits.length){
    const sorted=[...audits].sort((a,b)=>(b.audit_timestamp||'0').localeCompare(a.audit_timestamp||'0'));
    document.getElementById('dash-last-audit').textContent=sorted[0].audit_date||'—';
  }else{
    document.getElementById('dash-last-audit').textContent='—';
  }
}
document.getElementById('dept-select-dash').addEventListener('change',updateDashboard);

// ===== DEPARTMENTS =====
function renderDeptTable(){
  const grid=document.getElementById('dept-grid');if(!grid)return;
  grid.innerHTML='';
  getAllDepts().forEach(d=>{
    const card=document.createElement('div');
    card.className='kpi-card p-4 flex flex-col justify-between cursor-pointer group hover:shadow-lg transition';
    card.style.minHeight='140px';
    const statusColor=d.status==='inactive'?'#dc2626':'#16a34a';
    const statusText=d.status==='inactive'?'Inativo':'Ativo';
    card.innerHTML=`<div><h3 class="font-extrabold text-lg text-gray-800 mb-1 group-hover:text-emerald-600 transition">${d.name||''}</h3><p class="text-xs text-gray-500 mb-3">${d.responsible||'Sem responsável'}</p></div><div class="flex justify-between items-end"><span class="text-xs px-3 py-1 rounded-full font-semibold" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">${statusText}</span><div class="flex gap-1"><button class="edit-dept px-2 py-1 text-blue-600 text-xs font-semibold hover:bg-blue-50 rounded transition">✏️</button><button class="del-dept px-2 py-1 text-red-600 text-xs font-semibold hover:bg-red-50 rounded transition">🗑️</button></div></div>`;
    card.querySelector('.edit-dept').addEventListener('click',()=>openDeptForm(d));
    card.querySelector('.del-dept').addEventListener('click',async()=>{if(confirm('Excluir este departamento?'))await window.dataSdk.delete(d)});
    grid.appendChild(card);
  });
}
function openDeptForm(d){
  document.getElementById('dept-modal').classList.add('show');
  document.getElementById('dept-modal-title').textContent=d?'Editar Departamento':'Novo Departamento';
  document.getElementById('dept-name').value=d?d.name||'':'';
  document.getElementById('dept-responsible').value=d?d.responsible||'':'';
  document.getElementById('dept-edit-id').value=d?d.__backendId:'';
}
document.getElementById('add-dept-btn').addEventListener('click',()=>openDeptForm(null));
document.getElementById('cancel-dept').addEventListener('click',()=>document.getElementById('dept-modal').classList.remove('show'));
document.getElementById('dept-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const name=document.getElementById('dept-name').value.trim();if(!name)return;
  const responsible=document.getElementById('dept-responsible').value.trim();
  const editId=document.getElementById('dept-edit-id').value;
  const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Salvando...';
  try{
    if(editId){const ex=allData.find(r=>r.__backendId===editId);if(ex)await window.dataSdk.update({...ex,name,responsible})}
    else{await window.dataSdk.create({type:'department',entity_id:uid(),name,responsible,status:'active'})}
    document.getElementById('dept-modal').classList.remove('show');document.getElementById('dept-form').reset();document.getElementById('dept-edit-id').value='';
  }finally{btn.disabled=false;btn.textContent='Salvar'}
});

// ===== CRITERIA =====
function renderCriteriaTable(){
  const tbody=document.getElementById('criteria-table');
  const typeF=document.getElementById('filter-type-crit').value;
  const pillarF=document.getElementById('filter-pillar-crit').value;
  let crits=getAllCriteria();
  if(typeF)crits=crits.filter(c=>c.checklist===typeF);
  if(pillarF)crits=crits.filter(c=>c.senso===pillarF);
  crits.sort((a,b)=>(a.checklist||'').localeCompare(b.checklist||'')||(a.item_number||'').localeCompare(b.item_number||'',undefined,{numeric:true}));
  tbody.innerHTML='';
  crits.forEach(c=>{
    const tr=document.createElement('tr');tr.className='border-b hover:bg-gray-50';
    tr.innerHTML=`<td class="p-2 text-xs">${c.checklist||''}</td><td class="p-2 text-xs">${c.senso||''}</td><td class="p-2 text-xs font-bold">${c.item_number||''}</td><td class="p-2 text-xs">${c.question||''}</td><td class="p-2 text-xs text-gray-500">${c.criterion||''}</td><td class="p-2 text-xs text-center">${c.status!=='inactive'?'✓':'✗'}</td><td class="p-2 flex gap-1"><button class="edit-crit text-blue-600 text-xs font-semibold">Editar</button><button class="del-crit text-red-500 text-xs font-semibold">Excluir</button></td>`;
    tr.querySelector('.edit-crit').addEventListener('click',()=>openCriterionForm(c));
    tr.querySelector('.del-crit').addEventListener('click',async()=>{if(confirm('Excluir este critério?'))await window.dataSdk.delete(c)});
    tbody.appendChild(tr);
  });
}
document.getElementById('filter-type-crit').addEventListener('change',renderCriteriaTable);
document.getElementById('filter-pillar-crit').addEventListener('change',renderCriteriaTable);
function openCriterionForm(c){
  document.getElementById('criterion-modal').classList.add('show');
  document.getElementById('criterion-modal-title').textContent=c?'Editar Critério':'Novo Critério';
  document.getElementById('crit-checklist').value=c?c.checklist||'':'';
  document.getElementById('crit-senso').value=c?c.senso||'':'';
  document.getElementById('crit-item').value=c?c.item_number||'':'';
  document.getElementById('crit-question').value=c?c.question||'':'';
  document.getElementById('crit-criterion').value=c?c.criterion||'':'';
  document.getElementById('crit-edit-id').value=c?c.__backendId:'';
}
document.getElementById('add-criterion-btn').addEventListener('click',()=>openCriterionForm(null));
document.getElementById('cancel-criterion').addEventListener('click',()=>document.getElementById('criterion-modal').classList.remove('show'));
document.getElementById('criterion-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const data={type:'criterion',entity_id:uid(),checklist:document.getElementById('crit-checklist').value,senso:document.getElementById('crit-senso').value,item_number:document.getElementById('crit-item').value,question:document.getElementById('crit-question').value,criterion:document.getElementById('crit-criterion').value,status:'active'};
  const editId=document.getElementById('crit-edit-id').value;
  try{
    if(editId){const ex=allData.find(r=>r.__backendId===editId);if(ex)await window.dataSdk.update({...ex,checklist:data.checklist,senso:data.senso,item_number:data.item_number,question:data.question,criterion:data.criterion})}
    else{await window.dataSdk.create(data)}
    document.getElementById('criterion-modal').classList.remove('show');document.getElementById('criterion-form').reset();document.getElementById('crit-edit-id').value='';
  }catch(err){}
});

// ===== AUDIT =====
document.getElementById('audit-date').value=new Date().toISOString().slice(0,10);

document.getElementById('audit-start-btn').addEventListener('click',()=>{
  const selectedType=document.querySelector('input[name="audit-type"]:checked');
  const auditor=document.getElementById('audit-auditor').value.trim();
  const errElem=document.getElementById('audit-start-err');
  if(!selectedType){errElem.textContent='Selecione um tipo de auditoria.';errElem.classList.remove('hidden');return}
  if(!auditor){errElem.textContent='Informe o nome do auditor.';errElem.classList.remove('hidden');return}
  errElem.classList.add('hidden');errElem.textContent='';
  loadChecklistForType(selectedType.value);
});

function initAuditTypeRadios(){
  const group=document.getElementById('audit-type-radio-group');
  group.innerHTML='';
  const types=['Escritório','Área Comum'];
  types.forEach(type=>{
    const label=document.createElement('label');
    label.className='flex items-center gap-2 cursor-pointer p-3 border-2 rounded-lg transition hover:border-emerald-400';
    label.innerHTML=`<input type="radio" name="audit-type" value="${type}" class="audit-type-radio w-4 h-4 accent-emerald-600"> <span class="text-sm font-semibold">${type}</span>`;
    label.querySelector('input').addEventListener('change',()=>{
      document.querySelectorAll('#audit-type-radio-group label').forEach(l=>l.classList.remove('border-emerald-600','bg-emerald-50'));
      label.classList.add('border-emerald-600','bg-emerald-50');
      updateChecklistOnTypeChange(type);
    });
    group.appendChild(label);
  });
}

function updateChecklistOnTypeChange(auditType){
  const dc=document.getElementById('audit-dept-container');
  if(auditType==='Escritório'){dc.classList.remove('hidden')}else{dc.classList.add('hidden');document.getElementById('audit-dept').value=''}
}

function loadChecklistForType(auditType){
  auditResponses={};
  currentAuditData={auditType,dept:auditType==='Escritório'?document.getElementById('audit-dept').value:null,auditor:document.getElementById('audit-auditor').value.trim(),date:document.getElementById('audit-date').value};

  const container=document.getElementById('audit-checklist-container');
  container.innerHTML='';
  const crits=getUniqueCriteria(auditType);
  if(!crits.length){container.innerHTML=`<p class="text-gray-400 text-sm">Nenhum critério cadastrado para ${auditType}.</p>`}
  else{buildChecklistUI(crits,auditType,container)}

  document.getElementById('checklist-title').textContent=`📋 Checklist ${auditType}`;
  document.getElementById('audit-step-info').classList.add('hidden');
  document.getElementById('audit-step-checklist').classList.remove('hidden');
}
initAuditTypeRadios();

function getUniqueCriteria(checklistType){
  const all=getCriteria().filter(c=>c.checklist===checklistType);
  const seen=new Set();const result=[];
  all.sort((a,b)=>{
    const itemCmp=(a.item_number||'').localeCompare(b.item_number||'',undefined,{numeric:true});
    if(itemCmp!==0)return itemCmp;
    return(a.__backendId||'').localeCompare(b.__backendId||'');
  });
  all.forEach(c=>{
    const key=c.checklist+'|'+c.item_number;
    if(!seen.has(key)){seen.add(key);result.push(c)}
  });
  return result;
}

function buildChecklistUI(crits,checklistType,container){
  PILLARS.forEach(pillar=>{
    const items=crits.filter(c=>c.senso===pillar);
    if(!items.length)return;
    const section=document.createElement('div');section.className='mb-4';
    section.innerHTML=`<h4 class="font-bold text-sm text-gray-700 mb-2 border-b pb-1 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>${pillar}</h4>`;
    items.forEach(c=>{
      const key=checklistType+'|'+c.__backendId;
      auditResponses[key]={response:null,observation:'',photo:'',entity_id:c.entity_id};
      const row=document.createElement('div');row.className='p-3 bg-gray-50 rounded-lg mb-2';
      row.innerHTML=`<div class="mb-1"><span class="text-xs font-bold text-emerald-700 mr-2">${c.item_number}</span><span class="text-sm font-medium text-gray-800">${c.question}</span></div>${c.criterion?`<p class="text-xs text-gray-500 mb-2">${c.criterion}</p>`:''}<div class="flex gap-2 flex-wrap mb-2"><button type="button" class="response-btn px-3 py-1.5 text-xs font-semibold border rounded-lg" data-key="${key}" data-val="atende">✅ Atende</button><button type="button" class="response-btn px-3 py-1.5 text-xs font-semibold border rounded-lg" data-key="${key}" data-val="parcial">🟡 Parcial</button><button type="button" class="response-btn px-3 py-1.5 text-xs font-semibold border rounded-lg" data-key="${key}" data-val="nao">❌ Não Atende</button></div><div class="mb-2"><input class="obs-input w-full border rounded px-2 py-1 text-xs" placeholder="Observação" data-key="${key}"></div><div class="flex items-center gap-2"><label class="photo-btn cursor-pointer flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border rounded-lg bg-white hover:bg-gray-100"><i data-lucide="camera" class="w-3.5 h-3.5"></i> Foto<input type="file" accept="image/*" class="photo-input hidden" data-key="${key}"></label><img class="photo-preview hidden w-14 h-14 object-cover rounded-lg border" data-key="${key}"><button type="button" class="photo-remove-btn hidden text-red-500 text-xs font-semibold" data-key="${key}">Remover</button></div>`;
      section.appendChild(row);
    });
    container.appendChild(section);
  });
  container.querySelectorAll('.response-btn').forEach(btn=>{btn.addEventListener('click',()=>{
    const key=btn.dataset.key;const val=btn.dataset.val;
    auditResponses[key].response=val;
    btn.parentElement.querySelectorAll('.response-btn').forEach(b=>b.classList.remove('sel-atende','sel-parcial','sel-nao'));
    btn.classList.add(val==='atende'?'sel-atende':val==='parcial'?'sel-parcial':'sel-nao');
  })});
  container.querySelectorAll('.obs-input').forEach(inp=>{inp.addEventListener('input',()=>{auditResponses[inp.dataset.key].observation=inp.value})});
  container.querySelectorAll('.photo-input').forEach(inp=>{inp.addEventListener('change',(e)=>{
    const key=inp.dataset.key;
    const file=e.target.files[0];
    if(!file)return;
    if(file.size>5*1024*1024){alert('A foto deve ter no máximo 3MB.');inp.value='';return}
    const reader=new FileReader();
    reader.onload=()=>{
      auditResponses[key].photo=reader.result;
      const row=inp.closest('.p-3');
      const preview=row.querySelector('.photo-preview');
      const removeBtn=row.querySelector('.photo-remove-btn');
      preview.src=reader.result;
      preview.classList.remove('hidden');
      removeBtn.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  })});
  container.querySelectorAll('.photo-remove-btn').forEach(btn=>{btn.addEventListener('click',()=>{
    const key=btn.dataset.key;
    auditResponses[key].photo='';
    const row=btn.closest('.p-3');
    row.querySelector('.photo-preview').classList.add('hidden');
    row.querySelector('.photo-input').value='';
    btn.classList.add('hidden');
  })});
  lucide.createIcons();
}

document.getElementById('finish-audit-btn').addEventListener('click',async()=>{
  const keys=Object.keys(auditResponses);
  const missing=keys.filter(k=>!auditResponses[k].response);
  if(missing.length>0){
    document.getElementById('audit-validation-msg').textContent=`Existem ${missing.length} critério(s) sem avaliação.`;
    document.getElementById('audit-validation-msg').classList.remove('hidden');return;
  }
  document.getElementById('audit-validation-msg').classList.add('hidden');
  const btn=document.getElementById('finish-audit-btn');btn.disabled=true;btn.textContent='Salvando...';

  const pillarScores={};PILLARS.forEach(p=>{pillarScores[p]={total:0,count:0}});
  keys.forEach(k=>{
    const eid=auditResponses[k].entity_id;
    const crit=getCriteria().find(c=>c.entity_id===eid);if(!crit)return;
    const r=auditResponses[k].response;
    const score=r==='atende'?100:r==='parcial'?50:0;
    pillarScores[crit.senso].total+=score;pillarScores[crit.senso].count++;
  });
  const pillarAvgs={};PILLARS.forEach(p=>{pillarAvgs[p]=pillarScores[p].count>0?pillarScores[p].total/pillarScores[p].count:0});
  const typeAvg=keys.length>0?keys.reduce((s,k)=>{const r=auditResponses[k].response;return s+(r==='atende'?100:r==='parcial'?50:0)},0)/keys.length:0;

  const responsesClean={};keys.forEach(k=>{responsesClean[k]={response:auditResponses[k].response,observation:auditResponses[k].observation,photo:auditResponses[k].photo||'',entity_id:auditResponses[k].entity_id}});
  const photoCount=keys.filter(k=>auditResponses[k].photo).length;
  const auditNumber=getAudits().length+1;
  const isCommon=currentAuditData.auditType==='Área Comum';
  const now=new Date();
  const record={
    type:'audit',entity_id:uid(),audit_number:auditNumber,audit_date:currentAuditData.date,
    department:isCommon?'Área Comum':currentAuditData.dept||'',
    auditor:currentAuditData.auditor||'',audit_type:currentAuditData.auditType||'',
    overall_average:parseFloat((Math.round(typeAvg*100)/100).toFixed(2)),
    office_average:isCommon?0:parseFloat((Math.round(typeAvg*100)/100).toFixed(2)),
    common_average:isCommon?parseFloat((Math.round(typeAvg*100)/100).toFixed(2)):0,
    utilization_score:parseFloat((Math.round(pillarAvgs['Utilização']*100)/100).toFixed(2)),
    cleanliness_score:parseFloat((Math.round(pillarAvgs['Limpeza']*100)/100).toFixed(2)),
    standardization_score:parseFloat((Math.round(pillarAvgs['Padronização']*100)/100).toFixed(2)),
    discipline_score:parseFloat((Math.round(pillarAvgs['Disciplina']*100)/100).toFixed(2)),
    classification:classify(typeAvg).text||'',
    responses_json:JSON.stringify(responsesClean),
    evidence_count:photoCount,audit_timestamp:now.toISOString(),companion:'',status:'active'
  };

  const result=await window.dataSdk.create(record);
  btn.disabled=false;btn.textContent='Avaliação Finalizada';
  if(result&&result.isError){
    document.getElementById('audit-validation-msg').textContent='Erro ao salvar auditoria: '+result.message;
    document.getElementById('audit-validation-msg').classList.remove('hidden');
    return;
  }

  lastSavedAudit=record;
  document.getElementById('audit-step-checklist').classList.add('hidden');
  document.getElementById('audit-step-result').classList.remove('hidden');
  showResult(record);
});

function showResult(a){
  const cls=classify(a.overall_average);
  document.getElementById('result-summary').innerHTML=`<div class="p-3 bg-emerald-50 rounded-lg text-center border"><p class="text-xs font-bold text-emerald-600 mb-1">Média</p><span class="font-extrabold text-xl" style="color:${cls.color}">${a.overall_average.toFixed(1)}%</span></div><div class="p-3 bg-gray-50 rounded-lg text-center border"><p class="text-xs font-bold text-gray-600 mb-1">Tipo</p><span class="font-bold text-sm">${a.audit_type}</span></div><div class="p-3 bg-gray-50 rounded-lg text-center border"><p class="text-xs font-bold text-gray-600 mb-1">Departamento</p><span class="font-bold text-sm">${a.department}</span></div>`;
  document.getElementById('result-emoji').textContent=cls.emoji;
  document.getElementById('result-class').textContent=cls.text;document.getElementById('result-class').style.color=cls.color;
  const scores=[a.utilization_score,a.cleanliness_score,a.standardization_score,a.discipline_score];
  document.getElementById('result-pillars').innerHTML=PILLARS.map((p,i)=>{const pc=classify(scores[i]);return`<div class="p-2 rounded-lg bg-gray-50 border text-center"><p class="text-[10px] text-gray-500 font-bold">${p}</p><p class="font-extrabold text-lg" style="color:${pc.color}">${scores[i].toFixed(1)}%</p><p class="text-[10px]">${pc.emoji} ${pc.text}</p></div>`}).join('');
}

document.getElementById('new-audit-btn').addEventListener('click',()=>{
  document.getElementById('audit-step-result').classList.add('hidden');
  document.getElementById('audit-step-info').classList.remove('hidden');
  document.getElementById('audit-dept').value='';
  document.getElementById('audit-auditor').value='';document.getElementById('audit-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('audit-dept-container').classList.add('hidden');
  document.querySelectorAll('input[name="audit-type"]').forEach(r=>r.checked=false);
  document.querySelectorAll('#audit-type-radio-group label').forEach(l=>l.classList.remove('border-emerald-600','bg-emerald-50'));
  auditResponses={};
  currentAuditData=null;
});
document.getElementById('result-pdf-btn').addEventListener('click',()=>{if(lastSavedAudit)generatePDF(lastSavedAudit)});
document.getElementById('cancel-audit-btn').addEventListener('click',()=>document.getElementById('cancel-confirm-modal').classList.add('show'));
document.getElementById('cancel-back-btn').addEventListener('click',()=>document.getElementById('cancel-confirm-modal').classList.remove('show'));
document.getElementById('cancel-yes-btn').addEventListener('click',()=>{
  document.getElementById('cancel-confirm-modal').classList.remove('show');
  document.getElementById('audit-step-checklist').classList.add('hidden');
  document.getElementById('audit-validation-msg').classList.add('hidden');
  document.getElementById('audit-step-info').classList.remove('hidden');
  auditResponses={};
});

// ===== HISTORY =====
function renderReports(){
  const container=document.getElementById('reports-list');const empty=document.getElementById('rel-empty');
  let audits=getAudits();
  const typeF=window.currentReportType||'';
  const deptF=document.getElementById('rel-dept').value;
  const classF=document.getElementById('rel-classification').value;
  const searchF=document.getElementById('rel-search').value.trim().toLowerCase();
  const dateFrom=document.getElementById('rel-date-from').value;
  const dateTo=document.getElementById('rel-date-to').value;
  if(typeF)audits=audits.filter(a=>a.audit_type===typeF);
  if(deptF)audits=audits.filter(a=>a.department===deptF);
  if(classF)audits=audits.filter(a=>a.classification===classF);
  if(searchF)audits=audits.filter(a=>(a.auditor||'').toLowerCase().includes(searchF)||(a.department||'').toLowerCase().includes(searchF));
  if(dateFrom)audits=audits.filter(a=>a.audit_date>=dateFrom);
  if(dateTo)audits=audits.filter(a=>a.audit_date<=dateTo);
  audits.sort((a,b)=>(b.audit_timestamp||'').localeCompare(a.audit_timestamp||''));
  container.innerHTML='';
  if(!audits.length){empty.classList.remove('hidden');return}
  empty.classList.add('hidden');
  audits.forEach(a=>{
    const cls=classify(a.overall_average||0);
    const div=document.createElement('div');
    div.className='p-4 bg-white rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:shadow-md transition';
    div.innerHTML=`<div class="flex-1 min-w-0"><p class="font-bold text-sm">#${a.audit_number||'—'} ${a.department||'Área Comum'}</p><p class="text-xs text-gray-500 mt-1">${a.audit_date||'—'} · ${a.auditor||'—'}</p></div><div class="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 flex-shrink-0"><div class="text-right"><p class="text-xs font-bold text-gray-600">Nota Final</p><span class="font-extrabold text-lg" style="color:${cls.color}">${(a.overall_average||0).toFixed(1)}%</span></div><span class="text-xl">${cls.emoji}</span><button class="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg view-btn hover:bg-blue-700 transition">Visualizar</button><button class="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg pdf-btn hover:bg-red-700 transition">PDF</button></div>`;
    div.querySelector('.view-btn').addEventListener('click',()=>openReport(a));
    div.querySelector('.pdf-btn').addEventListener('click',()=>generatePDF(a));
    container.appendChild(div);
  });
}
document.getElementById('rel-filter-btn').addEventListener('click',renderReports);
document.getElementById('rel-clear-btn').addEventListener('click',()=>{
  document.getElementById('rel-dept').value='';
  document.getElementById('rel-classification').value='';
  document.getElementById('rel-search').value='';
  document.getElementById('rel-date-from').value='';
  document.getElementById('rel-date-to').value='';
  renderReports();
});
document.getElementById('rel-search').addEventListener('keyup',(e)=>{if(e.key==='Enter')renderReports()});
document.getElementById('rel-dept').addEventListener('change',renderReports);
document.getElementById('rel-classification').addEventListener('change',renderReports);
document.getElementById('rel-date-from').addEventListener('change',renderReports);
document.getElementById('rel-date-to').addEventListener('change',renderReports);

document.getElementById('rel-btn-escritorio').addEventListener('click',()=>{
  window.currentReportType='Escritório';
  document.getElementById('rel-type-label').textContent='Auditorias de Escritório';
  document.getElementById('rel-type-selector').classList.add('hidden');
  document.getElementById('rel-filters-section').classList.add('show');
  renderReports();
});
document.getElementById('rel-btn-comum').addEventListener('click',()=>{
  window.currentReportType='Área Comum';
  document.getElementById('rel-type-label').textContent='Auditorias de Área Comum';
  document.getElementById('rel-type-selector').classList.add('hidden');
  document.getElementById('rel-filters-section').classList.add('show');
  renderReports();
});
document.getElementById('rel-back-btn').addEventListener('click',()=>{
  window.currentReportType='';
  document.getElementById('rel-type-label').textContent='';
  document.getElementById('rel-type-selector').classList.remove('hidden');
  document.getElementById('rel-filters-section').classList.remove('show');
  document.getElementById('rel-dept').value='';
  document.getElementById('rel-classification').value='';
  document.getElementById('rel-search').value='';
  document.getElementById('rel-date-from').value='';
  document.getElementById('rel-date-to').value='';
});

function openReport(audit){
  document.getElementById('report-modal').classList.add('show');
  document.getElementById('report-title').textContent=`Auditoria #${audit.audit_number||'—'} - ${audit.department||''}`;
  const cls=classify(audit.overall_average||0);
  let html=`<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 pb-4 border-b"><div class="text-center"><p class="text-xs font-bold text-gray-500">Departamento</p><p class="font-bold text-sm">${audit.department||'—'}</p></div><div class="text-center"><p class="text-xs font-bold text-gray-500">Auditor</p><p class="font-bold text-sm">${audit.auditor||'—'}</p></div><div class="text-center"><p class="text-xs font-bold text-gray-500">Tipo</p><p class="font-bold text-sm">${audit.audit_type||'—'}</p></div><div class="text-center"><p class="text-xs font-bold text-gray-500">Data</p><p class="font-bold text-sm">${audit.audit_date||'—'}</p></div></div>`;
  html+=`<div class="text-center mb-4"><span class="font-extrabold text-3xl" style="color:${cls.color}">${(audit.overall_average||0).toFixed(1)}%</span><span class="text-2xl ml-2">${cls.emoji}</span></div>`;
  const scores=[audit.utilization_score||0,audit.cleanliness_score||0,audit.standardization_score||0,audit.discipline_score||0];
  html+=`<div class="grid grid-cols-4 gap-2 mb-4">${PILLARS.map((p,i)=>{const pc=classify(scores[i]);return`<div class="p-2 rounded-lg border text-center" style="background:${PILLAR_COLORS[i]}10"><p class="text-xs font-bold" style="color:${PILLAR_COLORS[i]}">${p}</p><p class="font-extrabold" style="color:${PILLAR_COLORS[i]}">${scores[i].toFixed(1)}%</p></div>`}).join('')}</div>`;
  try{
    const responses=JSON.parse(audit.responses_json||'{}');const rkeys=Object.keys(responses);
    if(rkeys.length){
      html+=`<h4 class="font-bold text-sm text-gray-800 mb-2 border-b pb-1">Critérios Avaliados</h4><div class="space-y-1 max-h-64 overflow-y-auto">`;
      rkeys.forEach(k=>{
        const eid=responses[k].entity_id;
        const crit=allData.find(c=>c.type==='criterion'&&c.entity_id===eid);
        const r=responses[k];
        const rL=r.response==='atende'?'✅':r.response==='parcial'?'🟡':'❌';
        html+=`<div class="p-2 bg-gray-50 rounded text-xs flex justify-between items-center"><span><strong>${crit?crit.item_number:''}</strong> ${crit?crit.question:eid}</span><span>${rL}${r.observation?' · '+r.observation:''}</span></div>`
      });
      html+=`</div>`;
    }
  }catch(e){}
  document.getElementById('report-content').innerHTML=html;
  document.getElementById('report-pdf-btn').onclick=()=>generatePDF(audit);
}
document.getElementById('close-report-btn').addEventListener('click',()=>document.getElementById('report-modal').classList.remove('show'));
document.getElementById('report-close-btn').addEventListener('click',()=>document.getElementById('report-modal').classList.remove('show'));

// ===== RANKING =====
function renderRanking(){
  const container=document.getElementById('ranking-table');const empty=document.getElementById('ranking-empty');
  const audits=getAudits();const depts=getDepts();
  if(!depts.length||!audits.length){container.innerHTML='';empty.classList.remove('hidden');return}
  const commonAudits=audits.filter(a=>a.audit_type==='Área Comum');
  const latestCommon=commonAudits.length?commonAudits.reduce((l,c)=>(c.audit_timestamp||'0')>(l.audit_timestamp||'0')?c:l):null;
  const deptScores=[];
  depts.forEach(d=>{
    const officeAudits=audits.filter(a=>a.audit_type==='Escritório'&&a.department===d.name);
    const latestOffice=officeAudits.length?officeAudits.reduce((l,c)=>(c.audit_timestamp||'0')>(l.audit_timestamp||'0')?c:l):null;
    if(!latestOffice&&!latestCommon)return;
    let avg=0;
    const oAvg=latestOffice?parseFloat(latestOffice.overall_average)||0:0;
    const cAvg=latestCommon?parseFloat(latestCommon.overall_average)||0:0;
    if(oAvg>0&&cAvg>0)avg=(oAvg+cAvg)/2;
    else if(oAvg>0)avg=oAvg;else avg=cAvg;
    const recentDate=latestOffice?latestOffice.audit_date:'—';
    deptScores.push({name:d.name,avg,date:recentDate});
  });
  if(!deptScores.length){container.innerHTML='';empty.classList.remove('hidden');return}
  empty.classList.add('hidden');deptScores.sort((a,b)=>b.avg-a.avg);
  container.innerHTML='';
  deptScores.forEach((d,i)=>{const cls=classify(d.avg);const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';const tr=document.createElement('tr');tr.className='border-b hover:bg-gray-50';tr.innerHTML=`<td class="p-3 text-sm font-bold">${medal} ${i+1}º</td><td class="p-3 text-sm">${d.name}</td><td class="p-3 text-center font-extrabold" style="color:${cls.color}">${d.avg.toFixed(1)}%</td><td class="p-3 text-center hidden sm:table-cell"><span class="text-lg">${cls.emoji}</span> <span class="text-xs font-bold" style="color:${cls.color}">${cls.text}</span></td><td class="p-3 text-right text-xs text-gray-500 hidden lg:table-cell">${d.date}</td>`;container.appendChild(tr)});
}

// ===== CONFIG =====
function loadConfigUI(){
  document.getElementById('cfg-empresa-nome').value=getConfig('empresa_nome','');
  document.getElementById('cfg-otimo').value=getConfig('otimo','95');
  document.getElementById('cfg-bom').value=getConfig('bom','80');
  document.getElementById('cfg-regular').value=getConfig('regular','60');
  document.getElementById('cfg-pdf-fotos').checked=getConfig('pdf_fotos','true')==='true';
  document.getElementById('cfg-pdf-obs').checked=getConfig('pdf_obs','true')==='true';
}
document.getElementById('save-config-btn').addEventListener('click',async()=>{
  const configs={empresa_nome:document.getElementById('cfg-empresa-nome').value,otimo:document.getElementById('cfg-otimo').value,bom:document.getElementById('cfg-bom').value,regular:document.getElementById('cfg-regular').value,pdf_fotos:document.getElementById('cfg-pdf-fotos').checked?'true':'false',pdf_obs:document.getElementById('cfg-pdf-obs').checked?'true':'false'};
  for(const[key,value]of Object.entries(configs)){
    const existing=allData.find(r=>r.type==='config'&&r.config_key===key);
    if(existing)await window.dataSdk.update({...existing,config_value:value});
    else await window.dataSdk.create({type:'config',entity_id:uid(),config_key:key,config_value:value});
  }
  const msg=document.getElementById('config-msg');msg.classList.remove('hidden');setTimeout(()=>msg.classList.add('hidden'),2000);
});

document.getElementById('dash-pdf-btn').addEventListener('click',()=>generateDashboardPDF(document.getElementById('dept-select-dash').value));

// ===== PDF (auditoria individual, com critérios completos e observações) =====
function generatePDF(audit){
  const cls=classify(audit.overall_average||0);
  const empresa=getConfig('empresa_nome','MISSÃO SIMPLIFICAR');
  const scores=[audit.utilization_score||0,audit.cleanliness_score||0,audit.standardization_score||0,audit.discipline_score||0];

  let criteriaByPillar={};
  PILLARS.forEach(p=>criteriaByPillar[p]=[]);
  try{
    const responses=JSON.parse(audit.responses_json||'{}');
    Object.keys(responses).forEach(k=>{
      const eid=responses[k].entity_id;
      const crit=allData.find(x=>x.type==='criterion'&&x.entity_id===eid);
      if(!crit)return;
      const r=responses[k];
      criteriaByPillar[crit.senso].push({item:crit.item_number,question:crit.question,response:r.response,observation:r.observation,photo:r.photo||''});
    });
  }catch(e){console.error('Erro ao processar critérios do PDF:',e)}

  const showPhotos=getConfig('pdf_fotos','true')==='true';

  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório de Auditoria #${audit.audit_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',Arial,sans-serif;padding:20px;color:#333;line-height:1.6}
@page{size:A4;margin:15mm}
.container{max-width:210mm;margin:0 auto}
.header{border-bottom:3px solid #082C23;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start}
.header h1{font-size:22px;font-weight:800;color:#082C23}
.header-info{font-size:10px;text-align:right;line-height:1.8}
.title{text-align:center;font-size:20px;font-weight:800;color:#082C23;margin-bottom:16px;text-transform:uppercase}
.hero{background:linear-gradient(135deg,rgba(8,44,35,.92),rgba(20,83,45,.82));border-radius:12px;padding:30px;color:#fff;margin-bottom:20px;text-align:center}
.hero h2{font-size:32px;font-weight:800;margin-bottom:8px}
.hero .emoji{font-size:48px;display:block;margin-bottom:8px}
.hero .pill{display:inline-block;background:rgba(255,255,255,.15);padding:8px 16px;border-radius:24px;font-size:12px;font-weight:600}
.audit-info{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px;font-size:10px}
.info-item{border:1px solid #ddd;padding:12px;border-radius:8px;background:#f9fafb}
.info-label{font-weight:700;color:#666;text-transform:uppercase;font-size:9px}
.info-value{font-weight:600;color:#111827}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.metric-card{border:1px solid #ddd;border-radius:10px;padding:16px;text-align:center}
.metric-label{font-size:9px;font-weight:700;text-transform:uppercase;margin-bottom:6px}
.metric-value{font-size:24px;font-weight:800}
.metric-emoji{font-size:16px;margin-top:4px}
.criteria-section{margin-bottom:20px;page-break-inside:avoid}
.criteria-title{font-size:12px;font-weight:700;color:#166534;margin-bottom:8px;border-bottom:2px solid #166534;padding-bottom:4px}
.criteria-item{background:#f9fafb;border-left:4px solid #4ade80;padding:10px 12px;margin-bottom:6px;border-radius:4px;font-size:9px}
.criteria-item.atende{border-left-color:#16a34a;background:#dcfce7}
.criteria-item.parcial{border-left-color:#ca8a04;background:#fef9c3}
.criteria-item.nao{border-left-color:#dc2626;background:#fee2e2}
.criteria-obs{font-size:8px;color:#666;margin-top:2px;margin-left:16px;padding-left:8px;border-left:2px solid #ddd}
.criteria-photo{margin-top:6px;margin-left:16px}
.criteria-photo img{max-width:160px;max-height:120px;border-radius:6px;border:1px solid #ddd;object-fit:cover}
.divider{height:1px;background:#e5e7eb;margin:16px 0}
.footer{margin-top:30px;border-top:1px solid #ddd;padding-top:12px;text-align:center;font-size:8px;color:#999}
</style></head><body><div class="container">
<div class="header"><div><h1>${empresa}</h1></div><div class="header-info"><p><strong>Relatório de Auditoria</strong></p><p><strong>#${audit.audit_number||'—'}</strong></p></div></div>
<div class="title">Relatório de Auditoria 5S</div>
<div class="hero"><div class="emoji">${cls.emoji}</div><h2>${(audit.overall_average||0).toFixed(1)}%</h2><div class="pill">${cls.text}</div></div>
<div class="audit-info">
<div class="info-item"><div class="info-label">Tipo de Auditoria</div><div class="info-value">${audit.audit_type||'—'}</div></div>
<div class="info-item"><div class="info-label">Departamento</div><div class="info-value">${audit.department||'—'}</div></div>
<div class="info-item"><div class="info-label">Data</div><div class="info-value">${audit.audit_date||'—'}</div></div>
<div class="info-item"><div class="info-label">Auditor</div><div class="info-value">${audit.auditor||'—'}</div></div>
</div>
<div class="divider"></div>
<div class="metrics">${PILLARS.map((p,i)=>{const pc=classify(scores[i]);return`<div class="metric-card"><div class="metric-label" style="color:${PILLAR_COLORS[i]}">${p}</div><div class="metric-value" style="color:${PILLAR_COLORS[i]}">${scores[i].toFixed(1)}%</div><div class="metric-emoji">${pc.emoji}</div></div>`;}).join('')}</div>
<div class="divider"></div>
${Object.keys(criteriaByPillar).map(pillar=>{
  const items=criteriaByPillar[pillar];
  if(!items.length)return'';
  return`<div class="criteria-section"><div class="criteria-title">● ${pillar}</div>${items.map(item=>{
    const rClass=item.response==='atende'?'atende':item.response==='parcial'?'parcial':'nao';
    const rLabel=item.response==='atende'?'✅ ATENDE':item.response==='parcial'?'🟡 PARCIAL':'❌ NÃO ATENDE';
    return`<div class="criteria-item ${rClass}"><span><strong>${item.item}</strong> ${item.question}</span> <strong>${rLabel}</strong>${item.observation?`<div class="criteria-obs"><strong>Observação:</strong> ${item.observation}</div>`:''}${(showPhotos&&item.photo)?`<div class="criteria-photo"><img src="${item.photo}"></div>`:''}</div>`;
  }).join('')}</div>`;
}).join('')}
<div class="footer"><p><strong>${empresa}</strong> · Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</p></div>
</div></body></html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const printWin=window.open(url,'_blank');
  if(printWin){printWin.onload=()=>{printWin.print()}}
  else{alert('Não foi possível abrir o PDF. Verifique o bloqueador de pop-ups.')}
}

// ===== PDF (dashboard) =====
function generateDashboardPDF(deptFilter){
  const empresa=getConfig('empresa_nome','MISSÃO SIMPLIFICAR');
  const audits=getAudits();
  let officeAudits=audits.filter(a=>a.audit_type==='Escritório');
  if(deptFilter)officeAudits=officeAudits.filter(a=>a.department===deptFilter);
  const latestOffice=officeAudits.length?officeAudits.reduce((l,c)=>(c.audit_timestamp||'0')>(l.audit_timestamp||'0')?c:l):null;
  const commonAudits=audits.filter(a=>a.audit_type==='Área Comum');
  const latestCommon=commonAudits.length?commonAudits.reduce((l,c)=>(c.audit_timestamp||'0')>(l.audit_timestamp||'0')?c:l):null;
  let officeAvg=latestOffice?parseFloat(latestOffice.overall_average)||0:0;
  let commonAvg=latestCommon?parseFloat(latestCommon.overall_average)||0:0;
  let generalAvg=officeAvg>0&&commonAvg>0?(officeAvg+commonAvg)/2:officeAvg||commonAvg;
  const cls=classify(generalAvg);
  const SCORE_FIELDS=['utilization_score','cleanliness_score','standardization_score','discipline_score'];
  const scores=SCORE_FIELDS.map(f=>{let t=0,c=0;if(latestOffice&&latestOffice[f]){t+=parseFloat(latestOffice[f]);c++}if(latestCommon&&latestCommon[f]){t+=parseFloat(latestCommon[f]);c++}return c>0?t/c:0});
  let lastAuditDate='—';
  if(audits.length){const sorted=[...audits].sort((a,b)=>(b.audit_timestamp||'0').localeCompare(a.audit_timestamp||'0'));lastAuditDate=sorted[0].audit_date||'—'}

  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',Arial,sans-serif;padding:20px;color:#333;line-height:1.6}
@page{size:A4;margin:15mm}
.container{max-width:210mm;margin:0 auto}
.header{border-bottom:3px solid #082C23;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start}
.header h1{font-size:22px;font-weight:800;color:#082C23}
.hero{background:linear-gradient(135deg,rgba(8,44,35,.92),rgba(20,83,45,.82));border-radius:12px;padding:30px;color:#fff;margin-bottom:20px;text-align:center}
.hero h2{font-size:32px;font-weight:800;margin-bottom:8px}
.hero .emoji{font-size:48px;display:block;margin-bottom:8px}
.hero .pill{display:inline-block;background:rgba(255,255,255,.15);padding:8px 16px;border-radius:24px;font-size:12px;font-weight:600}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.metric-card{border:1px solid #ddd;border-radius:10px;padding:16px;text-align:left;background:#f9fafb}
.metric-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.metric-label{font-size:9px;font-weight:700;text-transform:uppercase;flex:1}
.metric-value{font-size:20px;font-weight:800;margin-bottom:8px}
.progress-bar{width:100%;height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden;margin-bottom:4px}
.progress-fill{height:100%;border-radius:4px}
.metric-classification{font-size:8px;font-weight:700;text-transform:uppercase}
.areas{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.area-card{border:1px solid #ddd;border-radius:10px;padding:16px;text-align:center;background:#f9fafb}
.area-label{font-size:9px;font-weight:700;text-transform:uppercase;margin-bottom:6px;color:#666}
.area-value{font-size:28px;font-weight:800;color:#166534}
.additional-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
.info-card{border:1px solid #ddd;border-radius:10px;padding:12px;text-align:center;background:#f9fafb}
.info-label{font-size:9px;font-weight:700;text-transform:uppercase;margin-bottom:6px;color:#666}
.info-value{font-size:18px;font-weight:800}
.footer{margin-top:30px;border-top:1px solid #ddd;padding-top:12px;text-align:center;font-size:8px;color:#999}
.divider{height:1px;background:#e5e7eb;margin:12px 0}
</style></head><body><div class="container">
<div class="header"><div><h1>${empresa}</h1><p style="font-size:10px;color:#666">Dashboard - ${deptFilter||'Todos'}</p></div>
<div style="font-size:10px;text-align:right"><p><strong>Emitido em:</strong> ${new Date().toLocaleDateString('pt-BR')}</p></div></div>
<div class="hero"><div class="emoji">${cls.emoji}</div><h2>${generalAvg.toFixed(1)}%</h2><div class="pill">${cls.text}</div></div>
<div class="metrics">${PILLARS.map((p,i)=>{const pc=classify(scores[i]);const w=Math.min(Math.max(scores[i],0),100);return`<div class="metric-card"><div class="metric-header"><div class="metric-label" style="color:${pc.color}">${p}</div></div><div class="metric-value" style="color:${pc.color}">${scores[i].toFixed(1)}%</div><div class="progress-bar"><div class="progress-fill" style="width:${w}%;background:${pc.color}"></div></div><div class="metric-classification" style="color:${pc.color}">${pc.text}</div></div>`;}).join('')}</div>
<div class="divider"></div>
<div class="areas"><div class="area-card"><p class="area-label">Escritório</p><p class="area-value">${officeAvg.toFixed(1)}%</p></div><div class="area-card"><p class="area-label">Área Comum</p><p class="area-value">${commonAvg.toFixed(1)}%</p></div></div>
<div class="divider"></div>
<div class="additional-cards"><div class="info-card"><p class="info-label">Classificação</p><p class="info-value" style="color:${cls.color}">${cls.emoji} ${cls.text}</p></div><div class="info-card"><p class="info-label">Auditorias</p><p class="info-value">${audits.length}</p></div><div class="info-card"><p class="info-label">Última Auditoria</p><p class="info-value" style="font-size:12px">${lastAuditDate}</p></div></div>
<div class="footer"><p>${empresa} · Gerado em ${new Date().toLocaleDateString('pt-BR')}</p></div>
</div></body></html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const printWin=window.open(url,'_blank');
  if(printWin){printWin.onload=()=>{printWin.print()}}
  else{alert('Não foi possível abrir o PDF. Verifique o bloqueador de pop-ups.')}
}
