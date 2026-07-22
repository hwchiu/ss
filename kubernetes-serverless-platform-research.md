# Kubernetes Serverless Platform 市場與開源方案比較

更新日期：2026-07-21

## 1. 研究範圍與結論摘要

本文件回答三個問題：

1. 公有雲 serverless 產品如何設計其資源模型、執行、伸縮、事件與發布流程？
2. 使用者透過 Console、CLI、API、IaC 與 CI/CD 會看到什麼？
3. 在 Kubernetes 上自建時，哪些開源專案可以直接採用，哪些只是其中一塊能力？

先講結論：

- 不應只做「函式上傳器」。成熟產品都已同時覆蓋 HTTP service、event function、run-to-completion job，部分再增加 always-on worker。
- 平台內部應以不可變 revision 為發布單位，對外則維持穩定的 service/function endpoint；流量切分、回滾與版本釘選都是一級能力。
- Scale-to-zero 不是單一 autoscaler 功能。它還需要請求攔截與暫存、快速喚醒、readiness、逾時與過載保護，否則第一個請求容易失敗。
- 開發者介面至少要有「從原始碼」與「從 OCI image」兩條路；底層可以都收斂成 OCI image。
- Kubernetes CRD 適合平台工程與 GitOps，但不應成為一般開發者唯一介面。對外 API 需要隱藏 Deployment、Service、HPA、Ingress 等細節。
- 若目標是通用內部開發平台，Knative Serving + KEDA 是較穩健的核心；若目標是純 FaaS、希望快速提供模板與 CLI，OpenFaaS 或 Fission 的產品模型更接近需求。
- KEDA 是伸縮元件，不是完整 serverless platform；單獨採用仍需自行補齊入口、revision、build、事件路由、權限、觀測與 UI。

> 注意：AWS Lambda、Google Cloud Run、Azure Container Apps、Alibaba Function Compute 的底層實作並未全部公開，也不都宣稱建立在 Kubernetes 上。本文件把它們當作產品行為與使用者體驗的參考，不推定其內部實作。

## 2. 統一比較框架

建議用以下維度持續收集資料：

| 面向 | 要回答的問題 |
|---|---|
| 工作負載 | Function、HTTP service、job、worker 是否為不同資源？ |
| 輸入產物 | 原始碼、zip、OCI image、Git repo 是否支援？誰負責 build？ |
| 執行契約 | handler API 或 listen-on-port？是否支援任意容器？ |
| 發布 | 是否有 immutable revision/version、alias、traffic split、rollback？ |
| 伸縮 | 指標、並行度、0→1、1→N、最小/最大實例與預熱如何處理？ |
| 事件 | HTTP、排程、queue、stream、cloud event 的綁定與重試語意？ |
| 網路 | 公開/私有入口、TLS、domain、service discovery、VPC egress？ |
| 安全 | 執行身分、secret、租戶隔離、供應鏈與 policy？ |
| 可觀測性 | log、metric、trace、invocation、revision 與事件積壓是否可關聯？ |
| 使用者介面 | Console、CLI、REST/gRPC、IaC、GitOps、IDE 各自支援到哪裡？ |
| 營運 | HA、升級、容量、配額、成本歸屬與故障域？ |

## 3. 公有雲產品設計

### 3.1 Google Cloud Run

**產品模型**

- Service：有穩定 HTTPS endpoint 的無狀態服務，可接 HTTP、gRPC 與事件。
- Job：手動、排程或 workflow 觸發的有限期工作，支援平行 tasks。
- Worker pool：沒有負載平衡 endpoint，適用 Kafka consumer 等 pull-based、常駐背景工作。
- 每次設定變更產生 revision；service 將流量指向一個或多個 revision。

**執行與伸縮**

- 核心契約是容器在指定 port 接受請求，因此語言與 framework 限制低。
- 可依請求與 CPU 等訊號擴展，預設可 scale to zero；minimum instances 用於降低冷啟動。
- revision traffic split、漸進發布與 rollback 是服務本身的能力，不需使用者操作 Kubernetes ingress。

**使用者介面**

- Console：建立 service/job、選擇 source 或 image、設定 ingress、CPU/memory、autoscaling、secret、revision traffic，並查看 log/metric。
- CLI：`gcloud run deploy --source` 或 `--image`；source 模式由 Cloud Build + buildpacks 產出 image。
- API/IaC：Google Cloud API、Terraform；亦能由 CI/CD 部署 immutable image digest。

**值得借鏡**

- 用同一個容器平台呈現 service、job、worker 三種意圖，而不是把所有 workload 塞進 Function。
- 「簡單模式」從 source 一鍵 build，「進階模式」直接提供 image，最後都進入同一 runtime。
- endpoint、IAM identity、revision、traffic 是平台物件，而非額外拼裝功能。

來源：[Cloud Run overview](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run)、[Deploy from source](https://cloud.google.com/run/docs/deploying-source-code)

### 3.2 AWS Lambda

**產品模型**

- Function 是主要資源，包含 code、runtime、memory、timeout、environment、role 與 event source 設定。
- 發布後可建立 immutable version；alias 指向 version，並可做有限的權重路由。
- event source mapping 處理 queue/stream polling；其他 AWS 服務也可透過 trigger 或非同步 invocation 呼叫。

**執行與伸縮**

- execution environment 經歷 Init、Invoke、Shutdown，空閒環境可能被凍結並重用。
- 傳統模型通常以 invocation concurrency 驅動隔離環境；Provisioned Concurrency 用容量換低延遲。
- runtime 透過 Runtime API 取得 invocation；extensions 另有 Extensions API 與 Telemetry API。
- 部署產物可為 zip 或 container image，但既有 function 不能直接切換 package type。

**使用者介面**

- Console：建立/編輯小型函式、test event、trigger、monitor、version/alias、permission 與 configuration。
- CLI/API：`aws lambda`、AWS SDK；IaC 常見 SAM、CloudFormation、CDK、Terraform。
- 開發工具把 build、local invoke、event template、deploy 打包成 workflow，降低使用者理解底層資源的需求。

**值得借鏡**

- Function detail 頁應以「Code / Test / Monitor / Configuration / Versions」這類任務導向資訊架構呈現。
- 事件來源不是單純 URL：需要 batch、checkpoint、retry、DLQ、最大並行度與失敗目的地等控制。
- 每個 revision/version 的 runtime identity、設定與 telemetry 必須可追溯。

來源：[Lambda execution environment](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html)、[Function configuration](https://docs.aws.amazon.com/lambda/latest/dg/lambda-functions.html)、[Container images](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)

### 3.3 Azure Container Apps / Azure Functions on Container Apps

**產品模型**

- Container App 適合 HTTP API、長時間服務與 event-driven worker；Job 則分為 manual、schedule、event 三類。
- Container Apps Environment 提供一組應用共享的網路、logging 與安全邊界。
- app configuration 變更會產生 immutable revision，可使用 single/multiple revision mode 與 traffic split。
- Azure Functions 可跑在 Container Apps 上，沿用 Functions 的 trigger/binding 開發體驗。

**執行與伸縮**

- 底層伸縮明確採用 KEDA，支援 HTTP、TCP、CPU/memory 與外部事件來源。
- HTTP/TCP/custom scaling rule 與 min/max replicas 都是 revision 設定；多條規則任一觸發即可擴展。
- CPU/memory rule 本身無法由零恢復；HTTP 或有外部訊號的 event scaler 才有可靠 0→1 訊號。
- Dapr 是選配的 service invocation、pub/sub、state 等應用 API 層。

**使用者介面**

- Azure Portal：wizard 建立 environment/app/job，設定 image、ingress、revision、secret、scale rules，查看 execution history 與 Log Analytics。
- CLI：`az containerapp`；API/IaC：ARM/Bicep、Terraform。
- YAML 可作為 CLI 輸入，但 public resource API 仍是 Azure Resource Manager，不直接暴露 Kubernetes API。

**值得借鏡**

- 將 environment 當成明確的租戶/網路/觀測邊界，比直接把 Kubernetes namespace 暴露給一般使用者更容易治理。
- Functions 與 containers 可以是兩種 developer experience，底層共用 execution substrate。
- UI 在使用者選擇 scaler 後，應動態呈現該 scaler 的 metadata、authentication 與可用的 scale-to-zero 行為。

來源：[Container Apps overview](https://learn.microsoft.com/en-us/azure/container-apps/overview)、[Scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)、[Ingress](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview)、[Jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs)

### 3.4 Alibaba Cloud Function Compute

**產品模型**

- Event Function、Web Function、Task Function、GPU Function 對應不同 workload 意圖。
- runtime 分 built-in runtime、custom runtime 與 custom container；Web Function 偏向 listen-on-port 的 web framework 體驗。
- HTTP、OSS、消息、EventBridge 等 trigger 與 log/monitor 深度整合雲端服務。

**執行與伸縮**

- on-demand instance 可在空閒時 freeze，再於逾時後銷毀；Initializer 與 PreStop 提供 lifecycle hooks。
- custom container 透過 HTTP header 傳遞 invocation context；stdout/stderr 收進 Simple Log Service。
- instance concurrency、timeout、CPU/memory、ephemeral disk 與 provisioned capacity 是主要控制面。

**使用者介面**

- Console 提供 Function 建立 wizard、template、trigger、configuration、monitor 與 WebIDE。
- 直譯語言可在 WebIDE 修改與發布；custom container 從同 region 的 Container Registry 部署。
- CLI/工程化工作流可採 Serverless Devs 與 API/SDK。

**值得借鏡**

- 在建立頁先問使用情境（event/web/task/GPU），再呈現相符設定，可避免一次暴露全部參數。
- lifecycle hook 是昂貴初始化、連線池與優雅清理的實用執行契約。
- GPU/AI 不只是加一個 resource limit；需要獨立的 image、capacity、cold-start 與配額體驗。

來源：[What is Function Compute](https://www.alibabacloud.com/help/en/functioncompute/fc/product-overview/what-is-function-compute)、[Technology selection](https://www.alibabacloud.com/help/en/functioncompute/fc/selection-of-method-to-create-functions)、[Function basics](https://www.alibabacloud.com/help/en/functioncompute/fc/basics)

## 4. 公有雲使用者介面比較

| 能力 | Cloud Run | AWS Lambda | Azure Container Apps | Function Compute |
|---|---|---|---|---|
| 主要心智模型 | Container application | Function | Container application/environment | Function by scenario |
| 建立入口 | Source 或 image | Blueprint、zip 或 image | Image、source workflow、Functions | Template、code、custom runtime/image |
| Web code editor | 非核心 | 有，較適合小型修改 | Functions 體驗提供 | 直譯 runtime 有 WebIDE |
| CLI | `gcloud run` | `aws lambda` + SAM | `az containerapp` | Serverless Devs/CLI |
| Declarative/IaC | API、Terraform | CFN/SAM/CDK/Terraform | ARM/Bicep/Terraform/YAML | API、IaC 工具 |
| 發布畫面 | Revision + traffic split | Version + alias | Revision + traffic split | Version/alias/設定 |
| 事件設定 | Eventarc 等整合 | Trigger/event source mapping | KEDA rule/Functions binding | Trigger wizard |
| 觀測入口 | Logs、metrics、revision | Monitor、logs、traces | Log Analytics、metrics、execution | Logs、metrics、invocation |

共同 UI 模式：

1. **List**：以狀態、region/environment、runtime、最後部署、endpoint、流量與錯誤率供快速掃描。
2. **Create wizard**：先選 workload type，再選 source/image、trigger、resources、scaling、network/security，最後 review。
3. **Detail**：Overview、Deployments/Revisions、Triggers、Configuration、Observability、Permissions。
4. **Deploy view**：顯示 build log、image digest、revision readiness、traffic migration 與 rollback。
5. **Test/Invoke**：HTTP request builder 或 event JSON，保留測試事件並顯示 response、log、duration 與 trace ID。

建議避免的 UI：

- 把 Kubernetes Deployment、Service、Ingress、HPA 分開讓開發者組裝。
- 只有自由格式 YAML editor，沒有 schema、預覽、policy error 與建議值。
- 把 function invocation log、build log、platform event 與 pod log 混成單一文字流。
- 只顯示目前 replica 數，不解釋「為何 scale」、queue lag、desired replicas 與 cold-start 次數。

## 5. 開源專案比較

### 5.1 Knative

**定位**：Kubernetes-native serverless application substrate；由 Serving、Eventing、Functions 組成，可分開採用。

**架構**

- `Service` 管理 `Configuration`、immutable `Revision` 與 `Route`。
- ingress gateway 將請求直接送到 ready pod，或在 scale-to-zero 時送到 Activator 暫存。
- 每個 workload pod 的 queue-proxy 收集 concurrency/request 指標並執行並行限制。
- Knative Pod Autoscaler 根據 Activator/queue-proxy 指標做 request/concurrency scaling。
- Eventing 用 Broker、Trigger、Source/Sink 與 CloudEvents 建立非同步事件路由。

**介面**

- 原生 CRD/YAML + `kubectl`，適合 GitOps 與平台整合。
- `kn` 簡化 service、event、autoscaling、traffic split；`func`/`kn func` 提供 create/build/deploy/invoke。
- 官方核心不以完整多租戶 Web Console 為重點，通常需自行建 portal 或整合 Backstage/Tekton/Argo CD。

**判斷**

- 優點：revision/route/traffic/scale-to-zero 模型成熟，最接近 Cloud Run 的基礎層；容器契約通用。
- 成本：元件與網路選項多；HA、observability、event broker、TLS/domain、多租戶 policy 需平台團隊整合。
- 適合：要打造自有產品/API/UI，且希望核心資料模型保持 Kubernetes-native 的團隊。

來源：[Overview](https://knative.dev/docs/)、[Serving architecture](https://knative.dev/docs/serving/architecture/)、[CLI tools](https://knative.dev/docs/client/)

### 5.2 OpenFaaS

**定位**：偏開發者體驗的 FaaS 平台，以 OCI image、Gateway、CLI、templates 與 function store 為中心。

**架構**

- Gateway 對外提供 function CRUD、同步/非同步 invocation 與 proxy。
- Kubernetes provider (`faas-netes`) 為每個 function 建立 Deployment 與 Service。
- watchdog 將 handler、binary 或既有 HTTP server 適配為 function workload。
- 非同步路徑經 queue 與 queue-worker；metrics 使用 Prometheus。
- stack YAML 同時描述 build 與 deploy，也可生成 CRD 供 GitOps 使用。

**介面**

- `faas-cli new/build/push/deploy/invoke` 的流程完整，template 能隱藏 Dockerfile 與 server boilerplate。
- 提供 REST API、Function CRD、UI；較新的 Dashboard、進階 autoscaling、IAM/SSO 等能力屬商業版本範圍，採用前需確認授權與費用。

**判斷**

- 優點：FaaS 心智模型直接，CLI/template/function store 上手快，同步與非同步 invocation 清楚。
- 成本：部分 production、多租戶、scale-to-zero 與 dashboard 能力有版本/授權邊界。
- 適合：範圍聚焦 function、重視開發者 CLI 與模板，且能接受商業版評估的團隊。

來源：[Introduction](https://docs.openfaas.com/)、[Stack](https://docs.openfaas.com/architecture/stack/)、[Invocations](https://docs.openfaas.com/architecture/invocations/)、[Autoscaling](https://docs.openfaas.com/architecture/autoscaling/)

### 5.3 Fission

**定位**：Kubernetes FaaS，突出 source package/environment 與多種 executor 的冷啟動策略。

**架構**

- Router 接收請求，找不到 ready endpoint 時要求 Executor 提供 capacity。
- PoolManager 維持通用 runtime warm pool，收到首次請求後下載 package 並 specialize，降低冷啟動。
- New Deployment 每個 function 建 Deployment、Service、HPA，隔離較清楚但冷啟動較高。
- Container executor 直接運行自有 image；另有 HTTP、message、timer、Kubernetes watch 等 trigger。

**介面**

- `fission` CLI 直接管理 environment、package、function、route、trigger。
- CRD/YAML 適合自動化；不像公有雲 Console 那樣提供完整產品化 UI。

**判斷**

- 優點：warm pool 與 per-function deployment 都是顯式選項，適合研究 latency/idle cost 取捨。
- 成本：產品生態與 UI 較小；需要自行驗證高可用、升級、事件可靠性與專案維護節奏。
- 適合：以短函式為主，且 warm pool 對冷啟動改善有明確價值的場景。

來源：[Executor architecture](https://fission.io/docs/architecture/executor/)、[Create functions](https://fission.io/docs/usage/function/functions/)

### 5.4 Nuclio

**定位**：高效能 event processing FaaS，常見於資料、stream 與 ML 周邊場景。

**架構**

- 每個 function 有 processor，包含 event-source listeners、runtime engine 與多個平行 workers。
- event source 被轉成共同 event schema，runtime 負責 context、log、statistics 與 function lifecycle。
- 可跑 standalone Docker 或 Kubernetes；依事件頻率增加 processor instances。

**介面**

- 提供 Dashboard、`nuctl`、function configuration；可由 code、Git 或 image 建置部署。
- 建立體驗對 trigger 與 runtime worker 的設定較深入，偏向事件處理工程師。

**判斷**

- 優點：event source 與單 instance 內並行執行模型較強，與資料/ML 平台整合有吸引力。
- 成本：若目標是通用 Cloud Run 類 application platform，需補足 revision traffic、產品生態與通用服務體驗的驗證。
- 適合：高吞吐 event/stream、資料處理或與 Nuclio 生態既有產品整合的場景。

來源：[Architecture](https://docs.nuclio.io/en/stable/concepts/architecture.html)

### 5.5 KEDA

**定位**：Kubernetes event-driven autoscaling component，不是完整 FaaS/serverless platform。

**架構**

- `ScaledObject` 將 Deployment/StatefulSet/具 `/scale` 的 CR 綁到 scaler。
- operator 負責 0→1 與 1→0；1→N 主要交由其建立的 HPA。
- metrics API server 把 Kafka、RabbitMQ、SQS 等外部指標暴露給 Kubernetes HPA。
- `ScaledJob` 根據事件建立 Kubernetes Job；`TriggerAuthentication` 分離事件來源憑證。
- HTTP Add-on 額外放 interceptor 在 request path，計數並在 cold start 時 hold request，但需要另外評估其成熟度與版本相容性。

**判斷**

- 優點：事件 scaler 廣、可增量加入既有 workload，與 Kubernetes HPA 模型一致。
- 缺口：沒有 source build、endpoint、revision、traffic、function runtime、完整 event delivery、developer portal。
- 適合：作為 Knative 以外的 worker/job scaling 層，或為既有 Deployment 加入 queue-driven scaling。

來源：[KEDA concepts](https://keda.sh/docs/2.20/concepts/)、[Scaling workloads](https://keda.sh/docs/2.20/concepts/scaling-deployments/)、[HTTP Add-on architecture](https://keda.sh/http-add-on/0.15/concepts/architecture/)

## 6. 開源選型矩陣

評分：5 表示內建且成熟度/完整度相對高；1 表示多數需自行建置。這是架構適配度，不是專案品質排名。

| 維度 | Knative | OpenFaaS | Fission | Nuclio | KEDA |
|---|---:|---:|---:|---:|---:|
| 通用 HTTP container | 5 | 4 | 3 | 3 | 1 |
| Function DX | 4 | 5 | 5 | 4 | 1 |
| Immutable revision/traffic | 5 | 2 | 2 | 2 | 1 |
| HTTP scale-to-zero 路徑 | 5 | 4* | 4 | 3 | 2** |
| Queue/event autoscaling | 3 | 4 | 4 | 5 | 5 |
| Event routing抽象 | 5 | 3 | 4 | 5 | 2 |
| Job/worker 基礎 | 3 | 4 | 3 | 4 | 5 |
| CLI 開發體驗 | 4 | 5 | 5 | 4 | 2 |
| Web UI 現成度 | 1 | 4* | 1 | 4 | 1 |
| Kubernetes/GitOps 原生 | 5 | 4 | 4 | 3 | 5 |
| 作為自有平台核心 | 5 | 3 | 3 | 3 | 3 |

\* OpenFaaS 的部分能力需核對 Standard/Enterprise/Community 版本與授權。  
\** KEDA core 不處理 HTTP request path；HTTP Add-on 才補 interceptor/scaler。

## 7. 建議的自建平台架構

### 7.1 建議資源模型

對外 API 不直接複製 Kubernetes 物件，建議最少提供：

```text
Project / Environment
├── Service       # HTTP/gRPC、長時間服務、穩定 URL
│   ├── Revision  # image digest + config snapshot，不可變
│   ├── Route     # domain/path、auth、traffic split
│   └── Trigger   # push event 到 service
├── Function      # handler/template DX，build 後仍成為 Service/Revision
├── Job           # manual/schedule/event、run-to-completion
└── Worker        # pull queue/stream、沒有公開 ingress
```

這讓 Function 是開發體驗而非另一套 execution substrate，也避免 service 與 function 各自重做 runtime、network、revision、identity 與 observability。

### 7.2 參考元件配置

| 平台層 | 建議起點 | 責任 |
|---|---|---|
| Portal/API | 自建 API + Web portal | tenancy、workflow、policy、聚合狀態 |
| Source build | Cloud Native Buildpacks + Tekton/Shipwright | source→SBOM→signed OCI image |
| Registry | 既有 OCI registry | image、digest、retention、scan |
| HTTP runtime | Knative Serving | revision、route、traffic、request autoscaling |
| Events | Knative Eventing 或既有 Kafka platform | CloudEvents、broker、trigger、delivery |
| Worker/job scaling | KEDA | queue lag、ScaledObject、ScaledJob |
| Gateway | Gateway API implementation | domain、TLS、WAF、rate limit、tenant routing |
| Identity/secrets | K8s ServiceAccount + workload identity + external secret store | 最小權限與短期憑證 |
| Policy | Kyverno/Gatekeeper + admission controls | image、resource、network、tenant guardrail |
| Observability | OpenTelemetry + Prometheus + logs backend | build/deploy/invoke/event/cold-start 關聯 |
| Delivery | Argo CD/Flux 或平台 reconciler | declarative rollout、drift、rollback |

### 7.3 控制面與資料面

**控制面**

1. API 接受高階 Service/Function/Job spec，驗證 quota、policy 與 tenant 權限。
2. Build service 將 source 轉為以 digest 固定且簽章的 OCI image。
3. Revision controller 建立 immutable revision，寫入 image、config、identity、secret refs 與 provenance。
4. Route/Trigger controller 將公開入口、流量與 event binding reconciliation 到 Knative/KEDA/Gateway。
5. Status aggregator 將底層 conditions 翻譯成 `Building / Deploying / Ready / Degraded / Failed`，不要直接把 Kubernetes conditions 丟給使用者。

**資料面**

1. HTTP：Gateway → authentication/policy → Knative ingress → Activator（只在必要時）→ queue-proxy → user container。
2. Async event：source → durable broker/queue → delivery/retry/DLQ → service 或 worker。
3. Pull worker：KEDA 觀測 queue lag → Deployment 0→N → worker 從 queue 拉取與 ack。
4. Job：manual/schedule/event → Job execution → isolated pod(s) → execution history/result metadata。

## 8. MVP 使用者介面範圍

### 8.1 開發者 Portal

**Workloads list**

- Name、type、environment、status、active revision、endpoint/trigger、replicas、last deployed、owner。
- Filters：project、environment、type、runtime、status、owner；支援錯誤率與 queue backlog 排序。

**Create flow**

1. 選 Service / Function / Job / Worker。
2. 選 Git source、upload source 或 OCI image。
3. 設定 runtime/build；進階使用者才看到 Dockerfile/build args。
4. 選 HTTP、schedule、queue 或 event trigger。
5. 設定 CPU/memory/concurrency/min/max/timeout；UI 即時提示 scale-to-zero 限制。
6. 設定 public/internal、identity、secret refs。
7. Review 顯示將建立的高階資源、預估常駐容量與 policy 結果。

**Workload detail**

- Overview：health、URL、trigger、current traffic、replicas、latency/error、成本歸屬標籤。
- Revisions：digest、source commit、config diff、SBOM/signature、ready time、traffic、rollback。
- Invocations/Executions：request/event ID、status、duration、retry、revision、trace link。
- Logs/Metrics/Traces：預設以 workload + revision 篩選，而非 pod name。
- Configuration：resources、scaling、network、identity、secrets、environment variables。
- Events：平台 reconciliation、image pull、scheduling、quota 與 policy failures，與 application logs 分離。

### 8.2 CLI 與宣告式介面

建議 CLI workflow：

```bash
srv init --template python-http
srv dev
srv deploy --env dev
srv invoke --data @event.json
srv logs --follow
srv revisions
srv traffic set rev-42=10,rev-41=90
srv promote --from dev --to prod
```

同一份 project manifest 應可提交 Git：

```yaml
apiVersion: platform.example.io/v1alpha1
kind: Service
metadata:
  name: checkout
spec:
  source:
    git:
      url: https://git.example.com/payments/checkout
      revision: 8c9f2d1
  runtime:
    port: 8080
    concurrency: 40
    timeout: 30s
  scale:
    min: 0
    max: 50
  route:
    visibility: internal
```

Portal、CLI、API 與 GitOps 必須操作同一組高階 resource schema；否則功能會快速分歧。

## 9. 非功能性需求與風險

| 風險 | 設計要求 |
|---|---|
| Cold start | 分解 image pull、schedule、runtime init、app readiness；支援 min instances、預拉 image 與容量預留 |
| Thundering herd | Activator/queue 必須有 backpressure、最大等待、per-tenant quota 與下游保護 |
| Noisy neighbor | namespace 不是完整安全邊界；加 ResourceQuota、PriorityClass、NetworkPolicy、runtime sandbox 與 dedicated pools |
| Event duplication | 明示 at-least-once；提供 idempotency key、retry/backoff、DLQ、replay 與 poison-message 處理 |
| Secret exposure | 只接受 secret reference；避免在 CR status、build args、CLI history 與 log 中出現明文 |
| Supply chain | pin digest、scan、SBOM、signature verification、provenance、base image policy |
| Control-plane outage | 已部署 revision 應繼續服務；controller、webhook、activator、gateway、event broker 分別做 HA/故障演練 |
| Upgrade | 定義 CRD conversion、revision backward compatibility、逐版本升級與 rollback |
| Cost attribution | 每個 workload/revision 帶 project、owner、environment；計算 CPU/memory/GPU time、requests、egress、build/storage |

## 10. 建議的 PoC 與決策方式

不要只跑 Hello World。用同一組測試在 Knative、OpenFaaS、Fission（需要時加入 Nuclio）執行：

1. HTTP service：0→1、100 並行請求、20 秒處理、WebSocket/gRPC、canary 90/10。
2. Queue worker：積壓 10k messages、失敗重試、DLQ、從零擴展與縮回零。
3. Scheduled/job：parallelism、timeout、retry、取消、execution history。
4. Build：Git commit 到 signed image/revision，私有 dependency、cache、失敗診斷。
5. Multi-tenancy：兩個 team、quota、network isolation、workload identity、越權測試。
6. Day-2：controller/gateway/broker 故障、node drain、升級、還原與 observability。

記錄 p50/p95/p99 cold start、ready time、最大穩定 RPS、事件 lag、控制面 API latency、每 1M requests 資源成本，以及完成每個 developer task 的步驟數。

### 建議決策閘門

- **第一階段：Knative Serving + KEDA PoC。** 驗證通用 service/revision 與 worker scaling 是否能共存。
- **第二階段：OpenFaaS/Fission 對照。** 量化其 function template、warm pool、async invocation 是否值得改變核心選型。
- **第三階段：薄 portal。** 只做 create/list/detail/deploy/revision/log，不先做完整 WebIDE。
- **第四階段：事件可靠性與多租戶。** 通過 failure injection、quota 與安全測試後才開放 production。

最終選型不應只比較功能勾選數。真正會決定平台成本的是：是否能穩定升級、0→1 請求是否可靠、事件失敗是否可恢復、租戶是否隔離，以及開發者能否在不接觸 Kubernetes 細節的情況下完成部署與除錯。
