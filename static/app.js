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
  {checklist:'Escritório',senso:'Utilização',item_number:'1.5',question:'A pontuação da verificação está visível e atualizada?',criterion:'Quadro de verificação atualizado'},
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
  {checklist:'Escritório',senso:'Disciplina',item_number:'4.2',question:'Organização durante a verificação',criterion:'Setor permanece organizado'},
  {checklist:'Escritório',senso:'Disciplina',item_number:'4.3',question:'Atendimento ao responsável pela verificação',criterion:'Equipe receptiva e prestativa'},
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

  if(nav==='selos'){renderSelosTab()}
  if(nav==='configuracoes'){renderUsersSection();renderActivityLogSection()}
  if(nav==='manual'){renderManualTab()}
  if(nav==='auditoria'){populateAuditorSelect()}

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
function refreshAll(){updateDeptSelects();renderDeptTable();renderCriteriaTable();updateDashboard();renderReports();renderRanking();loadConfigUI();if(document.getElementById('tab-selos').classList.contains('active'))renderSelosTab()}

function updateDeptSelects(){
  const depts=getDepts().map(d=>d.name);
  [['dept-select-dash','Todos'],['audit-dept','Selecione...'],['rel-dept','Todos Departamentos']].forEach(([id,ph])=>{
    const sel=document.getElementById(id);if(!sel)return;
    const cur=sel.value;sel.innerHTML=`<option value="">${ph}</option>`;
    depts.forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d;sel.appendChild(o)});
    if(cur&&depts.includes(cur))sel.value=cur;
  });
  const selosSel=document.getElementById('selos-dept-select');
  if(selosSel){
    const cur=selosSel.value;
    selosSel.innerHTML='<option value="">Selecione...</option>';
    depts.forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d;selosSel.appendChild(o)});
    if(getAudits().some(a=>a.department==='Área Comum')){const o=document.createElement('option');o.value='Área Comum';o.textContent='Área Comum';selosSel.appendChild(o)}
    if(cur&&[...selosSel.options].some(o=>o.value===cur))selosSel.value=cur;
    else if(!cur&&depts.length)selosSel.value=depts[0];
  }
}

// ===== DASHBOARD =====
function auditInSeason(dateStr,season){
  if(!season)return true;
  if(!dateStr||dateStr.length<4)return false;
  return dateStr.slice(0,4)===season;
}

function populateSeasonSelect(){
  const sel=document.getElementById('dash-season-select');
  if(!sel)return;
  const years=[...new Set(getAudits().map(a=>(a.audit_date||'').slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const cur=sel.value;
  sel.innerHTML='<option value="">Todos os Anos</option>'+years.map(y=>`<option value="${y}">Ano ${y}</option>`).join('');
  if(cur&&years.includes(cur))sel.value=cur;
  else if(years.length)sel.value=years[0];
}

function updateDashboard(){
  populateSeasonSelect();
  const dept=document.getElementById('dept-select-dash').value;
  const season=document.getElementById('dash-season-select')?document.getElementById('dash-season-select').value:'';
  let audits=getAudits();
  if(season)audits=audits.filter(a=>auditInSeason(a.audit_date,season));

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
  document.getElementById('sector-emoji-2').textContent=avgCls.emoji;
  document.getElementById('sector-text-2').textContent=avgCls.text;
  document.getElementById('sector-text-2').style.color=avgCls.color;
  document.getElementById('dash-office-avg').textContent=officeAvg.toFixed(1)+'%';
  document.getElementById('dash-office-avg').style.color=classify(officeAvg).color;
  document.getElementById('dash-common-avg').textContent=commonAvg.toFixed(1)+'%';
  document.getElementById('dash-common-avg').style.color=classify(commonAvg).color;

  let scopedAudits=audits.filter(a=>a.audit_type==='Escritório'?(!dept||a.department===dept):true);
  document.getElementById('dash-audit-count').textContent=scopedAudits.length;

  if(scopedAudits.length){
    const sorted=[...scopedAudits].sort((a,b)=>(b.audit_timestamp||'0').localeCompare(a.audit_timestamp||'0'));
    document.getElementById('dash-last-audit').textContent=sorted[0].audit_date||'—';
  }else{
    document.getElementById('dash-last-audit').textContent='—';
  }

  renderHeroLevel(dept);
  renderEvolutionChart(dept,season);
}
document.getElementById('dept-select-dash').addEventListener('change',updateDashboard);
const dashSeasonSelectEl=document.getElementById('dash-season-select');
if(dashSeasonSelectEl)dashSeasonSelectEl.addEventListener('change',updateDashboard);

// ===== NÍVEL / XP (hero) =====
const DASHBOARD_LEVELS=[
  {key:'bronze',label:'BRONZE',min:0,icon:'🥉'},
  {key:'prata',label:'PRATA',min:0.3,icon:'🥈'},
  {key:'ouro',label:'OURO',min:0.6,icon:'🥇'},
  {key:'diamante',label:'DIAMANTE',min:0.85,icon:'💎'}
];
const DASHBOARD_MAX_XP=3000;

function renderHeroLevel(dept){
  const iconEl=document.getElementById('hero-level-icon');
  const labelEl=document.getElementById('hero-level-label-text');
  const fillEl=document.getElementById('hero-xp-fill');
  const xpLabelEl=document.getElementById('hero-xp-label');
  const nextEl=document.getElementById('hero-next-level');
  if(!iconEl)return;

  // Se nenhum departamento estiver selecionado, usa a média de todos.
  const depts=dept?[dept]:getDepts().map(d=>d.name);
  let ratios=depts.map(d=>{
    const statuses=computeAllBadgeStatuses(d);
    const unlocked=BADGES.filter(b=>statuses[b.id]&&statuses[b.id].unlocked).length;
    return BADGES.length?unlocked/BADGES.length:0;
  });
  const ratio=ratios.length?ratios.reduce((s,r)=>s+r,0)/ratios.length:0;

  let current=DASHBOARD_LEVELS[0];
  DASHBOARD_LEVELS.forEach(l=>{if(ratio>=l.min)current=l});
  const idx=DASHBOARD_LEVELS.indexOf(current);
  const next=DASHBOARD_LEVELS[idx+1]||null;

  const xp=Math.round(ratio*DASHBOARD_MAX_XP);
  const nextXp=next?Math.round(next.min*DASHBOARD_MAX_XP):DASHBOARD_MAX_XP;
  const barFrom=Math.round(current.min*DASHBOARD_MAX_XP);
  const barTo=next?nextXp:DASHBOARD_MAX_XP;
  const barFrac=barTo>barFrom?Math.min(1,Math.max(0,(xp-barFrom)/(barTo-barFrom))):1;

  iconEl.textContent=current.icon;
  labelEl.textContent=current.label;
  fillEl.style.width=(barFrac*100)+'%';
  xpLabelEl.textContent=`${xp.toLocaleString('pt-BR')} / ${nextXp.toLocaleString('pt-BR')} XP`;
  nextEl.innerHTML=next?`<i data-lucide="gem" class="w-3.5 h-3.5"></i><span>Próximo nível: ${next.label}</span>`:`<i data-lucide="crown" class="w-3.5 h-3.5"></i><span>Nível máximo atingido!</span>`;
  lucide.createIcons();
}

// ===== GRÁFICO EVOLUÇÃO GERAL =====
function renderEvolutionChart(dept,season){
  const wrap=document.getElementById('evo-chart-wrap');
  if(!wrap)return;
  let audits=getAudits().filter(a=>a.audit_type==='Escritório');
  if(dept)audits=audits.filter(a=>a.department===dept);
  if(season)audits=audits.filter(a=>auditInSeason(a.audit_date,season));

  const byMonth={};
  audits.forEach(a=>{
    const d=a.audit_date;if(!d)return;
    const key=d.slice(0,7); // YYYY-MM
    if(!byMonth[key])byMonth[key]={sum:0,count:0};
    byMonth[key].sum+=parseFloat(a.overall_average||0);
    byMonth[key].count++;
  });
  const months=Object.keys(byMonth).sort();
  if(months.length<2){
    wrap.innerHTML='<p class="text-xs text-gray-400 text-center py-10">Dados insuficientes para exibir a evolução (é necessário histórico em pelo menos 2 meses).</p>';
    return;
  }
  const monthNames=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const points=months.map(m=>({label:monthNames[parseInt(m.slice(5,7),10)-1],value:byMonth[m].sum/byMonth[m].count}));

  const W=560,H=170,padL=34,padR=10,padT=10,padB=22;
  const plotW=W-padL-padR,plotH=H-padT-padB;
  const xStep=points.length>1?plotW/(points.length-1):0;
  const yFor=v=>padT+plotH-(Math.max(0,Math.min(100,v))/100)*plotH;
  const xFor=i=>padL+i*xStep;

  const linePoints=points.map((p,i)=>`${xFor(i)},${yFor(p.value)}`).join(' ');
  const areaPoints=`${padL},${padT+plotH} ${linePoints} ${padL+plotW},${padT+plotH}`;
  const gridLines=[100,75,50].map(v=>`<line x1="${padL}" y1="${yFor(v)}" x2="${padL+plotW}" y2="${yFor(v)}" stroke="#f1f5f9" stroke-width="1"/><text x="2" y="${yFor(v)+3}" font-size="9" fill="#9ca3af" font-weight="700">${v}%</text>`).join('');
  const labels=points.map((p,i)=>`<text x="${xFor(i)}" y="${H-4}" font-size="9" fill="#9ca3af" font-weight="700" text-anchor="middle">${p.label}</text>`).join('');
  const dots=points.map((p,i)=>`<circle cx="${xFor(i)}" cy="${yFor(p.value)}" r="${i===points.length-1?4.5:3}" fill="#16a34a" stroke="#fff" stroke-width="1.5"/>`).join('');

  wrap.innerHTML=`<svg viewBox="0 0 ${W} ${H}" class="w-full" style="max-height:190px">
    <defs><linearGradient id="evoGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2D6A4F" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#2D6A4F" stop-opacity="0"/>
    </linearGradient></defs>
    ${gridLines}
    <polygon points="${areaPoints}" fill="url(#evoGrad)"/>
    <polyline points="${linePoints}" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

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
  if(!selectedType){errElem.textContent='Selecione um tipo de verificação.';errElem.classList.remove('hidden');return}
  if(!auditor){errElem.textContent='Informe o nome do responsável pela verificação.';errElem.classList.remove('hidden');return}
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
      auditResponses[key]={response:null,observation:'',photos:[],entity_id:c.entity_id};
      const row=document.createElement('div');row.className='p-3 bg-gray-50 rounded-lg mb-2';
      row.innerHTML=`<div class="mb-1"><span class="text-xs font-bold text-emerald-700 mr-2">${c.item_number}</span><span class="text-sm font-medium text-gray-800">${c.question}</span></div>${c.criterion?`<p class="text-xs text-gray-500 mb-2">${c.criterion}</p>`:''}<div class="flex gap-2 flex-wrap mb-2"><button type="button" class="response-btn px-3 py-1.5 text-xs font-semibold border rounded-lg" data-key="${key}" data-val="atende">✅ Atende</button><button type="button" class="response-btn px-3 py-1.5 text-xs font-semibold border rounded-lg" data-key="${key}" data-val="parcial">🟡 Parcial</button><button type="button" class="response-btn px-3 py-1.5 text-xs font-semibold border rounded-lg" data-key="${key}" data-val="nao">❌ Não Atende</button></div><div class="mb-2"><input class="obs-input w-full border rounded px-2 py-1 text-xs" placeholder="Observação" data-key="${key}"></div><div class="mb-1"><div class="flex items-center gap-2 flex-wrap"><label class="photo-btn cursor-pointer flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border rounded-lg bg-white hover:bg-gray-100" data-key="${key}"><i data-lucide="camera" class="w-3.5 h-3.5"></i> <span class="photo-btn-label">Foto (0/3)</span><input type="file" accept="image/*" capture="environment" class="photo-input hidden" data-key="${key}"></label></div><div class="photo-thumbs flex gap-2 flex-wrap mt-2" data-key="${key}"></div><p class="photo-status text-[11px] text-gray-400 mt-1 hidden" data-key="${key}"></p></div>`;
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
  container.querySelectorAll('.photo-input').forEach(inp=>{inp.addEventListener('change',async(e)=>{
    const key=inp.dataset.key;
    const file=e.target.files[0];
    inp.value=''; // limpa logo para permitir escolher a mesma foto de novo e evitar estado travado
    if(!file)return;
    if(!auditResponses[key].photos)auditResponses[key].photos=[];
    if(auditResponses[key].photos.length>=3){alert('Máximo de 3 fotos por critério.');return}
    if(file.size>10*1024*1024){alert('Essa foto é muito grande (máx. 10MB). Tente outra ou tire com menos resolução.');return}
    const statusEl=document.querySelector(`.photo-status[data-key="${cssEscape(key)}"]`);
    if(statusEl){statusEl.textContent='Processando foto...';statusEl.classList.remove('hidden')}
    try{
      const compressed=await compressImage(file,1280,0.72);
      auditResponses[key].photos.push(compressed);
      renderPhotoThumbs(key);
      if(statusEl)statusEl.classList.add('hidden');
    }catch(err){
      console.error('Erro ao processar foto:',err);
      if(statusEl){statusEl.textContent='Não foi possível processar essa foto. Tente novamente.';statusEl.classList.remove('hidden')}
      else alert('Não foi possível processar essa foto. Tente novamente ou escolha outra imagem.');
    }
  })});
  container.querySelectorAll('.photo-thumbs').forEach(el=>renderPhotoThumbs(el.dataset.key));
  lucide.createIcons();
}

function cssEscape(s){return String(s).replace(/["\\]/g,'\\$&')}

function compressImage(file,maxDim,quality){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error||new Error('Falha ao ler arquivo'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Falha ao carregar imagem'));
      img.onload=()=>{
        try{
          let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
          if(!w||!h){reject(new Error('Imagem inválida'));return}
          if(w>maxDim||h>maxDim){
            if(w>h){h=Math.round(h*maxDim/w);w=maxDim}
            else{w=Math.round(w*maxDim/h);h=maxDim}
          }
          const canvas=document.createElement('canvas');
          canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext('2d');
          ctx.drawImage(img,0,0,w,h);
          const dataUrl=canvas.toDataURL('image/jpeg',quality);
          if(!dataUrl||dataUrl==='data:,'){reject(new Error('Falha ao gerar imagem comprimida'));return}
          resolve(dataUrl);
        }catch(err){reject(err)}
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoThumbs(key){
  const labelBtn=document.querySelector(`.photo-btn[data-key="${cssEscape(key)}"]`);
  if(!labelBtn)return;
  const row=labelBtn.closest('.p-3');
  const wrap=row.querySelector('.photo-thumbs');
  const label=labelBtn.querySelector('.photo-btn-label');
  const photos=(auditResponses[key]&&auditResponses[key].photos)||[];
  label.textContent=`Foto (${photos.length}/3)`;
  wrap.innerHTML=photos.map((p,i)=>`<div class="relative inline-block"><img src="${p}" class="w-14 h-14 object-cover rounded-lg border"><button type="button" class="photo-remove-btn absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none" data-key="${key}" data-idx="${i}">✕</button></div>`).join('');
  wrap.querySelectorAll('.photo-remove-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const k=btn.dataset.key;
      auditResponses[k].photos.splice(parseInt(btn.dataset.idx,10),1);
      renderPhotoThumbs(k);
    });
  });
  if(photos.length>=3){labelBtn.classList.add('opacity-50','pointer-events-none')}
  else{labelBtn.classList.remove('opacity-50','pointer-events-none')}
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

  const responsesClean={};keys.forEach(k=>{responsesClean[k]={response:auditResponses[k].response,observation:auditResponses[k].observation,photos:auditResponses[k].photos||[],entity_id:auditResponses[k].entity_id}});
  const photoCount=keys.reduce((sum,k)=>sum+((auditResponses[k].photos||[]).length),0);
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
    document.getElementById('audit-validation-msg').textContent='Erro ao salvar verificação: '+result.message;
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
    const canDelete=currentUserInfo&&currentUserInfo.isAdmin;
    div.innerHTML=`<div class="flex-1 min-w-0"><p class="font-bold text-sm">#${a.audit_number||'—'} ${a.department||'Área Comum'}</p><p class="text-xs text-gray-500 mt-1">${a.audit_date||'—'} · ${a.auditor||'—'}</p></div><div class="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 flex-shrink-0"><div class="text-right"><p class="text-xs font-bold text-gray-600">Nota Final</p><span class="font-extrabold text-lg" style="color:${cls.color}">${(a.overall_average||0).toFixed(1)}%</span></div><span class="text-xl">${cls.emoji}</span><button class="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg view-btn hover:bg-blue-700 transition">Visualizar</button><button class="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg pdf-btn hover:bg-red-700 transition">PDF</button>${canDelete?'<button class="px-3 py-1.5 bg-gray-100 text-red-600 border border-red-200 text-xs font-semibold rounded-lg delete-audit-btn hover:bg-red-50 transition flex items-center gap-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>':''}</div>`;
    div.querySelector('.view-btn').addEventListener('click',()=>openReport(a));
    div.querySelector('.pdf-btn').addEventListener('click',()=>generatePDF(a));
    const delBtn=div.querySelector('.delete-audit-btn');
    if(delBtn)delBtn.addEventListener('click',()=>openDeleteAuditConfirm(a));
    container.appendChild(div);
  });
  lucide.createIcons();
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
  document.getElementById('rel-type-label').textContent='Verificações de Escritório';
  document.getElementById('rel-type-selector').classList.add('hidden');
  document.getElementById('rel-filters-section').classList.add('show');
  renderReports();
});
document.getElementById('rel-btn-comum').addEventListener('click',()=>{
  window.currentReportType='Área Comum';
  document.getElementById('rel-type-label').textContent='Verificações de Área Comum';
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
  document.getElementById('report-title').textContent=`Verificação #${audit.audit_number||'—'} - ${audit.department||''}`;
  const cls=classify(audit.overall_average||0);
  let html=`<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 pb-4 border-b"><div class="text-center"><p class="text-xs font-bold text-gray-500">Departamento</p><p class="font-bold text-sm">${audit.department||'—'}</p></div><div class="text-center"><p class="text-xs font-bold text-gray-500">Responsável</p><p class="font-bold text-sm">${audit.auditor||'—'}</p></div><div class="text-center"><p class="text-xs font-bold text-gray-500">Tipo</p><p class="font-bold text-sm">${audit.audit_type||'—'}</p></div><div class="text-center"><p class="text-xs font-bold text-gray-500">Data</p><p class="font-bold text-sm">${audit.audit_date||'—'}</p></div></div>`;
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
        const photos=(r.photos&&r.photos.length)?r.photos:(r.photo?[r.photo]:[]);
        const thumbs=photos.length?`<div class="flex gap-1 mt-1">${photos.map(p=>`<img src="${p}" class="w-10 h-10 object-cover rounded border">`).join('')}</div>`:'';
        html+=`<div class="p-2 bg-gray-50 rounded text-xs"><div class="flex justify-between items-center"><span><strong>${crit?crit.item_number:''}</strong> ${crit?crit.question:eid}</span><span>${rL}${r.observation?' · '+r.observation:''}</span></div>${thumbs}</div>`
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
  document.getElementById('cfg-otimo').value=getConfig('otimo','95');
  document.getElementById('cfg-bom').value=getConfig('bom','80');
  document.getElementById('cfg-regular').value=getConfig('regular','60');
  document.getElementById('cfg-pdf-fotos').checked=getConfig('pdf_fotos','true')==='true';
  document.getElementById('cfg-pdf-obs').checked=getConfig('pdf_obs','true')==='true';
}
document.getElementById('save-config-btn').addEventListener('click',async()=>{
  const configs={otimo:document.getElementById('cfg-otimo').value,bom:document.getElementById('cfg-bom').value,regular:document.getElementById('cfg-regular').value,pdf_fotos:document.getElementById('cfg-pdf-fotos').checked?'true':'false',pdf_obs:document.getElementById('cfg-pdf-obs').checked?'true':'false'};
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
  const deptForReport=audit.department||'';
  const PILLAR_ICONS={'Utilização':'▦','Limpeza':'✦','Padronização':'▤','Disciplina':'◈'};

  let criteriaByPillar={};
  PILLARS.forEach(p=>criteriaByPillar[p]=[]);
  try{
    const responses=JSON.parse(audit.responses_json||'{}');
    Object.keys(responses).forEach(k=>{
      const eid=responses[k].entity_id;
      const crit=allData.find(x=>x.type==='criterion'&&x.entity_id===eid);
      if(!crit)return;
      const r=responses[k];
      const photos=(r.photos&&r.photos.length)?r.photos:(r.photo?[r.photo]:[]);
      criteriaByPillar[crit.senso].push({item:crit.item_number,question:crit.question,response:r.response,observation:r.observation,photos});
    });
  }catch(e){console.error('Erro ao processar critérios do PDF:',e)}

  const showPhotos=getConfig('pdf_fotos','true')==='true';

  // ---- Gráfico de evolução (histórico do departamento/tipo desta auditoria) ----
  let evoAudits=getAudits().filter(a=>a.audit_type===audit.audit_type);
  if(audit.audit_type==='Escritório')evoAudits=evoAudits.filter(a=>a.department===deptForReport);
  const byMonth={};
  evoAudits.forEach(a=>{
    const d=a.audit_date;if(!d)return;
    const key=d.slice(0,7);
    if(!byMonth[key])byMonth[key]={sum:0,count:0};
    byMonth[key].sum+=parseFloat(a.overall_average||0);
    byMonth[key].count++;
  });
  const monthKeys=Object.keys(byMonth).sort();
  const monthNames=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const evoPoints=monthKeys.map(m=>({label:monthNames[parseInt(m.slice(5,7),10)-1],value:byMonth[m].sum/byMonth[m].count}));
  let evoSvg='';
  if(evoPoints.length>=2){
    const W=480,H=150,padL=30,padR=8,padT=10,padB=20;
    const plotW=W-padL-padR,plotH=H-padT-padB;
    const xStep=plotW/(evoPoints.length-1);
    const yFor=v=>padT+plotH-(Math.max(0,Math.min(100,v))/100)*plotH;
    const xFor=i=>padL+i*xStep;
    const linePts=evoPoints.map((p,i)=>`${xFor(i)},${yFor(p.value)}`).join(' ');
    const areaPts=`${padL},${padT+plotH} ${linePts} ${padL+plotW},${padT+plotH}`;
    const grid=[100,75,50].map(v=>`<line x1="${padL}" y1="${yFor(v)}" x2="${padL+plotW}" y2="${yFor(v)}" stroke="#f1f5f9" stroke-width="1"/><text x="1" y="${yFor(v)+3}" font-size="8" fill="#9ca3af" font-weight="700">${v}%</text>`).join('');
    const labels=evoPoints.map((p,i)=>`<text x="${xFor(i)}" y="${H-4}" font-size="8" fill="#9ca3af" font-weight="700" text-anchor="middle">${p.label}</text>`).join('');
    const dots=evoPoints.map((p,i)=>`<circle cx="${xFor(i)}" cy="${yFor(p.value)}" r="${i===evoPoints.length-1?4:2.5}" fill="#16a34a" stroke="#fff" stroke-width="1.2"/>`).join('');
    evoSvg=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
      <defs><linearGradient id="evoGradAudit" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2D6A4F" stop-opacity=".35"/><stop offset="100%" stop-color="#2D6A4F" stop-opacity="0"/></linearGradient></defs>
      ${grid}<polygon points="${areaPts}" fill="url(#evoGradAudit)"/><polyline points="${linePts}" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}
    </svg>`;
  }else{
    evoSvg='<p class="evo-empty">Histórico insuficiente (mín. 2 meses com verificações) para exibir a evolução.</p>';
  }

  // ---- Selos conquistados pelo departamento desta auditoria ----
  let earnedBadges=[],totalBadgesCount=0;
  if(typeof BADGES!=='undefined'&&typeof computeAllBadgeStatuses==='function'&&deptForReport){
    totalBadgesCount=BADGES.length;
    const statuses=computeAllBadgeStatuses(deptForReport);
    earnedBadges=BADGES.filter(b=>statuses[b.id]&&statuses[b.id].unlocked).map(b=>({...b,count:statuses[b.id].count}));
    earnedBadges.sort((a,b)=>b.count-a.count);
  }
  const badgesHtml=earnedBadges.length?earnedBadges.map(b=>
    `<div class="medal"><div class="medal-circle${tierForCount(b.count)?` tier-${tierForCount(b.count).key}`:''}">${b.icon}</div><p class="medal-name">${b.name}</p><p class="medal-count">${b.count}x conquistado</p></div>`
  ).join(''):'<p class="badges-empty">Nenhum selo conquistado ainda por este departamento. Continue evoluindo nas verificações! 🚀</p>';

  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório da Verificação #${audit.audit_number}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:9mm 11mm}
html,body{height:100%}
body{font-family:'DM Sans',Arial,sans-serif;color:#1f2937;line-height:1.35;font-size:12.5px}
.page{min-height:279mm;display:flex;flex-direction:column}
.page-break{page-break-before:always}

.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #10261D;padding-bottom:10px;margin-bottom:12px}
.header .brand{display:flex;align-items:center;gap:10px}
.header .brand-mark{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#10261D,#1B4332);color:#58D68D;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px}
.header h1{font-size:18px;font-weight:800;color:#10261D;letter-spacing:.3px}
.header .sub{font-size:9.5px;color:#6b7280;font-weight:600;margin-top:1px}
.header .meta{text-align:right;font-size:9px;color:#6b7280;font-weight:600;line-height:1.5}
.header .meta strong{color:#374151}

.hero{background:linear-gradient(135deg,#10261D,#1B4332);border-radius:13px;padding:16px 20px;color:#fff;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:14px}
.hero-left{flex:1}
.hero-left .dept-tag{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);padding:3px 11px;border-radius:999px;font-size:9.5px;font-weight:700;margin-bottom:6px}
.hero-left h2{font-size:14.5px;font-weight:700;color:rgba(255,255,255,.85)}
.hero-left p{font-size:9.5px;color:rgba(255,255,255,.6);margin-top:3px}
.hero-right{text-align:center;flex-shrink:0}
.hero-right .emoji{font-size:27px;line-height:1}
.hero-right .value{font-size:29px;font-weight:900;line-height:1.1}
.hero-right .pill{display:inline-block;margin-top:3px;background:rgba(255,255,255,.15);padding:3px 12px;border-radius:999px;font-size:9.5px;font-weight:800;letter-spacing:.5px}

.section-label{font-size:9px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:#6b7280;margin:0 0 7px 2px}

.main-grid{display:grid;grid-template-columns:1fr 215px;gap:12px;margin-bottom:12px}
.metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px}
.metric-card{border:1px solid #e5e7eb;border-radius:11px;padding:12px;background:#fafafa}
.metric-header{display:flex;align-items:center;gap:7px;margin-bottom:8px}
.metric-icon{width:21px;height:21px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0}
.metric-label{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:#374151}
.metric-value{font-size:21px;font-weight:900;margin-bottom:7px}
.progress-bar{width:100%;height:7px;background:#eceff2;border-radius:4px;overflow:hidden;margin-bottom:6px}
.progress-fill{height:100%;border-radius:4px}
.metric-classification{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px}

.evo-card{border:1px solid #e5e7eb;border-radius:11px;padding:12px 12px 6px;background:#fff}
.evo-empty{font-size:9.5px;color:#9ca3af;font-style:italic;padding:20px 0;text-align:center}

.side-col{display:flex;flex-direction:column;gap:9px}
.side-info-card{border:1px solid #e5e7eb;border-radius:11px;padding:11px 13px;background:#fafafa}
.side-info-label{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:#6b7280;margin-bottom:3px}
.side-info-value{font-size:13.5px;font-weight:900;color:#1f2937}

.badges-section{border:2px solid #f3f4f6;border-radius:13px;padding:14px 18px;background:linear-gradient(180deg,#fffdf5,#fff);page-break-inside:avoid}
.badges-section-title{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:900;color:#92400e;margin-bottom:11px;letter-spacing:.2px}
.badges-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:10px 6px}
.medal{text-align:center}
.medal-circle{width:36px;height:36px;border-radius:50%;margin:0 auto 5px;background:linear-gradient(135deg,#e9d189,#D4AF37);display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:inset 0 -2px 0 rgba(0,0,0,.12),0 2px 6px rgba(212,175,55,.35);border:3px solid #e5e7eb}
.medal-circle.tier-bronze{border-color:#cd7f32}
.medal-circle.tier-prata{border-color:#a8adb4}
.medal-circle.tier-ouro{border-color:#C9A227}
.medal-circle.tier-diamante{border-color:#4FC3F7}
.medal-name{font-size:7.8px;font-weight:800;color:#374151;line-height:1.15}
.medal-count{font-size:7px;font-weight:700;color:#b45309;margin-top:1px}
.badges-empty{font-size:10.5px;color:#9ca3af;font-style:italic}

.footer{margin-top:12px;padding-top:9px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;font-size:8.5px;color:#9ca3af;font-weight:600}

.title{text-align:center;font-size:18px;font-weight:800;color:#10261D;margin-bottom:16px;text-transform:uppercase}
.criteria-section{margin-bottom:20px;page-break-inside:avoid}
.criteria-title{font-size:12px;font-weight:700;color:#166534;margin-bottom:8px;border-bottom:2px solid #166534;padding-bottom:4px}
.criteria-item{background:#f9fafb;border-left:4px solid #2D6A4F;padding:10px 12px;margin-bottom:6px;border-radius:4px;font-size:9px}
.criteria-item.atende{border-left-color:#16a34a;background:#dcfce7}
.criteria-item.parcial{border-left-color:#ca8a04;background:#fef9c3}
.criteria-item.nao{border-left-color:#dc2626;background:#fee2e2}
.criteria-obs{font-size:8px;color:#666;margin-top:2px;margin-left:16px;padding-left:8px;border-left:2px solid #ddd}
.criteria-photo{margin-top:6px;margin-left:16px;display:flex;gap:6px;flex-wrap:wrap}
.criteria-photo img{max-width:150px;max-height:110px;border-radius:6px;border:1px solid #ddd;object-fit:cover}
.divider{height:1px;background:#e5e7eb;margin:16px 0}
</style></head><body>

<div class="page">
  <div class="header">
    <div class="brand">
      <div class="brand-mark">MS</div>
      <div><h1>${empresa}</h1><p class="sub">Relatório de Desempenho · Verificações 5S</p></div>
    </div>
    <div class="meta">
      <p><strong>Verificação:</strong> #${audit.audit_number||'—'}</p>
      <p><strong>Emitido em:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</p>
    </div>
  </div>

  <div class="hero">
    <div class="hero-left">
      <span class="dept-tag">${(deptForReport||'—').toUpperCase()}</span>
      <h2>Como foi essa verificação?</h2>
      <p>Verificação #${audit.audit_number||'—'} · ${audit.audit_date||'—'}</p>
    </div>
    <div class="hero-right">
      <div class="emoji">${cls.emoji}</div>
      <div class="value">${(audit.overall_average||0).toFixed(1)}%</div>
      <div class="pill">${cls.text}</div>
    </div>
  </div>

  <div class="main-grid">
    <div>
      <p class="section-label">Sensos Avaliados</p>
      <div class="metrics">${PILLARS.map((p,i)=>{const pc=classify(scores[i]);const w=Math.min(Math.max(scores[i],0),100);return`<div class="metric-card"><div class="metric-header"><div class="metric-icon" style="background:${pc.color}">${PILLAR_ICONS[p]||''}</div><div class="metric-label">${p}</div></div><div class="metric-value" style="color:${pc.color}">${scores[i].toFixed(1)}%</div><div class="progress-bar"><div class="progress-fill" style="width:${w}%;background:${pc.color}"></div></div><div class="metric-classification" style="color:${pc.color}">${pc.emoji} ${pc.text}</div></div>`;}).join('')}</div>
      <p class="section-label">Evolução Geral · ${deptForReport||'—'}</p>
      <div class="evo-card">${evoSvg}</div>
    </div>
    <div class="side-col">
      <div class="side-info-card"><p class="side-info-label">Tipo de Verificação</p><p class="side-info-value">${audit.audit_type||'—'}</p></div>
      <div class="side-info-card"><p class="side-info-label">Departamento</p><p class="side-info-value">${deptForReport||'—'}</p></div>
      <div class="side-info-card"><p class="side-info-label">Data</p><p class="side-info-value">${audit.audit_date||'—'}</p></div>
      <div class="side-info-card"><p class="side-info-label">Responsável pela Verificação</p><p class="side-info-value">${audit.auditor||'—'}</p></div>
    </div>
  </div>

  <div class="badges-section">
    <div class="badges-section-title">🏅 Selos Conquistados · ${deptForReport||'—'}${totalBadgesCount?` <span style="font-weight:700;color:#a16207">(${earnedBadges.length} de ${totalBadgesCount})</span>`:''}</div>
    <div class="badges-grid">${badgesHtml}</div>
  </div>

  <div class="footer"><span>${empresa} · Missão Simplificar · Verificações 5S</span><span>Gerado automaticamente em ${new Date().toLocaleDateString('pt-BR')}</span></div>
</div>

<div class="page page-break">
<div class="title">Relatório da Verificação 5S</div>
${Object.keys(criteriaByPillar).map(pillar=>{
  const items=criteriaByPillar[pillar];
  if(!items.length)return'';
  return`<div class="criteria-section"><div class="criteria-title">● ${pillar}</div>${items.map(item=>{
    const rClass=item.response==='atende'?'atende':item.response==='parcial'?'parcial':'nao';
    const rLabel=item.response==='atende'?'✅ ATENDE':item.response==='parcial'?'🟡 PARCIAL':'❌ NÃO ATENDE';
    const photosHtml=(showPhotos&&item.photos&&item.photos.length)?`<div class="criteria-photo">${item.photos.map(p=>`<img src="${p}">`).join('')}</div>`:'';
    return`<div class="criteria-item ${rClass}"><span><strong>${item.item}</strong> ${item.question}</span> <strong>${rLabel}</strong>${item.observation?`<div class="criteria-obs"><strong>Observação:</strong> ${item.observation}</div>`:''}${photosHtml}</div>`;
  }).join('')}</div>`;
}).join('')}
<div class="footer"><p><strong>${empresa}</strong> · Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</p></div>
</div>
</body></html>`;

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
  let scopedAudits=audits.filter(a=>a.audit_type==='Escritório'?(!deptFilter||a.department===deptFilter):true);
  let lastAuditDate='—';
  if(scopedAudits.length){const sorted=[...scopedAudits].sort((a,b)=>(b.audit_timestamp||'0').localeCompare(a.audit_timestamp||'0'));lastAuditDate=sorted[0].audit_date||'—'}

  const PILLAR_ICONS={'Utilização':'▦','Limpeza':'✦','Padronização':'▤','Disciplina':'◈'};

  // ---- Nível (mesma lógica da Coleção de Selos) ----
  let levelBlockHtml='';
  if(typeof BADGES!=='undefined'&&typeof computeAllBadgeStatuses==='function'&&typeof DASHBOARD_LEVELS!=='undefined'){
    const depts=deptFilter?[deptFilter]:getDepts().map(d=>d.name);
    const ratios=depts.map(d=>{
      const statuses=computeAllBadgeStatuses(d);
      const unlocked=BADGES.filter(b=>statuses[b.id]&&statuses[b.id].unlocked).length;
      return BADGES.length?unlocked/BADGES.length:0;
    });
    const ratio=ratios.length?ratios.reduce((s,r)=>s+r,0)/ratios.length:0;
    let current=DASHBOARD_LEVELS[0];
    DASHBOARD_LEVELS.forEach(l=>{if(ratio>=l.min)current=l});
    levelBlockHtml=`<div class="hero-level"><p class="hero-level-lbl">NÍVEL ATUAL</p><div class="hero-level-val">${current.icon} ${current.label}</div></div>`;
  }

  // ---- Gráfico de evolução (mesmo cálculo do dashboard) ----
  let evoAudits=getAudits().filter(a=>a.audit_type==='Escritório');
  if(deptFilter)evoAudits=evoAudits.filter(a=>a.department===deptFilter);
  const byMonth={};
  evoAudits.forEach(a=>{
    const d=a.audit_date;if(!d)return;
    const key=d.slice(0,7);
    if(!byMonth[key])byMonth[key]={sum:0,count:0};
    byMonth[key].sum+=parseFloat(a.overall_average||0);
    byMonth[key].count++;
  });
  const monthKeys=Object.keys(byMonth).sort();
  const monthNames=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const evoPoints=monthKeys.map(m=>({label:monthNames[parseInt(m.slice(5,7),10)-1],value:byMonth[m].sum/byMonth[m].count}));
  let evoSvg='';
  if(evoPoints.length>=2){
    const W=480,H=150,padL=30,padR=8,padT=10,padB=20;
    const plotW=W-padL-padR,plotH=H-padT-padB;
    const xStep=plotW/(evoPoints.length-1);
    const yFor=v=>padT+plotH-(Math.max(0,Math.min(100,v))/100)*plotH;
    const xFor=i=>padL+i*xStep;
    const linePts=evoPoints.map((p,i)=>`${xFor(i)},${yFor(p.value)}`).join(' ');
    const areaPts=`${padL},${padT+plotH} ${linePts} ${padL+plotW},${padT+plotH}`;
    const grid=[100,75,50].map(v=>`<line x1="${padL}" y1="${yFor(v)}" x2="${padL+plotW}" y2="${yFor(v)}" stroke="#f1f5f9" stroke-width="1"/><text x="1" y="${yFor(v)+3}" font-size="8" fill="#9ca3af" font-weight="700">${v}%</text>`).join('');
    const labels=evoPoints.map((p,i)=>`<text x="${xFor(i)}" y="${H-4}" font-size="8" fill="#9ca3af" font-weight="700" text-anchor="middle">${p.label}</text>`).join('');
    const dots=evoPoints.map((p,i)=>`<circle cx="${xFor(i)}" cy="${yFor(p.value)}" r="${i===evoPoints.length-1?4:2.5}" fill="#16a34a" stroke="#fff" stroke-width="1.2"/>`).join('');
    evoSvg=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
      <defs><linearGradient id="evoGradPdf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2D6A4F" stop-opacity=".35"/><stop offset="100%" stop-color="#2D6A4F" stop-opacity="0"/></linearGradient></defs>
      ${grid}<polygon points="${areaPts}" fill="url(#evoGradPdf)"/><polyline points="${linePts}" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}
    </svg>`;
  }else{
    evoSvg='<p class="evo-empty">Histórico insuficiente (mín. 2 meses com verificações) para exibir a evolução.</p>';
  }

  // ---- Donut Média Geral ----
  const circ=2*Math.PI*46;
  const donutDash=(generalAvg/100)*circ;
  const donutSvg=`<svg viewBox="0 0 110 110" style="width:100%;height:100%;display:block;transform:rotate(-90deg)">
    <circle cx="55" cy="55" r="46" fill="none" stroke="#f3f4f6" stroke-width="12"/>
    <circle cx="55" cy="55" r="46" fill="none" stroke="${cls.color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${donutDash} ${circ}"/>
  </svg>`;

  // ---- Selos conquistados (rodapé, estilo medalha) ----
  let badgeSectionTitle='Selos Conquistados';
  let badgeDepts=deptFilter?[deptFilter]:getDepts().map(d=>d.name);
  let earnedBadges=[],totalBadgesCount=0;
  if(typeof BADGES!=='undefined'&&typeof computeAllBadgeStatuses==='function'){
    totalBadgesCount=BADGES.length;
    if(deptFilter){
      const statuses=computeAllBadgeStatuses(deptFilter);
      earnedBadges=BADGES.filter(b=>statuses[b.id]&&statuses[b.id].unlocked).map(b=>({...b,count:statuses[b.id].count}));
    }else{
      const seen={};
      badgeDepts.forEach(d=>{
        const statuses=computeAllBadgeStatuses(d);
        BADGES.forEach(b=>{if(statuses[b.id]&&statuses[b.id].unlocked){seen[b.id]=seen[b.id]||{...b,count:0,depts:0};seen[b.id].count+=statuses[b.id].count;seen[b.id].depts+=1}});
      });
      earnedBadges=Object.values(seen);
      badgeSectionTitle='Selos Conquistados · Todos os Departamentos';
    }
  }
  earnedBadges.sort((a,b)=>b.count-a.count);

  const badgesHtml=earnedBadges.length?earnedBadges.map(b=>
    `<div class="medal"><div class="medal-circle${(deptFilter&&tierForCount(b.count))?` tier-${tierForCount(b.count).key}`:''}">${b.icon}</div><p class="medal-name">${b.name}</p><p class="medal-count">${deptFilter?`${b.count}x conquistado`:`${b.depts} depto${b.depts>1?'s':''}`}</p></div>`
  ).join(''):'<p class="badges-empty">Nenhum selo conquistado ainda neste recorte. Continue evoluindo nas verificações! 🚀</p>';

  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dashboard - ${empresa}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:9mm 11mm}
html,body{height:100%}
body{font-family:'DM Sans',Arial,sans-serif;color:#1f2937;line-height:1.35;font-size:12.5px}
.page{min-height:279mm;display:flex;flex-direction:column}

.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #10261D;padding-bottom:10px;margin-bottom:12px}
.header .brand{display:flex;align-items:center;gap:10px}
.header .brand-mark{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#10261D,#1B4332);color:#58D68D;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px}
.header h1{font-size:18px;font-weight:800;color:#10261D;letter-spacing:.3px}
.header .sub{font-size:9.5px;color:#6b7280;font-weight:600;margin-top:1px}
.header .meta{text-align:right;font-size:9px;color:#6b7280;font-weight:600;line-height:1.5}
.header .meta strong{color:#374151}

.hero{background:linear-gradient(135deg,#10261D,#1B4332);border-radius:13px;padding:16px 20px;color:#fff;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:14px}
.hero-left{flex:1}
.hero-left .dept-tag{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);padding:3px 11px;border-radius:999px;font-size:9.5px;font-weight:700;margin-bottom:6px}
.hero-left h2{font-size:14.5px;font-weight:700;color:rgba(255,255,255,.85)}
.hero-left p{font-size:9.5px;color:rgba(255,255,255,.6);margin-top:3px}
.hero-level{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:8px 15px;text-align:center;flex-shrink:0}
.hero-level-lbl{font-size:7.5px;font-weight:800;letter-spacing:1px;color:rgba(255,255,255,.55)}
.hero-level-val{font-size:13.5px;font-weight:900;color:#fff;margin-top:2px;white-space:nowrap}
.hero-right{text-align:center;flex-shrink:0}
.hero-right .emoji{font-size:27px;line-height:1}
.hero-right .value{font-size:29px;font-weight:900;line-height:1.1}
.hero-right .pill{display:inline-block;margin-top:3px;background:rgba(255,255,255,.15);padding:3px 12px;border-radius:999px;font-size:9.5px;font-weight:800;letter-spacing:.5px}

.section-label{font-size:9px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:#6b7280;margin:0 0 7px 2px}

.main-grid{display:grid;grid-template-columns:1fr 215px;gap:12px;margin-bottom:12px}
.metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px}
.metric-card{border:1px solid #e5e7eb;border-radius:11px;padding:12px;background:#fafafa}
.metric-header{display:flex;align-items:center;gap:7px;margin-bottom:8px}
.metric-icon{width:21px;height:21px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0}
.metric-label{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:#374151}
.metric-value{font-size:21px;font-weight:900;margin-bottom:7px}
.progress-bar{width:100%;height:7px;background:#eceff2;border-radius:4px;overflow:hidden;margin-bottom:6px}
.progress-fill{height:100%;border-radius:4px}
.metric-classification{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px}

.evo-card{border:1px solid #e5e7eb;border-radius:11px;padding:12px 12px 6px;background:#fff}
.evo-empty{font-size:9.5px;color:#9ca3af;font-style:italic;padding:20px 0;text-align:center}

.side-col{display:flex;flex-direction:column;gap:9px}
.donut-card{border:1px solid #e5e7eb;border-radius:11px;padding:14px;text-align:center;display:flex;flex-direction:column;align-items:center;background:#fafafa}
.donut-wrap{position:relative;width:105px;height:105px;margin-bottom:6px}
.donut-label{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;color:${cls.color}}
.donut-sub{font-size:9.5px;font-weight:800;color:${cls.color}}
.side-info-card{border:1px solid #e5e7eb;border-radius:11px;padding:10px 12px;display:flex;align-items:center;gap:9px;background:#fafafa}
.side-info-icon{width:27px;height:27px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.side-info-label{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:#6b7280}
.side-info-value{font-size:14.5px;font-weight:900;color:#1f2937}
.side-info-row{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.side-info-row .side-info-card{flex-direction:column;text-align:center;align-items:center;padding:9px 5px}
.side-info-row .side-info-value{font-size:12px}

.badges-section{border:2px solid #f3f4f6;border-radius:13px;padding:14px 18px;background:linear-gradient(180deg,#fffdf5,#fff);page-break-inside:avoid}
.badges-section-title{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:900;color:#92400e;margin-bottom:11px;letter-spacing:.2px}
.badges-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:10px 6px}
.medal{text-align:center}
.medal-circle{width:36px;height:36px;border-radius:50%;margin:0 auto 5px;background:linear-gradient(135deg,#e9d189,#D4AF37);display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:inset 0 -2px 0 rgba(0,0,0,.12),0 2px 6px rgba(212,175,55,.35);border:3px solid #e5e7eb}
.medal-circle.tier-bronze{border-color:#cd7f32}
.medal-circle.tier-prata{border-color:#a8adb4}
.medal-circle.tier-ouro{border-color:#C9A227}
.medal-circle.tier-diamante{border-color:#4FC3F7}
.medal-name{font-size:7.8px;font-weight:800;color:#374151;line-height:1.15}
.medal-count{font-size:7px;font-weight:700;color:#b45309;margin-top:1px}
.badges-empty{font-size:10.5px;color:#9ca3af;font-style:italic}

.footer{margin-top:12px;padding-top:9px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;font-size:8.5px;color:#9ca3af;font-weight:600}
</style></head><body><div class="page">

<div class="header">
  <div class="brand">
    <div class="brand-mark">MS</div>
    <div><h1>${empresa}</h1><p class="sub">Relatório de Desempenho · Verificações 5S</p></div>
  </div>
  <div class="meta">
    <p><strong>Departamento:</strong> ${deptFilter||'Todos os Departamentos'}</p>
    <p><strong>Emitido em:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</p>
  </div>
</div>

<div class="hero">
  <div class="hero-left">
    <span class="dept-tag">${(deptFilter||'TODOS OS DEPARTAMENTOS').toUpperCase()}</span>
    <h2>Como está o desempenho geral?</h2>
    <p>Consolidado das últimas avaliações registradas no sistema.</p>
  </div>
  ${levelBlockHtml}
  <div class="hero-right">
    <div class="emoji">${cls.emoji}</div>
    <div class="value">${generalAvg.toFixed(1)}%</div>
    <div class="pill">${cls.text}</div>
  </div>
</div>

<div class="main-grid">
  <div style="display:flex;flex-direction:column">
    <p class="section-label">Sensos Avaliados</p>
    <div class="metrics">${PILLARS.map((p,i)=>{const pc=classify(scores[i]);const w=Math.min(Math.max(scores[i],0),100);return`<div class="metric-card"><div class="metric-header"><div class="metric-icon" style="background:${pc.color}">${PILLAR_ICONS[p]||''}</div><div class="metric-label">${p}</div></div><div class="metric-value" style="color:${pc.color}">${scores[i].toFixed(1)}%</div><div class="progress-bar"><div class="progress-fill" style="width:${w}%;background:${pc.color}"></div></div><div class="metric-classification" style="color:${pc.color}">${pc.emoji} ${pc.text}</div></div>`;}).join('')}</div>
    <p class="section-label">Evolução Geral</p>
    <div class="evo-card">${evoSvg}</div>
  </div>
  <div class="side-col">
    <div class="donut-card">
      <p class="section-label" style="margin-bottom:8px">Média Geral</p>
      <div class="donut-wrap">${donutSvg}<div class="donut-label">${generalAvg.toFixed(1)}%</div></div>
      <span class="donut-sub">${cls.emoji} ${cls.text}</span>
    </div>
    <div class="side-info-card"><div class="side-info-icon" style="background:#eff6ff">🏢</div><div><p class="side-info-label">Escritório</p><p class="side-info-value" style="color:${classify(officeAvg).color}">${officeAvg.toFixed(1)}%</p></div></div>
    <div class="side-info-card"><div class="side-info-icon" style="background:#fffbeb">👥</div><div><p class="side-info-label">Área Comum</p><p class="side-info-value" style="color:${classify(commonAvg).color}">${commonAvg.toFixed(1)}%</p></div></div>
    <div class="side-info-row">
      <div class="side-info-card"><p class="side-info-label">Verificações</p><p class="side-info-value">${scopedAudits.length}</p></div>
      <div class="side-info-card"><p class="side-info-label">Última</p><p class="side-info-value" style="font-size:9px">${lastAuditDate}</p></div>
    </div>
  </div>
</div>

<div class="badges-section">
  <div class="badges-section-title">🏅 ${badgeSectionTitle}${totalBadgesCount?` <span style="font-weight:700;color:#a16207">(${earnedBadges.length} de ${totalBadgesCount})</span>`:''}</div>
  <div class="badges-grid">${badgesHtml}</div>
</div>

<div class="footer"><span>${empresa} · Missão Simplificar · Verificações 5S</span><span>Gerado automaticamente em ${new Date().toLocaleDateString('pt-BR')}</span></div>
</div></body></html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const printWin=window.open(url,'_blank');
  if(printWin){printWin.onload=()=>{printWin.print()}}
  else{alert('Não foi possível abrir o PDF. Verifique o bloqueador de pop-ups.')}
}

// ===== SELOS (BADGES) =====
const BADGE_TIERS=[
  {key:'bronze',label:'Bronze',min:1,icon:'🥉'},
  {key:'prata',label:'Prata',min:5,icon:'🥈'},
  {key:'ouro',label:'Ouro',min:10,icon:'🥇'},
  {key:'diamante',label:'Diamante',min:20,icon:'💎'}
];
function tierForCount(count){let t=null;BADGE_TIERS.forEach(tier=>{if(count>=tier.min)t=tier});return t}
function nextTierForCount(count){return BADGE_TIERS.find(tier=>count<tier.min)||null}

const BADGE_CATEGORIES=[
  {key:'organizacao',label:'Organização',icon:'🧹'},
  {key:'limpeza',label:'Limpeza',icon:'🧽'},
  {key:'padronizacao',label:'Padronização',icon:'📁'},
  {key:'disciplina',label:'Disciplina',icon:'🛡️'},
  {key:'especiais',label:'Especiais',icon:'⭐'}
];

const BADGES=[
  // Organização (Senso Utilização)
  {id:'mestre-organizacao',category:'organizacao',name:'Mestre da Organização',icon:'🧺',stars:5,type:'pillar',field:'utilization_score',threshold:100,description:'Obtenha 100% no Senso Utilização em uma verificação.'},
  {id:'mesa-exemplar',category:'organizacao',name:'Mesa Exemplar',icon:'🗂️',stars:3,type:'criterion',keywords:['mesa','bancada'],description:'Tenha todos os critérios sobre mesas e bancadas avaliados como "Atende".'},
  {id:'armarios-em-ordem',category:'organizacao',name:'Armários em Ordem',icon:'🗄️',stars:3,type:'criterion',keywords:['armário','armários','arquivo','escaninho','prateleira','locker'],description:'Tenha todos os critérios sobre armários, arquivos e prateleiras avaliados como "Atende".'},
  {id:'organizacao-total',category:'organizacao',name:'Organização Total',icon:'🏅',stars:5,type:'special',customType:'pillarStreak',field:'utilization_score',threshold:3,description:'Obtenha 100% no Senso Utilização em 3 verificações.'},

  // Limpeza
  {id:'mestre-limpeza',category:'limpeza',name:'Mestre da Limpeza',icon:'🧽',stars:4,type:'pillar',field:'cleanliness_score',threshold:100,description:'Obtenha 100% no Senso Limpeza em uma verificação.'},
  {id:'copa-modelo',category:'limpeza',name:'Copa Modelo',icon:'☕',stars:3,type:'criterion',keywords:['cozinha','copa'],description:'Tenha todos os critérios sobre cozinha/copa avaliados como "Atende".'},
  {id:'banheiro-exemplar',category:'limpeza',name:'Banheiro Exemplar',icon:'🚻',stars:3,type:'criterion',keywords:['banheiro'],description:'Tenha todos os critérios sobre banheiros avaliados como "Atende".'},
  {id:'limpeza-absoluta',category:'limpeza',name:'Limpeza Absoluta',icon:'✨',stars:5,type:'special',customType:'pillarStreak',field:'cleanliness_score',threshold:3,description:'Obtenha 100% no Senso Limpeza em 3 verificações.'},

  // Padronização
  {id:'organizacao-digital',category:'padronizacao',name:'Organização Digital',icon:'💻',stars:3,type:'criterion',keywords:['digital','onedrive','sharepoint','pasta do setor'],description:'Tenha todos os critérios de organização digital avaliados como "Atende".'},
  {id:'arquivos-padronizados',category:'padronizacao',name:'Arquivos Padronizados',icon:'📁',stars:3,type:'criterion',keywords:['nomenclatura','nomes padronizados','padronização de arquivos','padronização de pastas'],description:'Tenha todos os critérios de padronização de arquivos e pastas avaliados como "Atende".'},
  {id:'equipamentos-identificados',category:'padronizacao',name:'Equipamentos Identificados',icon:'🖥️',stars:3,type:'criterion',keywords:['monitor','crachá','identificação de equipamentos'],description:'Tenha todos os critérios de identificação de equipamentos avaliados como "Atende".'},
  {id:'padronizacao-total',category:'padronizacao',name:'Padronização Total',icon:'🏅',stars:5,type:'pillar',field:'standardization_score',threshold:100,description:'Obtenha 100% no Senso Padronização em uma verificação.'},

  // Disciplina
  {id:'computador-seguro',category:'disciplina',name:'Computador Seguro',icon:'🔐',stars:3,type:'criterion',keywords:['bloqueado','segurança da informação'],description:'Tenha o critério de segurança da informação avaliado como "Atende".'},
  {id:'disciplina-total',category:'disciplina',name:'Disciplina Total',icon:'🛡️',stars:5,type:'pillar',field:'discipline_score',threshold:100,description:'Obtenha 100% no Senso Disciplina em uma verificação.'},
  {id:'plano-de-acao-em-dia',category:'disciplina',name:'Plano de Ação em Dia',icon:'📋',stars:3,type:'criterion',keywords:['plano de ação'],description:'Tenha o critério de plano de ação avaliado como "Atende".'},
  {id:'guardiao-5s',category:'disciplina',name:'Guardião do 5S',icon:'👑',stars:5,type:'special',customType:'pillarStreak',field:'discipline_score',threshold:5,description:'Obtenha 100% no Senso Disciplina em 5 verificações.'},

  // Especiais
  {id:'auditoria-perfeita',category:'especiais',name:'Verificação Perfeita',icon:'🏆',stars:5,type:'pillar',field:'overall_average',threshold:100,description:'Obtenha 100% de média geral em uma verificação.'},
  {id:'campeao-temporada',category:'especiais',name:'Campeão da Temporada',icon:'👑',stars:5,type:'special',customType:'topRanked',description:'Seja o departamento nº 1 no ranking geral.'},
  {id:'consistencia',category:'especiais',name:'Consistência',icon:'🔥',stars:4,type:'special',customType:'consecutiveAbove',threshold:90,streak:3,description:'Alcance 90%+ de média geral em 3 verificações seguidas.'},
  {id:'melhor-evolucao',category:'especiais',name:'Melhor Evolução',icon:'🚀',stars:4,type:'special',customType:'evolution',minGain:15,description:'Melhore sua média geral em pelo menos 15 pontos entre a primeira e a última verificação.'},
  {id:'lenda-missao',category:'especiais',name:'Lenda do Missão Simplificar',icon:'💎',stars:5,type:'special',customType:'legend',description:'Desbloqueie todos os outros selos.'},
];

function parseAuditResponses(audit){try{return JSON.parse(audit.responses_json||'{}')}catch(e){return{}}}

function auditMatchesCriterionBadge(audit,badge){
  const responses=parseAuditResponses(audit);
  const matching=getAllCriteria().filter(c=>{
    const text=((c.question||'')+' '+(c.criterion||'')).toLowerCase();
    return badge.keywords.some(k=>text.includes(k));
  });
  if(matching.length===0)return false;
  return matching.every(c=>{
    const key=Object.keys(responses).find(k=>responses[k].entity_id===c.entity_id);
    return key&&responses[key].response==='atende';
  });
}

function criterionBadgeProgress(audit,badge){
  if(!audit)return 0;
  const responses=parseAuditResponses(audit);
  const matching=getAllCriteria().filter(c=>{
    const text=((c.question||'')+' '+(c.criterion||'')).toLowerCase();
    return badge.keywords.some(k=>text.includes(k));
  });
  if(matching.length===0)return 0;
  const atende=matching.filter(c=>{
    const key=Object.keys(responses).find(k=>responses[k].entity_id===c.entity_id);
    return key&&responses[key].response==='atende';
  });
  return Math.round((atende.length/matching.length)*100);
}

function sortAuditsByDate(audits){return [...audits].sort((a,b)=>(a.audit_timestamp||a.audit_date||'').localeCompare(b.audit_timestamp||b.audit_date||''))}

// Retorna {unlocked,count,lastDate,lastValue,progress,progressLabel}
function getBadgeStatus(badge,deptAudits,deptName,allStatusesForLegend){
  const sorted=sortAuditsByDate(deptAudits);
  if(badge.type==='pillar'){
    const matches=sorted.filter(a=>parseFloat(a[badge.field]||0)>=badge.threshold);
    const best=sorted.reduce((m,a)=>Math.max(m,parseFloat(a[badge.field]||0)),0);
    const last=matches.length?matches[matches.length-1]:null;
    return{unlocked:matches.length>0,count:matches.length,lastDate:last?last.audit_date:null,
      lastValue:last?parseFloat(last[badge.field]||0):best,
      progress:Math.min(100,Math.round(best)),
      progressLabel:matches.length?null:`Melhor resultado: ${best.toFixed(1)}% (faltam ${Math.max(0,badge.threshold-best).toFixed(1)}%)`};
  }
  if(badge.type==='criterion'){
    const matches=sorted.filter(a=>auditMatchesCriterionBadge(a,badge));
    const last=matches.length?matches[matches.length-1]:null;
    const recentAudit=sorted.length?sorted[sorted.length-1]:null;
    const prog=matches.length?100:criterionBadgeProgress(recentAudit,badge);
    return{unlocked:matches.length>0,count:matches.length,lastDate:last?last.audit_date:null,
      lastValue:null,progress:prog,
      progressLabel:matches.length?null:(recentAudit?`${prog}% dos critérios relacionados atendidos`:'Ainda sem verificações avaliadas')};
  }
  // special
  if(badge.customType==='pillarStreak'){
    const matches=sorted.filter(a=>parseFloat(a[badge.field]||0)>=100);
    const last=matches.length?matches[matches.length-1]:null;
    return{unlocked:matches.length>=badge.threshold,count:matches.length,lastDate:last?last.audit_date:null,
      lastValue:matches.length,progress:Math.min(100,Math.round((matches.length/badge.threshold)*100)),
      progressLabel:`${matches.length} de ${badge.threshold} verificações com 100%`};
  }
  if(badge.customType==='consecutiveAbove'){
    let best=0,cur=0;
    sorted.forEach(a=>{if(parseFloat(a.overall_average||0)>=badge.threshold){cur++;best=Math.max(best,cur)}else{cur=0}});
    const last=sorted.length?sorted[sorted.length-1]:null;
    return{unlocked:best>=badge.streak,count:best>=badge.streak?1:0,lastDate:last?last.audit_date:null,
      lastValue:best,progress:Math.min(100,Math.round((best/badge.streak)*100)),
      progressLabel:`Sequência atual: ${cur} de ${badge.streak} verificações`};
  }
  if(badge.customType==='evolution'){
    if(sorted.length<2)return{unlocked:false,count:0,lastDate:null,lastValue:0,progress:0,progressLabel:'São necessárias ao menos 2 verificações.'};
    const gain=parseFloat(sorted[sorted.length-1].overall_average||0)-parseFloat(sorted[0].overall_average||0);
    return{unlocked:gain>=badge.minGain,count:gain>=badge.minGain?1:0,lastDate:sorted[sorted.length-1].audit_date,
      lastValue:gain,progress:Math.min(100,Math.round((Math.max(0,gain)/badge.minGain)*100)),
      progressLabel:`Evolução atual: ${gain>=0?'+':''}${gain.toFixed(1)} pontos`};
  }
  if(badge.customType==='topRanked'){
    const allDepts=getDepts().map(d=>d.name);
    const avgFor=(name)=>{
      const as=getAudits().filter(a=>a.department===name&&a.audit_type==='Escritório');
      if(!as.length)return -1;
      return as.reduce((s,a)=>s+parseFloat(a.overall_average||0),0)/as.length;
    };
    const ranking=allDepts.map(n=>({name:n,avg:avgFor(n)})).filter(r=>r.avg>=0).sort((a,b)=>b.avg-a.avg);
    const champion=ranking.length?ranking[0].name:null;
    const unlocked=deptName&&champion===deptName;
    const pos=ranking.findIndex(r=>r.name===deptName)+1;
    return{unlocked,count:unlocked?1:0,lastDate:sorted.length?sorted[sorted.length-1].audit_date:null,lastValue:pos,
      progress:unlocked?100:0,progressLabel:pos>0?`Posição atual no ranking: ${pos}º`:'Sem verificações suficientes'};
  }
  if(badge.customType==='legend'){
    const others=BADGES.filter(b=>b.id!==badge.id);
    const unlocked=others.length>0&&others.every(b=>allStatusesForLegend[b.id]&&allStatusesForLegend[b.id].unlocked);
    const unlockedCount=others.filter(b=>allStatusesForLegend[b.id]&&allStatusesForLegend[b.id].unlocked).length;
    return{unlocked,count:unlocked?1:0,lastDate:null,lastValue:unlockedCount,
      progress:Math.round((unlockedCount/others.length)*100),
      progressLabel:`${unlockedCount} de ${others.length} outros selos desbloqueados`};
  }
  return{unlocked:false,count:0,lastDate:null,lastValue:0,progress:0,progressLabel:''};
}

function computeAllBadgeStatuses(deptName){
  const deptAudits=getAudits().filter(a=>a.department===deptName);
  const base={};
  BADGES.filter(b=>b.customType!=='legend').forEach(b=>{base[b.id]=getBadgeStatus(b,deptAudits,deptName,null)});
  const legendBadge=BADGES.find(b=>b.customType==='legend');
  if(legendBadge)base[legendBadge.id]=getBadgeStatus(legendBadge,deptAudits,deptName,base);
  return base;
}

function overallLevelForRatio(ratio){
  if(ratio>=0.85)return{icon:'💎',label:'Diamante'};
  if(ratio>=0.6)return{icon:'🥇',label:'Ouro'};
  if(ratio>=0.3)return{icon:'🥈',label:'Prata'};
  return{icon:'🥉',label:'Bronze'};
}

let currentSelosDept='';
let currentSelosStatuses={};

function renderSelosTab(){
  const sel=document.getElementById('selos-dept-select');
  const dept=sel?sel.value:'';
  currentSelosDept=dept;
  const catsWrap=document.getElementById('selos-categories');
  const empty=document.getElementById('selos-empty');
  const headerDeptLabel=document.getElementById('selos-header-dept');

  if(!dept){
    catsWrap.innerHTML='';
    empty.classList.remove('hidden');
    headerDeptLabel.textContent='Selecione um departamento';
    document.getElementById('selos-total-count').textContent='0 de '+BADGES.length;
    document.getElementById('selos-total-fill').style.width='0%';
    document.getElementById('selos-total-pct').textContent='0%';
    document.getElementById('selos-level-badge').innerHTML='🥉 <span>Bronze</span>';
    return;
  }
  empty.classList.add('hidden');
  headerDeptLabel.textContent=dept;

  const statuses=computeAllBadgeStatuses(dept);
  currentSelosStatuses=statuses;
  const unlockedCount=BADGES.filter(b=>statuses[b.id].unlocked).length;
  const ratio=unlockedCount/BADGES.length;
  document.getElementById('selos-total-count').textContent=`${unlockedCount} de ${BADGES.length}`;
  document.getElementById('selos-total-fill').style.width=(ratio*100)+'%';
  document.getElementById('selos-total-pct').textContent=Math.round(ratio*100)+'%';
  const lvl=overallLevelForRatio(ratio);
  document.getElementById('selos-level-badge').innerHTML=`${lvl.icon} <span>${lvl.label}</span>`;

  catsWrap.innerHTML=BADGE_CATEGORIES.map(cat=>{
    const catBadges=BADGES.filter(b=>b.category===cat.key);
    const catUnlocked=catBadges.filter(b=>statuses[b.id].unlocked).length;
    const catRatio=catBadges.length?Math.round((catUnlocked/catBadges.length)*100):0;
    const cardsHtml=catBadges.map(b=>{
      const st=statuses[b.id];
      const tier=st.unlocked?tierForCount(st.count):null;
      const starsHtml='⭐'.repeat(b.stars);
      return `<div class="selo-card ${st.unlocked?'':'locked'}${tier?` tier-${tier.key}`:''}" data-badge-id="${b.id}">
        ${tier?`<span class="selo-tier-chip" title="${tier.label}">${tier.icon}</span>`:''}
        ${st.unlocked?'':'<span class="selo-lock-badge">🔒</span>'}
        <div class="selo-medal${tier?` tier-${tier.key}`:''}">${st.unlocked?b.icon:'🔒'}</div>
        <div class="selo-name">${b.name}</div>
        <div class="selo-stars">${st.unlocked?starsHtml:'&nbsp;'}</div>
      </div>`;
    }).join('');
    return `<div class="selo-category-block">
      <div class="selo-category-head">
        <span class="selo-category-title">${cat.icon} ${cat.label}</span>
        <span class="selo-category-count">${catUnlocked} / ${catBadges.length}</span>
      </div>
      <div class="selo-category-track"><div class="selo-category-fill" style="width:${catRatio}%"></div></div>
      <div class="selo-grid">${cardsHtml}</div>
    </div>`;
  }).join('');

  catsWrap.querySelectorAll('.selo-card').forEach(card=>{
    card.addEventListener('click',()=>openBadgeModal(card.dataset.badgeId));
  });
  lucide.createIcons();
}
document.getElementById('selos-dept-select').addEventListener('change',renderSelosTab);

function openBadgeModal(badgeId){
  const badge=BADGES.find(b=>b.id===badgeId);if(!badge)return;
  const st=currentSelosStatuses[badgeId];if(!st)return;
  const medal=document.getElementById('badge-modal-medal');
  const modalTier=st.unlocked?tierForCount(st.count):null;
  medal.textContent=st.unlocked?badge.icon:'🔒';
  medal.className='selo-modal-medal'+(st.unlocked?'':' locked')+(modalTier?` tier-${modalTier.key}`:'');
  document.getElementById('badge-modal-name').textContent=badge.name;
  document.getElementById('badge-modal-stars').innerHTML=st.unlocked?`${'⭐'.repeat(badge.stars)}${modalTier?` <span class="tier-badge-label tier-${modalTier.key}">${modalTier.icon} ${modalTier.label}</span>`:''}`:'';
  document.getElementById('badge-modal-desc').textContent=badge.description;

  const progressWrap=document.getElementById('badge-modal-progress-wrap');
  const statsWrap=document.getElementById('badge-modal-stats');
  const statusWrap=document.getElementById('badge-modal-status');

  if(st.unlocked){
    progressWrap.classList.add('hidden');
    const tier=modalTier;
    const next=nextTierForCount(st.count);
    let rows=`<div class="selo-modal-row"><span class="label">Conquistado</span><span class="value">${st.count}x</span></div>`;
    if(st.lastDate)rows+=`<div class="selo-modal-row"><span class="label">Última conquista</span><span class="value">${st.lastDate}</span></div>`;
    if(tier)rows+=`<div class="selo-modal-row"><span class="label">Nível</span><span class="value">${tier.icon} ${tier.label}</span></div>`;
    if(next)rows+=`<div class="selo-modal-row"><span class="label">Próximo nível</span><span class="value">${next.icon} ${next.label} (${next.min}x)</span></div>`;
    statsWrap.innerHTML=rows;
    statusWrap.className='mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-green-100 text-green-700';
    statusWrap.innerHTML='<i data-lucide="check-circle" class="w-4 h-4"></i> Desbloqueado';
  }else{
    statsWrap.innerHTML='';
    progressWrap.classList.remove('hidden');
    document.getElementById('badge-modal-progress-fill').style.width=(st.progress||0)+'%';
    document.getElementById('badge-modal-progress-label').textContent=st.progressLabel||'Ainda não conquistado.';
    statusWrap.className='mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-gray-100 text-gray-500';
    statusWrap.innerHTML='<i data-lucide="lock" class="w-4 h-4"></i> Ainda não conquistado';
  }
  document.getElementById('badge-modal').classList.add('show');
  lucide.createIcons();
}
document.getElementById('badge-modal-close').addEventListener('click',()=>document.getElementById('badge-modal').classList.remove('show'));
document.getElementById('badge-modal').addEventListener('click',(e)=>{if(e.target.id==='badge-modal')e.target.classList.remove('show')});

// ===== USUÁRIOS (Configurações) =====
let currentUserInfo=null;
let cachedUsers=[];

async function loadCurrentUserInfo(){
  try{
    const res=await fetch('/api/me');
    if(!res.ok)return null;
    currentUserInfo=await res.json();
    renderSidebarUserCard();
    if(typeof renderReports==='function'&&document.getElementById('reports-list'))renderReports();
    return currentUserInfo;
  }catch(e){return null}
}
loadCurrentUserInfo();

function renderSidebarUserCard(){
  if(!currentUserInfo)return;
  const avatar=document.getElementById('sidebar-user-avatar');
  const nameEl=document.getElementById('sidebar-user-name');
  const roleEl=document.getElementById('sidebar-user-role');
  if(!avatar)return;
  avatar.innerHTML=currentUserInfo.photo?`<img src="${currentUserInfo.photo}">`:'<i data-lucide="user" class="w-5 h-5"></i>';
  nameEl.textContent=currentUserInfo.department||currentUserInfo.name||currentUserInfo.email||'—';
  roleEl.textContent=currentUserInfo.isAdmin?'Administrador':'Responsável pela Verificação';
  lucide.createIcons();
}
const sidebarUserCardEl=document.getElementById('sidebar-user-card');
if(sidebarUserCardEl){
  sidebarUserCardEl.addEventListener('click',(e)=>{
    if(e.target.closest('.sidebar-user-menu-item'))return;
    sidebarUserCardEl.classList.toggle('open');
  });
  document.addEventListener('click',(e)=>{
    if(!sidebarUserCardEl.contains(e.target))sidebarUserCardEl.classList.remove('open');
  });
}

function formatLastAccess(val){
  if(!val)return 'Nunca';
  const d=new Date(val.replace(' ','T'));
  if(isNaN(d.getTime()))return val;
  return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

async function renderUsersSection(){
  if(!currentUserInfo)await loadCurrentUserInfo();
  const fieldset=document.getElementById('users-fieldset');
  const forbidden=document.getElementById('users-forbidden');
  if(!currentUserInfo||!currentUserInfo.isAdmin){
    fieldset.classList.add('hidden');
    forbidden.classList.remove('hidden');
    return;
  }
  forbidden.classList.add('hidden');
  fieldset.classList.remove('hidden');
  await fetchAndRenderUsers();
}

async function fetchAndRenderUsers(){
  try{
    const res=await fetch('/api/users');
    if(!res.ok){cachedUsers=[];renderUsersTable();return}
    cachedUsers=await res.json();
  }catch(e){cachedUsers=[]}
  renderUsersTable();
}

function renderUsersTable(){
  const tbody=document.getElementById('users-table');
  const empty=document.getElementById('users-empty');
  if(!cachedUsers.length){
    tbody.innerHTML='';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML=cachedUsers.map(u=>{
    const avatar=u.photo?`<img src="${u.photo}" class="user-avatar">`:`<div class="user-avatar"><i data-lucide="user" class="w-4 h-4"></i></div>`;
    const profileLabel=u.profile==='admin'?'Administrador':'Responsável pela Verificação';
    const statusLabel=u.status==='inactive'?'Inativo':'Ativo';
    const isSelf=currentUserInfo&&String(currentUserInfo.email).toLowerCase()===String(u.email).toLowerCase();
    return `<tr class="border-b border-gray-50" data-user-id="${u.id}">
      <td class="p-2">${avatar}</td>
      <td class="p-2 font-semibold text-gray-800">${u.name||'—'}${isSelf?' <span class=\"text-[10px] text-gray-400\">(você)</span>':''}</td>
      <td class="p-2 text-gray-600">${u.department||'—'}</td>
      <td class="p-2 text-gray-600">${u.email}</td>
      <td class="p-2"><span class="profile-pill">${profileLabel}</span></td>
      <td class="p-2"><span class="status-pill ${u.status==='inactive'?'inactive':'active'}">${statusLabel}</span></td>
      <td class="p-2 text-gray-500 text-xs">${formatLastAccess(u.last_access)}</td>
      <td class="p-2">
        <div class="flex gap-1 flex-wrap">
          <button type="button" class="user-edit-btn text-blue-600 hover:text-blue-800" title="Editar" data-id="${u.id}"><i data-lucide="pencil" class="w-4 h-4"></i></button>
          <button type="button" class="user-reset-btn text-amber-600 hover:text-amber-800" title="Resetar senha" data-id="${u.id}"><i data-lucide="key-round" class="w-4 h-4"></i></button>
          <button type="button" class="user-toggle-btn text-gray-500 hover:text-gray-700" title="${u.status==='inactive'?'Ativar':'Inativar'}" data-id="${u.id}"><i data-lucide="${u.status==='inactive'?'toggle-left':'toggle-right'}" class="w-4 h-4"></i></button>
          <button type="button" class="user-delete-btn text-red-600 hover:text-red-800" title="Excluir" data-id="${u.id}" ${isSelf?'disabled style="opacity:.3;cursor:not-allowed"':''}><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
  lucide.createIcons();

  tbody.querySelectorAll('.user-edit-btn').forEach(btn=>btn.addEventListener('click',()=>openUserForm(cachedUsers.find(u=>String(u.id)===btn.dataset.id))));
  tbody.querySelectorAll('.user-reset-btn').forEach(btn=>btn.addEventListener('click',()=>openResetPasswordModal(cachedUsers.find(u=>String(u.id)===btn.dataset.id))));
  tbody.querySelectorAll('.user-toggle-btn').forEach(btn=>btn.addEventListener('click',()=>toggleUserStatus(cachedUsers.find(u=>String(u.id)===btn.dataset.id))));
  tbody.querySelectorAll('.user-delete-btn').forEach(btn=>btn.addEventListener('click',()=>{if(!btn.disabled)openDeleteUserConfirm(cachedUsers.find(u=>String(u.id)===btn.dataset.id))}));
}

function populateUserDeptSelect(selected){
  const sel=document.getElementById('user-dept');
  const depts=getAllDepts().map(d=>d.name);
  sel.innerHTML='<option value="">Selecione</option>'+depts.map(d=>`<option value="${d}">${d}</option>`).join('');
  if(selected&&depts.includes(selected))sel.value=selected;
}

function openUserForm(user){
  populateUserDeptSelect(user?user.department:'');
  document.getElementById('user-form-error').classList.add('hidden');
  document.getElementById('user-edit-id').value=user?user.id:'';
  document.getElementById('user-modal-title').textContent=user?'Editar Usuário':'Novo Usuário';
  document.getElementById('user-name').value=user?user.name||'':'';
  document.getElementById('user-email').value=user?user.email||'':'';
  document.getElementById('user-email').disabled=!!user;
  document.getElementById('user-role').value=user?user.role||'':'';
  document.querySelector(`input[name="user-profile"][value="${user&&user.profile==='admin'?'admin':'auditor'}"]`).checked=true;
  document.querySelector(`input[name="user-status"][value="${user&&user.status==='inactive'?'inactive':'active'}"]`).checked=true;
  document.getElementById('user-photo-data').value=user?user.photo||'':'';
  const preview=document.getElementById('user-photo-preview');
  preview.innerHTML=user&&user.photo?`<img src="${user.photo}" class="w-full h-full object-cover">`:'<i data-lucide="user" class="w-8 h-8 text-gray-400"></i>';
  const pwWrap=document.getElementById('user-password-wrap');
  const pwInput=document.getElementById('user-password');
  if(user){
    pwWrap.classList.add('hidden');
    pwInput.removeAttribute('required');
  }else{
    pwWrap.classList.remove('hidden');
    pwInput.value='';
    pwInput.setAttribute('required','required');
  }
  document.getElementById('user-modal').classList.add('show');
  lucide.createIcons();
}
document.getElementById('add-user-btn').addEventListener('click',()=>openUserForm(null));
document.getElementById('cancel-user').addEventListener('click',()=>document.getElementById('user-modal').classList.remove('show'));

document.getElementById('user-photo-input').addEventListener('change',async(e)=>{
  const file=e.target.files[0];if(!file)return;
  try{
    const dataUrl=await compressImage(file,300,0.85);
    document.getElementById('user-photo-data').value=dataUrl;
    document.getElementById('user-photo-preview').innerHTML=`<img src="${dataUrl}" class="w-full h-full object-cover">`;
  }catch(err){alert('Não foi possível processar a imagem.')}
});

document.getElementById('user-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const errBox=document.getElementById('user-form-error');
  errBox.classList.add('hidden');
  const editId=document.getElementById('user-edit-id').value;
  const body={
    name:document.getElementById('user-name').value.trim(),
    email:document.getElementById('user-email').value.trim(),
    department:document.getElementById('user-dept').value,
    role:document.getElementById('user-role').value.trim(),
    profile:document.querySelector('input[name="user-profile"]:checked').value,
    status:document.querySelector('input[name="user-status"]:checked').value,
    photo:document.getElementById('user-photo-data').value,
  };
  let url='/api/users',method='POST';
  if(editId){url=`/api/users/${editId}`;method='PUT'}
  else{body.password=document.getElementById('user-password').value}

  try{
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await res.json();
    if(!res.ok||data.isError){errBox.textContent=data.message||'Erro ao salvar usuário.';errBox.classList.remove('hidden');return}
    document.getElementById('user-modal').classList.remove('show');
    await fetchAndRenderUsers();
  }catch(err){errBox.textContent='Erro de conexão.';errBox.classList.remove('hidden')}
});

function openResetPasswordModal(user){
  if(!user)return;
  document.getElementById('reset-password-user-id').value=user.id;
  document.getElementById('reset-password-user-label').textContent=`${user.name||user.email} (${user.email})`;
  document.getElementById('reset-password-input').value='';
  document.getElementById('reset-password-error').classList.add('hidden');
  document.getElementById('reset-password-modal').classList.add('show');
}
document.getElementById('cancel-reset-password').addEventListener('click',()=>document.getElementById('reset-password-modal').classList.remove('show'));
document.getElementById('reset-password-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const id=document.getElementById('reset-password-user-id').value;
  const password=document.getElementById('reset-password-input').value;
  const errBox=document.getElementById('reset-password-error');
  try{
    const res=await fetch(`/api/users/${id}/reset-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
    const data=await res.json();
    if(!res.ok||data.isError){errBox.textContent=data.message||'Erro ao resetar senha.';errBox.classList.remove('hidden');return}
    document.getElementById('reset-password-modal').classList.remove('show');
    alert('Senha resetada com sucesso.');
  }catch(err){errBox.textContent='Erro de conexão.';errBox.classList.remove('hidden')}
});

async function toggleUserStatus(user){
  if(!user)return;
  const newStatus=user.status==='inactive'?'active':'inactive';
  try{
    const res=await fetch(`/api/users/${user.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      name:user.name,department:user.department,role:user.role,profile:user.profile,status:newStatus
    })});
    const data=await res.json();
    if(!res.ok||data.isError){alert(data.message||'Erro ao atualizar status.');return}
    await fetchAndRenderUsers();
  }catch(err){alert('Erro de conexão.')}
}

let userPendingDelete=null;
function openDeleteUserConfirm(user){
  if(!user)return;
  userPendingDelete=user;
  document.getElementById('delete-user-confirm-text').textContent=`Tem certeza que deseja excluir ${user.name||user.email}? Essa ação não pode ser desfeita.`;
  document.getElementById('delete-user-confirm-modal').classList.add('show');
}
document.getElementById('delete-user-back-btn').addEventListener('click',()=>{userPendingDelete=null;document.getElementById('delete-user-confirm-modal').classList.remove('show')});
document.getElementById('delete-user-yes-btn').addEventListener('click',async()=>{
  if(!userPendingDelete)return;
  try{
    const res=await fetch(`/api/users/${userPendingDelete.id}`,{method:'DELETE'});
    const data=await res.json();
    if(!res.ok||data.isError){alert(data.message||'Erro ao excluir usuário.');document.getElementById('delete-user-confirm-modal').classList.remove('show');return}
    document.getElementById('delete-user-confirm-modal').classList.remove('show');
    await fetchAndRenderUsers();
  }catch(err){alert('Erro de conexão.')}
  userPendingDelete=null;
});

// ===== MANUAL DO JOGO (edição + impressão) =====
let manualEditableBackup=null;
let manualLoadedSavedVersion=false;

function renderManualTab(){
  const editBtn=document.getElementById('manual-edit-btn');
  if(!editBtn)return;
  const isAdmin=currentUserInfo&&currentUserInfo.isAdmin;
  editBtn.classList.toggle('hidden',!isAdmin);

  // Aplica a versão salva (se existir) só uma vez, para não sobrescrever
  // o que o admin está editando no momento.
  const container=document.getElementById('manual-editable');
  const saved=getConfig('manual_html',null);
  if(saved&&!manualLoadedSavedVersion&&!container.classList.contains('editing')){
    container.innerHTML=saved;
    manualLoadedSavedVersion=true;
    lucide.createIcons();
  }
}

async function ensureCurrentUserForManual(){
  if(!currentUserInfo)await loadCurrentUserInfo();
  renderManualTab();
}
ensureCurrentUserForManual();

document.getElementById('manual-edit-btn').addEventListener('click',()=>{
  const container=document.getElementById('manual-editable');
  manualEditableBackup=container.innerHTML;
  container.contentEditable='true';
  container.classList.add('editing');
  document.getElementById('manual-edit-btn').classList.add('hidden');
  document.getElementById('manual-print-btn').classList.add('hidden');
  document.getElementById('manual-save-btn').classList.remove('hidden');
  document.getElementById('manual-cancel-btn').classList.remove('hidden');
  container.focus();
});

document.getElementById('manual-cancel-btn').addEventListener('click',()=>{
  const container=document.getElementById('manual-editable');
  if(manualEditableBackup!==null)container.innerHTML=manualEditableBackup;
  container.contentEditable='false';
  container.classList.remove('editing');
  document.getElementById('manual-edit-btn').classList.remove('hidden');
  document.getElementById('manual-print-btn').classList.remove('hidden');
  document.getElementById('manual-save-btn').classList.add('hidden');
  document.getElementById('manual-cancel-btn').classList.add('hidden');
  lucide.createIcons();
});

document.getElementById('manual-save-btn').addEventListener('click',async()=>{
  const container=document.getElementById('manual-editable');
  const saveBtn=document.getElementById('manual-save-btn');
  saveBtn.disabled=true;saveBtn.textContent='Salvando...';
  const html=container.innerHTML;
  const existing=allData.find(r=>r.type==='config'&&r.config_key==='manual_html');
  let result;
  if(existing)result=await window.dataSdk.update({...existing,config_value:html});
  else result=await window.dataSdk.create({type:'config',entity_id:uid(),config_key:'manual_html',config_value:html});
  saveBtn.disabled=false;saveBtn.innerHTML='<i data-lucide="check" class="w-3.5 h-3.5"></i> Salvar';
  if(result&&result.isError){alert('Erro ao salvar o manual: '+result.message);return}
  container.contentEditable='false';
  container.classList.remove('editing');
  document.getElementById('manual-edit-btn').classList.remove('hidden');
  document.getElementById('manual-print-btn').classList.remove('hidden');
  saveBtn.classList.add('hidden');
  document.getElementById('manual-cancel-btn').classList.add('hidden');
  manualEditableBackup=null;
  lucide.createIcons();
});

document.getElementById('manual-print-btn').addEventListener('click',()=>{
  showTab('manual');
  setTimeout(()=>window.print(),80);
});

// ===== LINK PÚBLICO =====
(function(){
  const input=document.getElementById('public-link-input');
  const btn=document.getElementById('copy-public-link-btn');
  if(!input||!btn)return;
  input.value=window.location.origin+'/publico';
  btn.addEventListener('click',async()=>{
    try{
      await navigator.clipboard.writeText(input.value);
    }catch(e){
      input.select();document.execCommand('copy');
    }
    const msg=document.getElementById('copy-public-link-msg');
    msg.classList.remove('hidden');
    setTimeout(()=>msg.classList.add('hidden'),2000);
  });
})();

// ===== RESPONSÁVEL PELA VERIFICAÇÃO (puxa da lista de usuários) =====
let cachedUserNames=null;

async function populateAuditorSelect(){
  const sel=document.getElementById('audit-auditor');
  if(!sel)return;
  if(!cachedUserNames){
    try{
      const res=await fetch('/api/users/names');
      cachedUserNames=res.ok?await res.json():[];
    }catch(e){cachedUserNames=[]}
  }
  const cur=sel.value;
  sel.innerHTML='<option value="">Selecione...</option>'+cachedUserNames.map(u=>
    `<option value="${u.name}">${u.name}${u.department?` (${u.department})`:''}</option>`
  ).join('');
  if(cur&&cachedUserNames.some(u=>u.name===cur)){
    sel.value=cur;
  }else if(!cur&&currentUserInfo&&currentUserInfo.name&&cachedUserNames.some(u=>u.name===currentUserInfo.name)){
    sel.value=currentUserInfo.name;
  }
}

// ===== EXCLUIR VERIFICAÇÃO (admin) =====
async function reloadAllData(){
  try{
    const res=await fetch('/api/records');
    allData=await res.json();
    refreshAll();
  }catch(e){console.error('Erro ao recarregar dados:',e)}
}

let auditPendingDelete=null;
function openDeleteAuditConfirm(audit){
  auditPendingDelete=audit;
  document.getElementById('delete-audit-confirm-text').textContent=
    `Verificação #${audit.audit_number||'—'} — ${audit.department||'Área Comum'} (${audit.audit_date||'—'}). Essa ação não pode ser desfeita.`;
  document.getElementById('delete-audit-confirm-modal').classList.add('show');
}
document.getElementById('delete-audit-back-btn').addEventListener('click',()=>{
  auditPendingDelete=null;
  document.getElementById('delete-audit-confirm-modal').classList.remove('show');
});
document.getElementById('delete-audit-yes-btn').addEventListener('click',async()=>{
  if(!auditPendingDelete)return;
  const btn=document.getElementById('delete-audit-yes-btn');
  btn.disabled=true;btn.textContent='Excluindo...';
  try{
    const res=await fetch(`/api/audits/${auditPendingDelete.__backendId}`,{method:'DELETE'});
    const data=await res.json();
    if(!res.ok||data.isError){alert(data.message||'Erro ao excluir verificação.');}
    else{await reloadAllData()}
  }catch(e){alert('Erro de conexão.')}
  btn.disabled=false;btn.textContent='Excluir';
  auditPendingDelete=null;
  document.getElementById('delete-audit-confirm-modal').classList.remove('show');
});

// ===== LOG DE ALTERAÇÕES (admin) =====
async function renderActivityLogSection(){
  if(!currentUserInfo)await loadCurrentUserInfo();
  const fieldset=document.getElementById('activity-log-fieldset');
  if(!fieldset)return;
  if(!currentUserInfo||!currentUserInfo.isAdmin){
    fieldset.classList.add('hidden');
    return;
  }
  fieldset.classList.remove('hidden');
  const tbody=document.getElementById('activity-log-table');
  const empty=document.getElementById('activity-log-empty');
  let entries=[];
  try{
    const res=await fetch('/api/activity-log');
    entries=res.ok?await res.json():[];
  }catch(e){entries=[]}
  if(!entries.length){
    tbody.innerHTML='';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const actionLabels={delete:'Exclusão'};
  tbody.innerHTML=entries.map(e=>{
    const dt=e.created_at?new Date(e.created_at.replace(' ','T')):null;
    const dtLabel=dt&&!isNaN(dt.getTime())?dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):(e.created_at||'—');
    return `<tr class="border-b border-gray-50">
      <td class="p-2 text-gray-500 text-xs whitespace-nowrap">${dtLabel}</td>
      <td class="p-2 font-semibold text-gray-800">${e.user_name||e.user_email||'—'}</td>
      <td class="p-2"><span class="status-pill inactive">${actionLabels[e.action]||e.action}</span></td>
      <td class="p-2 text-gray-600">${e.description||''}</td>
    </tr>`;
  }).join('');
}
