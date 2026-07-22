const products = {
  knative: {name:'Knative', short:'KN', type:'platform', logo:'https://cdn.simpleicons.org/knative/0865AD', position:'通用 application substrate', scores:{http:5,dx:4,revision:5,scale:5,event:3,gitops:5}, architecture:'Serving + Eventing + Functions；Activator 與 queue-proxy 完成可靠的 HTTP scale-to-zero。', interface:'CRD / kubectl / kn / func', good:'Revision、traffic 與容器模型完整', tradeoff:'Portal、多租戶與整體維運需自行整合', fit:'打造自有 Cloud Run 類平台'},
  openfaas: {name:'OpenFaaS', short:'OF', type:'platform', logo:'https://cdn.simpleicons.org/openfaas/3B5EE9', position:'開發者導向 FaaS', scores:{http:4,dx:5,revision:2,scale:4,event:4,gitops:4}, architecture:'Gateway + faas-netes + watchdog；非同步路徑由 queue-worker 處理。', interface:'UI / REST / faas-cli / stack YAML', good:'模板、CLI 與 Function DX 完整', tradeoff:'部分 production 能力有商業版邊界', fit:'快速提供純 FaaS 產品'},
  fission: {name:'Fission', short:'FI', type:'platform', logo:'https://cdn.simpleicons.org/fission/2D4F7C', position:'低冷啟動 Kubernetes FaaS', scores:{http:3,dx:5,revision:2,scale:4,event:4,gitops:4}, architecture:'Router + Executor；PoolManager warm pool 或 per-function Deployment。', interface:'CLI / CRD / YAML', good:'warm pool 與 executor 策略清楚', tradeoff:'產品 UI 與通用服務模型較弱', fit:'短函式與冷啟動敏感場景'},
  nuclio: {name:'Nuclio', short:'NU', type:'platform', logo:'https://cdn.simpleicons.org/nuclio/00A3E0', position:'高效能事件處理 FaaS', scores:{http:3,dx:4,revision:2,scale:3,event:5,gitops:3}, architecture:'每個 Function Processor 內含 event listeners、runtime 與平行 workers。', interface:'Dashboard / nuctl / config', good:'事件來源與 instance 內並行強', tradeoff:'通用 revision traffic 模型需驗證', fit:'Stream、資料與 ML 事件處理'},
  keda: {name:'KEDA', short:'KD', type:'component', logo:'https://cdn.simpleicons.org/kubernetes/326CE5', position:'事件驅動伸縮元件', scores:{http:1,dx:1,revision:1,scale:2,event:5,gitops:5}, architecture:'Operator 負責 0↔1，HPA 負責 1↔N；ScaledJob 處理事件型工作。', interface:'CRD / Helm / kubectl', good:'Scaler 廣、增量導入容易', tradeoff:'不是完整平台，HTTP 需額外 add-on', fit:'Worker / Job scaling 能力層'}
};

const cloudPlaybooks = {
  cloudrun: {
    name:'Google Cloud Run', short:'GCR', logo:'https://cdn.simpleicons.org/googlecloud/4285F4', color:'#4285f4',
    model:'Container-first application platform', unit:'Service → immutable Revision', result:'穩定的 `*.run.app` HTTPS URL',
    summary:'最接近我們目標平台的產品模型。開發者可交付 source 或 OCI image；平台負責 build、TLS、endpoint、revision、traffic 與 request-driven autoscaling。',
    console:['Cloud Run → Deploy container → Service','選 Deploy one revision from source repository 或 existing container image','填 Service name、Region、Authentication、Container port','展開 Containers / Networking / Security 設定 resources、scaling、identity 與 secrets','Create 後在 Revisions 頁檢查 readiness，從 URL 直接呼叫'],
    params:[
      ['Service name','checkout-api','穩定資源名與 URL 前綴'],['Region','asia-east1','執行、registry 與資料服務應盡量同區'],['Source / image','. 或 REGION-docker.pkg.dev/...','Source 會由 Cloud Build/buildpacks 產生 image'],['Port','8080','容器必須監聽平台注入的 `PORT`'],['Authentication','Unauthenticated（demo）','正式環境通常改成 IAM 驗證'],['Concurrency','40','單一 instance 同時處理的最大請求數'],['Min / max','0 / 20','0 允許 scale-to-zero；max 保護下游'],['Service account','checkout-runtime@...','每個 revision 的執行身分']
    ],
    code:`gcloud run deploy checkout-api \\
  --source . \\
  --region asia-east1 \\
  --allow-unauthenticated \\
  --port 8080 \\
  --concurrency 40 \\
  --min-instances 0 \\
  --max-instances 20 \\
  --set-env-vars APP_ENV=demo \\
  --service-account checkout-runtime@PROJECT_ID.iam.gserviceaccount.com`,
    invoke:`URL=$(gcloud run services describe checkout-api \\
  --region asia-east1 --format='value(status.url)')

curl -i "$URL/health"
curl -i -X POST "$URL/orders" \\
  -H 'content-type: application/json' \\
  -d '{"sku":"book-01","quantity":2}'`,
    after:[['Revision','每次 image 或 template 設定變更產生新 revision'],['Traffic','可將 5% 導到新 revision，觀察後再逐步增加'],['Logs','stdout/stderr 進 Cloud Logging，可依 service/revision 篩選'],['Private mode','移除 unauthenticated，呼叫端帶 identity token']],
    caution:'`--allow-unauthenticated` 適合公開 API 範例，不是正式環境預設。Max instances 也不是絕對瞬時上限，仍需在資料庫端做連線與流量保護。',
    docs:[['部署參數','https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy'],['Cloud Run 概覽','https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run']]
  },
  lambda: {
    name:'AWS Lambda', short:'AWS', logo:'https://cdn.simpleicons.org/awslambda/FF9900', color:'#d97800',
    model:'Function-first event runtime', unit:'Function → Version → Alias', result:'Invoke API；另選 Function URL 或 API Gateway',
    summary:'入口先問 runtime、handler 與 execution role，再把 JSON event 交給函式。HTTP 不是唯一心智模型，因此測試事件、trigger、retry 與 event source mapping 是操作核心。',
    console:['Lambda → Functions → Create function → Author from scratch','填 Function name、Runtime、Architecture；Permissions 選 execution role','在 Code 頁上傳 zip、編輯程式或改用 container image','Test → Create new event，輸入 JSON payload 後執行','若要 HTTP：Configuration → Function URL → Create function URL，選 AWS_IAM 或 NONE'],
    params:[
      ['Function name','checkout-api','Lambda 資源名'],['Runtime','python3.14','zip 模式由平台提供 runtime'],['Handler','lambda_function.handler','檔名與入口函式，zip 模式必要'],['Execution role','arn:aws:iam::...:role/checkout-lambda','函式存取 AWS 服務的身分'],['Memory','512 MB','同時影響可用 CPU 與價格'],['Timeout','15 sec','應小於呼叫端 timeout'],['Architecture','arm64 或 x86_64','需與 dependency/extension 相容'],['Function URL auth','AWS_IAM（建議）','NONE 表示公開端點，仍需 resource policy']
    ],
    code:`zip function.zip lambda_function.py

aws lambda create-function \\
  --function-name checkout-api \\
  --runtime python3.14 \\
  --handler lambda_function.handler \\
  --architectures arm64 \\
  --memory-size 512 \\
  --timeout 15 \\
  --role arn:aws:iam::123456789012:role/checkout-lambda \\
  --zip-file fileb://function.zip \\
  --environment 'Variables={APP_ENV=demo}'`,
    invoke:`aws lambda invoke \\
  --function-name checkout-api \\
  --cli-binary-format raw-in-base64-out \\
  --payload '{"sku":"book-01","quantity":2}' \\
  response.json

cat response.json

# HTTP 入口是額外資源，不是 create-function 的必然結果
aws lambda create-function-url-config \\
  --function-name checkout-api --auth-type AWS_IAM`,
    after:[['Version','Publish version 將 code 與多數設定固定成不可變版本'],['Alias','`prod` 指向版本，可設定兩版本間的權重'],['Triggers','SQS/Kinesis 等使用 event source mapping；S3 等由來源服務設定'],['Observe','CloudWatch Logs、Metrics；用 request ID 關聯 invocation']],
    caution:'Function URL 只在 public Internet 提供。選 `NONE` 代表跳過 IAM 認證；自 2025-10 起新 URL 的 resource policy 權限要求也已調整，正式環境應依最新官方文件設定。',
    docs:[['建立函式','https://docs.aws.amazon.com/lambda/latest/dg/getting-started.html'],['Function URL','https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html'],['CLI create-function','https://docs.aws.amazon.com/cli/latest/reference/lambda/create-function.html']]
  },
  azure: {
    name:'Azure Container Apps', short:'ACA', logo:'https://cdn.simpleicons.org/microsoftazure/0078D4', color:'#0078d4',
    model:'Environment-scoped container applications', unit:'Container App → immutable Revision', result:'Environment domain 下的 FQDN',
    summary:'先建立 resource group 與 Container Apps Environment，再部署 app。Environment 是共享網路、logging 與安全邊界；app 可使用 HTTP/TCP 或 KEDA custom scale rule。',
    console:['Azure Portal → Container Apps → Create','Basics：Subscription、Resource group、Container app name、Region、Environment','Container：Image source、registry、image、CPU、memory、environment variables','Ingress：Enabled、Accepting traffic from anywhere 或 environment、Target port','完成後到 Application URL 呼叫；Revisions and replicas 查看流量與實例'],
    params:[
      ['Resource group','rg-serverless-demo','Azure 資源生命週期與權限範圍'],['Environment','cae-demo','共享 network、logs 與 workload profiles'],['App name','checkout-api','穩定 app 資源'],['Image','ghcr.io/acme/checkout:v1','public 或 private OCI registry'],['Ingress','external','也可選 internal 僅 environment 可達'],['Target port','8080','必須符合容器 listen port'],['CPU / memory','0.5 / 1.0Gi','必須是平台允許的組合'],['Min / max','0 / 20','KEDA/HTTP scaler 的 replica 邊界']
    ],
    code:`az group create \\
  --name rg-serverless-demo --location eastasia

az containerapp env create \\
  --name cae-demo \\
  --resource-group rg-serverless-demo \\
  --location eastasia

az containerapp create \\
  --name checkout-api \\
  --resource-group rg-serverless-demo \\
  --environment cae-demo \\
  --image ghcr.io/acme/checkout:v1 \\
  --ingress external --target-port 8080 \\
  --cpu 0.5 --memory 1.0Gi \\
  --min-replicas 0 --max-replicas 20 \\
  --env-vars APP_ENV=demo \\
  --query properties.configuration.ingress.fqdn`,
    invoke:`FQDN=$(az containerapp show \\
  --name checkout-api \\
  --resource-group rg-serverless-demo \\
  --query properties.configuration.ingress.fqdn -o tsv)

curl -i "https://$FQDN/health"

# 從本機 source 建立/更新也可使用：
az containerapp up \\
  --name checkout-api --source . \\
  --resource-group rg-serverless-demo \\
  --environment cae-demo`,
    after:[['Revision','revision-scope 變更建立新 revision；secret 等部分設定為 app-scope'],['Traffic','Multiple revision mode 可做 blue/green 與 percentage split'],['Scaling','HTTP concurrency 或 KEDA queue/custom scaler'],['Observe','Log Analytics、console logs、metrics 與 revision replica 狀態']],
    caution:'CPU/memory 指標在零個 replica 時沒有訊號，不能單獨完成可靠的 0→1。需要 HTTP scaler 或具外部事件來源的 KEDA scaler。',
    docs:[['CLI create','https://learn.microsoft.com/en-us/cli/azure/containerapp?view=azure-cli-latest'],['Source/image 快速部署','https://learn.microsoft.com/en-us/azure/container-apps/containerapp-up'],['產品概覽','https://learn.microsoft.com/en-us/azure/container-apps/overview']]
  },
  alibaba: {
    name:'Alibaba Function Compute', short:'FC', logo:'https://cdn.simpleicons.org/alibabacloud/FF6A00', color:'#e85d00',
    model:'Scenario-guided function platform', unit:'Function / Version / Alias', result:'Invoke API；HTTP/Web Function 提供 endpoint',
    summary:'建立入口先選 Event、Web、Task 或 GPU Function，再選 built-in、custom runtime 或 custom container。Serverless Devs 同時提供互動 wizard、`s.yaml` 宣告式流程與 API 級 CLI。',
    console:['Function Compute Console → Functions → Create Function','先選 Web Function（HTTP API 情境），再選 built-in/custom runtime 或 custom container','填 Function name、Region、Handler/Startup command、Listening port','設定 vCPU、Memory、Disk、Timeout、Instance concurrency、Environment variables','建立 HTTP Trigger，設定 Authentication；在 Code/WebIDE 或 URL 測試'],
    params:[
      ['Function type','Web Function','Event / Web / Task / GPU 對應不同入口'],['Runtime','Custom Runtime 或 Custom Container','Web framework 適合 listen-on-port 模型'],['Region','ap-southeast-1（示意）','image registry 與 function 需符合區域規則'],['Handler / command','依 runtime','built-in 使用 handler；custom runtime 設 startup command'],['Listening port','9000（依應用）','custom runtime/container 的 HTTP port'],['Memory / timeout','512 MB / 60 sec','影響資源與請求上限'],['Instance concurrency','10','custom runtime/container 可單實例並行'],['Trigger auth','需要驗證（正式）','HTTP trigger 決定公開呼叫方式']
    ],
    code:`# 第一次使用可啟動互動 wizard
s

# 或從官方模板初始化，再檢查產生的 s.yaml
s init <fc-web-function-template>
cd checkout-api

# 建置、在本機啟動 HTTP function、部署
s build
s local start
s deploy -y

# s.yaml 的關鍵設定概念：
# region / functionName / runtime / handler(or command)
# memorySize / timeout / environmentVariables / triggers`,
    invoke:`# Event Function 可直接傳 JSON payload
s invoke -e '{"sku":"book-01","quantity":2}'

# Web Function 部署後使用輸出的 HTTP URL
curl -i -X POST "$FC_ENDPOINT/orders" \\
  -H 'content-type: application/json' \\
  -d '{"sku":"book-01","quantity":2}'

# 同步 Console 上的變更回本機
s cli fc sync`,
    after:[['Local workflow','`s build`、`s local start/invoke`、`s deploy` 串起生命週期'],['Lifecycle','Initializer 適合昂貴初始化；PreStop 負責清理'],['Triggers','HTTP、OSS、消息服務與 EventBridge 等'],['Observe','stdout/stderr 收進 Simple Log Service，Console 查看 metrics/logs']],
    caution:'Serverless Devs 的 template 名稱與 `s.yaml` schema 會隨 FC component 版本演進；實作時先以目前安裝版本產生的官方模板為準，不要直接沿用舊版 Node.js 14 範例。',
    docs:[['Serverless Devs','https://www.alibabacloud.com/help/en/functioncompute/what-is-serverless-devs'],['操作流程','https://www.alibabacloud.com/help/en/functioncompute/fc-2-0/developer-reference/manage-function-resources-by-using-serverless-devs'],['Getting started','https://www.alibabacloud.com/help/en/functioncompute/fc/getting-started/']]
  }
};

const goals = [
  {label:'打造通用內部應用平台', answer:'Knative Serving + KEDA', why:'Knative 承接 HTTP、revision 與 traffic，KEDA 補足 queue worker 與 jobs。'},
  {label:'快速推出 Function 平台', answer:'OpenFaaS', why:'CLI、templates、Gateway 與同步/非同步 invocation 的產品路徑最直接。'},
  {label:'極度在意短函式冷啟動', answer:'Fission', why:'可明確比較 PoolManager warm pool 與 per-function Deployment 的成本。'},
  {label:'大量 stream / ML 事件', answer:'Nuclio + KEDA 評估', why:'Nuclio 的 processor 與 event listener 模型適合高吞吐事件處理。'},
  {label:'只替既有服務加入事件伸縮', answer:'KEDA', why:'不需要引入完整 FaaS；直接替 Deployment、StatefulSet 或 Job 加 scaler。'}
];

const experiments = [
  ['mouse-pointer-click','HTTP service','0→1、100 並行請求、20 秒處理、gRPC、canary 90/10'],
  ['messages-square','Queue worker','10k backlog、retry、DLQ、scale from/to zero'],
  ['calendar-clock','Scheduled job','parallelism、timeout、retry、取消與 execution history'],
  ['package-check','Build supply chain','Git commit 到 signed image、SBOM、私有 dependency、cache'],
  ['shield-check','Multi-tenancy','兩個團隊的 quota、network、identity 與越權測試'],
  ['heart-pulse','Day-2 operations','Controller、gateway、broker 故障，node drain、升級與還原']
];

const sources = [
  ['Cloud Run','https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run'],
  ['AWS Lambda','https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html'],
  ['Azure Container Apps','https://learn.microsoft.com/en-us/azure/container-apps/overview'],
  ['Knative','https://knative.dev/docs/serving/architecture/'],
  ['KEDA','https://keda.sh/docs/2.20/concepts/'],
  ['OpenFaaS','https://docs.openfaas.com/architecture/stack/']
];

function logo(item, className='product-logo') { return `<img class="${className}" src="${item.logo}" alt="${item.name} logo" onerror="this.outerHTML='<span class=&quot;product-fallback&quot;>${item.short || item.name.slice(0,2)}</span>'">`; }
function score(value){const level=value>=4?'high':value>=3?'mid':'low';return `<span class="score-bar ${level}" aria-label="${value} 分">${[1,2,3,4,5].map(i=>`<i class="${i<=value?'filled':''}"></i>`).join('')}</span>`}
function refreshIcons(){if(window.lucide)window.lucide.createIcons()}

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
  const show=i=>{const g=goals[i];answer.innerHTML=`<strong>${g.answer}</strong>${g.why}`;list.querySelectorAll('button').forEach((b,n)=>b.classList.toggle('active',n===i));refreshIcons()};
  list.addEventListener('click',e=>{const b=e.target.closest('button');if(b)show(Number(b.dataset.goal))}); show(0);
}

let activeCloud='cloudrun';
function escapeCode(value){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
function renderCloudPage(){
  const nav=document.querySelector('#cloud-page-options');
  const page=document.querySelector('#cloud-page-content');
  nav.innerHTML=Object.entries(cloudPlaybooks).map(([id,item])=>`<button class="${id===activeCloud?'active':''}" data-cloud-page="${id}" style="--cloud-color:${item.color}">${logo(item)}<span><b>${item.name}</b><small>${item.model}</small></span><i data-lucide="chevron-right"></i></button>`).join('');
  const c=cloudPlaybooks[activeCloud];
  page.innerHTML=`
    <article class="cloud-detail" style="--cloud-color:${c.color}">
      <header class="cloud-detail-hero">
        <div class="cloud-detail-title">${logo(c,'cloud-detail-logo')}<div><span class="eyebrow">DEPLOYMENT PLAYBOOK</span><h2>${c.name}</h2><p>${c.summary}</p></div></div>
        <div class="cloud-result"><span>部署後取得</span><b>${c.result}</b></div>
      </header>
      <div class="cloud-fact-strip"><div><span>心智模型</span><b>${c.model}</b></div><div><span>發布單位</span><b>${c.unit}</b></div><div><span>示範情境</span><b>checkout-api / HTTP / scale-to-zero</b></div></div>
      <nav class="cloud-jump" aria-label="本頁內容"><button data-scroll-target="cloud-console">Console</button><button data-scroll-target="cloud-params">參數</button><button data-scroll-target="cloud-cli">CLI</button><button data-scroll-target="cloud-invoke">呼叫</button><button data-scroll-target="cloud-after">部署後</button></nav>
      <section id="cloud-console" class="cloud-content-section"><div class="cloud-section-title"><span>01</span><div><h3>從 Console 怎麼建立</h3><p>這是使用者第一次接觸產品時實際看到的操作路徑。</p></div></div><ol class="console-steps">${c.console.map((step,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><p>${step}</p></li>`).join('')}</ol></section>
      <section id="cloud-params" class="cloud-content-section"><div class="cloud-section-title"><span>02</span><div><h3>這個範例要輸入什麼</h3><p>左欄是 UI/CLI 欄位，中間是示範值，右欄說明它控制的行為。</p></div></div><div class="parameter-table"><div class="parameter-head"><b>參數</b><b>範例值</b><b>為什麼需要</b></div>${c.params.map(row=>`<div><b>${row[0]}</b><code>${row[1]}</code><span>${row[2]}</span></div>`).join('')}</div></section>
      <section id="cloud-cli" class="cloud-content-section code-section"><div class="cloud-section-title"><span>03</span><div><h3>用 CLI 建立同一個資源</h3><p>範例刻意把重要參數展開，不依賴 Console 的隱含預設。</p></div></div><div class="code-window"><div class="code-window-bar"><span></span><span></span><span></span><b>deploy.sh</b><button class="copy-code" data-copy-target="deploy-code"><i data-lucide="copy"></i><span>複製</span></button></div><pre id="deploy-code"><code>${escapeCode(c.code)}</code></pre></div></section>
      <section id="cloud-invoke" class="cloud-content-section code-section"><div class="cloud-section-title"><span>04</span><div><h3>如何呼叫與驗證</h3><p>建立成功不等於應用可用；至少驗證 endpoint、payload 與 response。</p></div></div><div class="code-window"><div class="code-window-bar"><span></span><span></span><span></span><b>invoke.sh</b><button class="copy-code" data-copy-target="invoke-code"><i data-lucide="copy"></i><span>複製</span></button></div><pre id="invoke-code"><code>${escapeCode(c.invoke)}</code></pre></div></section>
      <section id="cloud-after" class="cloud-content-section"><div class="cloud-section-title"><span>05</span><div><h3>部署後還要操作什麼</h3><p>真正的平台體驗從第一次部署成功後才開始。</p></div></div><div class="after-grid">${c.after.map(item=>`<div><b>${item[0]}</b><p>${item[1]}</p></div>`).join('')}</div><div class="cloud-caution"><i data-lucide="triangle-alert"></i><div><b>容易忽略</b><p>${c.caution}</p></div></div></section>
      <footer class="cloud-docs"><span>官方來源</span>${c.docs.map(doc=>`<a href="${doc[1]}" target="_blank" rel="noreferrer">${doc[0]} <i data-lucide="external-link"></i></a>`).join('')}</footer>
    </article>`;
  nav.querySelectorAll('[data-cloud-page]').forEach(button=>button.addEventListener('click',()=>{activeCloud=button.dataset.cloudPage;renderCloudPage();refreshIcons();document.querySelector('#cloud').scrollIntoView()}));
  page.querySelectorAll('[data-scroll-target]').forEach(button=>button.addEventListener('click',()=>document.querySelector(`#${button.dataset.scrollTarget}`).scrollIntoView({behavior:'smooth',block:'start'})));
  page.querySelectorAll('.copy-code').forEach(button=>button.addEventListener('click',async()=>{const target=document.querySelector(`#${button.dataset.copyTarget}`);try{await navigator.clipboard.writeText(target.innerText);button.querySelector('span').textContent='已複製';setTimeout(()=>button.querySelector('span').textContent='複製',1400)}catch{button.querySelector('span').textContent='請手動選取'}}));
}

let compared=['knative','openfaas','keda'];
function renderCompare(){
  const options=document.querySelector('#compare-options');
  options.innerHTML=Object.entries(products).map(([id,p])=>`<span class="check-option"><input id="check-${id}" type="checkbox" value="${id}" ${compared.includes(id)?'checked':''}><label for="check-${id}">${p.name}</label></span>`).join('');
  document.querySelector('#compare-cards').innerHTML=compared.map(id=>{const p=products[id];return `<article class="compare-card"><div class="compare-card-head">${logo(p)}<div><h2>${p.name}</h2><small>${p.position}</small></div></div><div class="compare-card-body"><div class="compare-section"><span>架構核心</span><p>${p.architecture}</p></div><div class="compare-section"><span>使用介面</span><p>${p.interface}</p></div><div class="compare-section pros-cons"><div class="pros"><b>優勢</b><br>${p.good}</div><div class="cons"><b>代價</b><br>${p.tradeoff}</div></div><div class="compare-section"><span>最適合</span><p><strong>${p.fit}</strong></p></div></div></article>`}).join('') || '<div class="goal-answer">請至少選擇一個方案。</div>';
  options.addEventListener('change',e=>{if(!e.target.matches('input'))return;compared=e.target.checked?[...compared,e.target.value]:compared.filter(x=>x!==e.target.value);renderCompare();refreshIcons()},{once:true});
}

function renderExperience(){
  const cards=[
    ['panel-top','Portal',['工作負載清單與狀態篩選','Create wizard 與 policy 預覽','Revision、traffic 與 rollback','Invocation、logs、metrics、traces']],
    ['terminal','CLI',['init / dev / deploy / invoke','logs / revisions / traffic','以相同 API schema 操作','適合本機開發與自動化']],
    ['git-pull-request-arrow','GitOps / API',['高階 Service / Job manifest','Source commit 對應 image digest','Policy 與 drift reconciliation','Promotion 而非重新 build']]
  ];
  document.querySelector('#experience-grid').innerHTML=cards.map(c=>`<article class="experience-card"><div class="experience-card-head"><span><i data-lucide="${c[0]}"></i></span><h2>${c[1]}</h2></div><ul>${c[2].map(x=>`<li>${x}</li>`).join('')}</ul></article>`).join('');
}

function renderRoadmap(){
  document.querySelector('#experiment-grid').innerHTML=experiments.map(item=>`<article class="experiment-item"><span><i data-lucide="${item[0]}"></i></span><div><b>${item[1]}</b><p>${item[2]}</p></div></article>`).join('');
  document.querySelector('#source-list').innerHTML=sources.map(item=>`<a href="${item[1]}" target="_blank" rel="noreferrer"><span>${item[0]} 官方文件</span><i data-lucide="external-link"></i></a>`).join('');
}

function showSection(id){
  const target=document.querySelector(`[data-section="${id}"]`)||document.querySelector('[data-section="overview"]');
  document.querySelectorAll('.page-section').forEach(s=>s.classList.toggle('active',s===target));
  document.querySelectorAll('[data-section-link]').forEach(a=>a.classList.toggle('active',a.dataset.sectionLink===target.dataset.section));
  window.scrollTo({top:0,behavior:'auto'});
}

document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{currentFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderScores()}));
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{currentSort=b.dataset.sort;renderScores()}));
document.querySelector('#reset-compare').addEventListener('click',()=>{compared=['knative','openfaas','keda'];renderCompare();refreshIcons()});
window.addEventListener('hashchange',()=>showSection(location.hash.slice(1)||'overview'));

renderScores();renderGoals();renderCloudPage();renderCompare();renderExperience();renderRoadmap();showSection(location.hash.slice(1)||'overview');
refreshIcons();
