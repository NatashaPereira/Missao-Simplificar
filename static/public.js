/* Missão Simplificar — Página Pública (Ranking, Coleção de Selos, Manual do Jogo)
   Não requer login. Usa /api/public/records, uma versão filtrada e sanitizada
   dos dados (sem fotos de evidência, observações ou nomes de responsáveis). */

lucide.createIcons();

let allData = [];
const PILLARS = ['Utilização','Limpeza','Padronização','Disciplina'];

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

// ===== NAVEGAÇÃO =====
function showPublicTab(tab){
  document.querySelectorAll('.public-tab').forEach(t=>t.classList.remove('active'));
  const el=document.getElementById('public-tab-'+tab);if(el)el.classList.add('active');
  document.querySelectorAll('.public-nav-link').forEach(l=>l.classList.remove('active'));
  const link=document.querySelector(`.public-nav-link[data-public-tab="${tab}"]`);if(link)link.classList.add('active');
}
document.querySelectorAll('.public-nav-link').forEach(link=>{
  link.addEventListener('click',()=>showPublicTab(link.dataset.publicTab));
});

// ===== RANKING =====
function renderRanking(){
  const container=document.getElementById('public-ranking-table');const empty=document.getElementById('public-ranking-empty');
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

// ===== SELETOR DE DEPARTAMENTO (Selos) =====
function populatePublicSelosDeptSelect(){
  const sel=document.getElementById('selos-dept-select');
  if(!sel)return;
  const cur=sel.value;
  const depts=getDepts().map(d=>d.name);
  sel.innerHTML='<option value="">Selecione...</option>';
  depts.forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d;sel.appendChild(o)});
  if(getAudits().some(a=>a.department==='Área Comum')){const o=document.createElement('option');o.value='Área Comum';o.textContent='Área Comum';sel.appendChild(o)}
  if(cur&&[...sel.options].some(o=>o.value===cur))sel.value=cur;
  else if(depts.length)sel.value=depts[0];
}

// ===== MANUAL DO JOGO (impressão + versão salva) =====
document.getElementById('manual-print-btn').addEventListener('click',()=>{
  showPublicTab('manual');
  setTimeout(()=>window.print(),80);
});

// ===== CRITÉRIOS AVALIADOS (dentro de cada senso do Manual) =====
const MANUAL_SENSO_TARGETS={
  'Utilização':'manual-crit-utilizacao',
  'Limpeza':'manual-crit-limpeza',
  'Padronização':'manual-crit-padronizacao',
  'Disciplina':'manual-crit-disciplina',
};
function renderManualCriteriaLists(){
  PILLARS.forEach(senso=>{
    const targetId=MANUAL_SENSO_TARGETS[senso];
    const el=document.getElementById(targetId);
    if(!el)return;
    const items=getCriteria().filter(c=>c.senso===senso).sort((a,b)=>{
      if((a.checklist||'')!==(b.checklist||''))return (a.checklist||'').localeCompare(b.checklist||'');
      return (a.item_number||'').localeCompare(b.item_number||'',undefined,{numeric:true});
    });
    if(!items.length){el.innerHTML='<p class="manual-criteria-empty">Nenhum critério cadastrado para este senso ainda.</p>';return}
    el.innerHTML=items.map(c=>`<div class="manual-criteria-item"><span class="num">${c.item_number||'—'}</span><span>${c.question||c.criterion||''}</span><span class="checklist-tag">${c.checklist||''}</span></div>`).join('');
  });
}

// ===== CARREGAMENTO INICIAL =====
async function initPublicPage(){
  try{
    const res=await fetch('/api/public/records');
    allData=await res.json();
  }catch(e){
    console.error('Erro ao carregar dados públicos:',e);
    allData=[];
  }
  renderRanking();
  populatePublicSelosDeptSelect();
  renderSelosTab();

  const savedManual=getConfig('manual_html',null);
  if(savedManual){
    document.getElementById('manual-editable').innerHTML=savedManual;
  }
  renderManualCriteriaLists();
  lucide.createIcons();
}
initPublicPage();
