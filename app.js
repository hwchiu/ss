const products = {
  knative: {name:'Knative', short:'KN', type:'platform', logo:'https://cdn.simpleicons.org/knative/0865AD', position:'通用 application substrate', scores:{http:5,dx:4,revision:5,scale:5,event:3,gitops:5}, architecture:'Serving + Eventing + Functions；Activator 與 queue-proxy 完成可靠的 HTTP scale-to-zero。', interface:'CRD / kubectl / kn / func', good:'Revision、traffic 與容器模型完整', tradeoff:'Portal、多租戶與整體維運需自行整合', fit:'打造自有 Cloud Run 類平台'},
  openfaas: {name:'OpenFaaS', short:'OF', type:'platform', logo:'https://cdn.simpleicons.org/openfaas/3B5EE9', position:'開發者導向 FaaS', scores:{http:4,dx:5,revision:2,scale:4,event:4,gitops:4}, architecture:'Gateway + faas-netes + watchdog；非同步路徑由 queue-worker 處理。', interface:'UI / REST / faas-cli / stack YAML', good:'模板、CLI 與 Function DX 完整', tradeoff:'部分 production 能力有商業版邊界', fit:'快速提供純 FaaS 產品'},
  fission: {name:'Fission', short:'FI', type:'platform', logo:'https://cdn.simpleicons.org/fission/2D4F7C', position:'低冷啟動 Kubernetes FaaS', scores:{http:3,dx:5,revision:2,scale:4,event:4,gitops:4}, architecture:'Router + Executor；PoolManager warm pool 或 per-function Deployment。', interface:'CLI / CRD / YAML', good:'warm pool 與 executor 策略清楚', tradeoff:'產品 UI 與通用服務模型較弱', fit:'短函式與冷啟動敏感場景'},
  nuclio: {name:'Nuclio', short:'NU', type:'platform', logo:'https://cdn.simpleicons.org/nuclio/00A3E0', position:'高效能事件處理 FaaS', scores:{http:3,dx:4,revision:2,scale:3,event:5,gitops:3}, architecture:'每個 Function Processor 內含 event listeners、runtime 與平行 workers。', interface:'Dashboard / nuctl / config', good:'事件來源與 instance 內並行強', tradeoff:'通用 revision traffic 模型需驗證', fit:'Stream、資料與 ML 事件處理'},
  keda: {name:'KEDA', short:'KD', type:'component', logo:'https://cdn.simpleicons.org/kubernetes/326CE5', position:'事件驅動伸縮元件', scores:{http:1,dx:1,revision:1,scale:2,event:5,gitops:5}, architecture:'Operator 負責 0↔1，HPA 負責 1↔N；ScaledJob 處理事件型工作。', interface:'CRD / Helm / kubectl', good:'Scaler 廣、增量導入容易', tradeoff:'不是完整平台，HTTP 需額外 add-on', fit:'Worker / Job scaling 能力層'}
};

const clouds = [
  {name:'Google Cloud Run', logo:'https://cdn.simpleicons.org/googlecloud/4285F4', color:'#4285f4', model:'Container application', workloads:'Service / Job / Worker', release:'Revision + traffic split', text:'以任意 HTTP container 為核心，source build 是便利入口。穩定 endpoint 與 immutable revision 的分離最值得借鏡。', href:'https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run'},
  {name:'AWS Lambda', logo:'https://cdn.simpleicons.org/awslambda/FF9900', color:'#d97800', model:'Function', workloads:'Function / Event mapping', release:'Version + alias', text:'Function detail、測試事件與 trigger 體驗成熟。Runtime API、extension 與 provisioned concurrency 定義清楚。', href:'https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html'},
  {name:'Azure Container Apps', logo:'https://cdn.simpleicons.org/microsoftazure/0078D4', color:'#0078d4', model:'App + Environment', workloads:'App / Job / Function', release:'Revision + traffic split', text:'公開採用 KEDA，environment 是網路與觀測邊界。Functions 與 containers 共用 execution substrate。', href:'https://learn.microsoft.com/en-us/azure/container-apps/overview'},
  {name:'Function Compute', logo:'https://cdn.simpleicons.org/alibabacloud/FF6A00', color:'#e85d00', model:'Function by scenario', workloads:'Event / Web / Task / GPU', release:'Version + configuration', text:'先以使用情境引導建立流程，並區分 built-in、custom runtime 與 custom container。', href:'https://www.alibabacloud.com/help/en/functioncompute/fc/product-overview/what-is-function-compute'}
];

const uiRows = [
  ['建立入口','Source / OCI image','Blueprint / zip / image','Image / source / Functions','Template / code / image'],
  ['主要 CLI','gcloud run','aws lambda + SAM','az containerapp','Serverless Devs'],
  ['發布操作','Revision 流量切分','Version alias 權重','Revision 流量切分','Version / alias'],
  ['事件體驗','Eventarc 整合','Trigger / source mapping','KEDA rule / binding','Trigger wizard'],
  ['可觀測性','Log / metric / revision','Monitor / log / trace','Log Analytics / execution','Log / metric / invocation']
];

const goals = [
  {label:'打造通用內部應用平台', answer:'Knative Serving + KEDA', why:'Knative 承接 HTTP、revision 與 traffic，KEDA 補足 queue worker 與 jobs。'},
  {label:'快速推出 Function 平台', answer:'OpenFaaS', why:'CLI、templates、Gateway 與同步/非同步 invocation 的產品路徑最直接。'},
  {label:'極度在意短函式冷啟動', answer:'Fission', why:'可明確比較 PoolManager warm pool 與 per-function Deployment 的成本。'},
  {label:'大量 stream / ML 事件', answer:'Nuclio + KEDA 評估', why:'Nuclio 的 processor 與 event listener 模型適合高吞吐事件處理。'},
  {label:'只替既有服務加入事件伸縮', answer:'KEDA', why:'不需要引入完整 FaaS；直接替 Deployment、StatefulSet 或 Job 加 scaler。'}
];

function logo(item, className='product-logo') { return `<img class="${className}" src="${item.logo}" alt="${item.name} logo" onerror="this.outerHTML='<span class=&quot;product-fallback&quot;>${item.short || item.name.slice(0,2)}</span>'">`; }
function score(value){const level=value>=4?'high':value>=3?'mid':'low';return `<span class="score-bar ${level}" aria-label="${value} 分">${[1,2,3,4,5].map(i=>`<i class="${i<=value?'filled':''}"></i>`).join('')}</span>`}

let currentFilter='all', currentSort='http';
function renderScores(){
  const body=document.querySelector('#score-body');
  const rows=Object.values(products).filter(p=>currentFilter==='all'||p.type===currentFilter).sort((a,b)=>b.scores[currentSort]-a.scores[currentSort]);
  body.innerHTML=rows.map(p=>`<tr><td><span class="product-cell">${logo(p)}${p.name}</span></td>${['http','dx','revision','scale','event','gitops'].map(k=>`<td>${score(p.scores[k])}</td>`).join('')}<td class="type-note">${p.position}</td></tr>`).join('');
  document.querySelectorAll('[data-sort]').forEach(b=>b.classList.toggle('active',b.dataset.sort===currentSort));
}

function renderGoals(){
  const list=document.querySelector('#goal-list'), answer=document.querySelector('#goal-answer');
  list.innerHTML=goals.map((g,i)=>`<button class="${i===0?'active':''}" data-goal="${i}"><span>${g.label}</span><i data-lucide="arrow-right"></i></button>`).join('');
  const show=i=>{const g=goals[i];answer.innerHTML=`<strong>${g.answer}</strong>${g.why}`;list.querySelectorAll('button').forEach((b,n)=>b.classList.toggle('active',n===i));lucide.createIcons()};
  list.addEventListener('click',e=>{const b=e.target.closest('button');if(b)show(Number(b.dataset.goal))}); show(0);
}

function renderClouds(){
  document.querySelector('#cloud-cards').innerHTML=clouds.map(c=>`<article class="product-card" style="--card-color:${c.color}"><div class="product-title">${logo(c)}<div><h2>${c.name}</h2><p>${c.model}</p></div></div><div class="product-facts"><div><span>工作負載</span><strong>${c.workloads}</strong></div><div><span>發布單位</span><strong>${c.release}</strong></div><div><span>核心入口</span><strong>Console / CLI / API</strong></div></div><p class="takeaway">${c.text}</p><a class="source-link" href="${c.href}" target="_blank" rel="noreferrer">官方文件 <i data-lucide="external-link"></i></a></article>`).join('');
  document.querySelector('#cloud-ui-body').innerHTML=uiRows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
}

let compared=['knative','openfaas','keda'];
function renderCompare(){
  const options=document.querySelector('#compare-options');
  options.innerHTML=Object.entries(products).map(([id,p])=>`<span class="check-option"><input id="check-${id}" type="checkbox" value="${id}" ${compared.includes(id)?'checked':''}><label for="check-${id}">${p.name}</label></span>`).join('');
  document.querySelector('#compare-cards').innerHTML=compared.map(id=>{const p=products[id];return `<article class="compare-card"><div class="compare-card-head">${logo(p)}<div><h2>${p.name}</h2><small>${p.position}</small></div></div><div class="compare-card-body"><div class="compare-section"><span>架構核心</span><p>${p.architecture}</p></div><div class="compare-section"><span>使用介面</span><p>${p.interface}</p></div><div class="compare-section pros-cons"><div class="pros"><b>優勢</b><br>${p.good}</div><div class="cons"><b>代價</b><br>${p.tradeoff}</div></div><div class="compare-section"><span>最適合</span><p><strong>${p.fit}</strong></p></div></div></article>`}).join('') || '<div class="goal-answer">請至少選擇一個方案。</div>';
  options.addEventListener('change',e=>{if(!e.target.matches('input'))return;compared=e.target.checked?[...compared,e.target.value]:compared.filter(x=>x!==e.target.value);renderCompare();lucide.createIcons()},{once:true});
}

function renderExperience(){
  const cards=[
    ['panel-top','Portal',['工作負載清單與狀態篩選','Create wizard 與 policy 預覽','Revision、traffic 與 rollback','Invocation、logs、metrics、traces']],
    ['terminal','CLI',['init / dev / deploy / invoke','logs / revisions / traffic','以相同 API schema 操作','適合本機開發與自動化']],
    ['git-pull-request-arrow','GitOps / API',['高階 Service / Job manifest','Source commit 對應 image digest','Policy 與 drift reconciliation','Promotion 而非重新 build']]
  ];
  document.querySelector('#experience-grid').innerHTML=cards.map(c=>`<article class="experience-card"><div class="experience-card-head"><span><i data-lucide="${c[0]}"></i></span><h2>${c[1]}</h2></div><ul>${c[2].map(x=>`<li>${x}</li>`).join('')}</ul></article>`).join('');
}

function showSection(id){
  const target=document.querySelector(`[data-section="${id}"]`)||document.querySelector('[data-section="overview"]');
  document.querySelectorAll('.page-section').forEach(s=>s.classList.toggle('active',s===target));
  document.querySelectorAll('[data-section-link]').forEach(a=>a.classList.toggle('active',a.dataset.sectionLink===target.dataset.section));
  window.scrollTo({top:0,behavior:'auto'});
}

document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{currentFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderScores()}));
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{currentSort=b.dataset.sort;renderScores()}));
document.querySelector('#reset-compare').addEventListener('click',()=>{compared=['knative','openfaas','keda'];renderCompare();lucide.createIcons()});
window.addEventListener('hashchange',()=>showSection(location.hash.slice(1)||'overview'));

renderScores();renderGoals();renderClouds();renderCompare();renderExperience();showSection(location.hash.slice(1)||'overview');
if(window.lucide)lucide.createIcons();
