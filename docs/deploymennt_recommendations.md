# Deployment Recommendations: Azure vs AWS

This document compares deployment options for the **Prompt Knowledge Base** app on **Azure** and **AWS**, considering Docker vs non-Docker, Kubernetes, cost, ease of deployment, CI/CD, and troubleshooting. It ends with a single recommended option.

---

## App summary

- **Frontend:** Vite/React (Node build → static assets or Node server).
- **Backend:** Python 3.12, FastAPI (uvicorn), Alembic migrations.
- **Database:** PostgreSQL 16 with pgvector (required).
- **Existing:** Dockerfiles and docker-compose for local dev; see [deployment_requirements.md](deployment_requirements.md) for full requirements.

---

## 1. Options overview

### 1.1 AWS options

| Option | Docker | Kubernetes | Description |
|--------|--------|------------|-------------|
| **A1** EC2 + manual stack | No | No | EC2 instance(s); install Python, Node, PostgreSQL (or RDS). You manage OS, runtime, and scaling. |
| **A2** Elastic Beanstalk (platform) | No | No | Deploy Python backend + Node frontend as platform-based apps. Beanstalk manages capacity and load balancing. |
| **A3** EC2 + Docker Compose | Yes | No | One or more EC2 instances; run `docker-compose` (or Compose on EC2). You manage VM and Compose. |
| **A4** ECS Fargate | Yes | No | Run backend/frontend as ECS tasks (Fargate = serverless containers). No VM to manage. |
| **A5** ECS with EC2 capacity | Yes | No | Same as A4 but ECS tasks run on your EC2 cluster. More control, more ops. |
| **A6** App Runner | Yes | No | Fully managed container service. Push image → App Runner runs it. Easiest container option on AWS. |
| **A7** EKS (Elastic Kubernetes Service) | Yes | Yes | Managed Kubernetes. Run backend, frontend, and optionally DB or use RDS. |

### 1.2 Azure options

| Option | Docker | Kubernetes | Description |
|--------|--------|------------|-------------|
| **Z1** VM + manual stack | No | No | Azure VM(s); install Python, Node, PostgreSQL (or Azure Database for PostgreSQL). You manage everything. |
| **Z2** App Service (code) | No | No | Deploy backend and frontend as App Service Web Apps (Python / Node runtimes). No containers. |
| **Z3** VM + Docker Compose | Yes | No | VM runs Docker and docker-compose. You manage VM and Compose. |
| **Z4** App Service (containers) | Yes | No | Run backend and frontend as Web Apps for Containers. Managed app host, you supply images. |
| **Z5** Container Apps | Yes | No | Serverless containers; scale to zero possible. Good balance of simplicity and container model. |
| **Z6** Container Instances (ACI) | Yes | No | Run standalone containers (e.g. one-off or simple multi-container). Less orchestration than Container Apps. |
| **Z7** AKS (Azure Kubernetes Service) | Yes | Yes | Managed Kubernetes. Full control and portability. |

For **database**, both clouds: use **managed PostgreSQL** (AWS RDS, Azure Database for PostgreSQL Flexible Server) with pgvector support; avoid self-managing DB on VM for production.

---

## 2. Comparison dimensions

### 2.1 Docker vs no Docker

| Aspect | With Docker | Without Docker |
|--------|-------------|----------------|
| **Consistency** | Same image from dev to prod; fewer "works on my machine" issues. | Depends on platform runtime (Python/Node version, system libs). |
| **Deployment** | Build once, push to registry, deploy image. | Deploy code + ensure runtime and dependencies match (or use platform buildpacks). |
| **CI/CD** | CI builds image, tags (e.g. commit SHA), pushes to registry; CD pulls and deploys. Same pattern everywhere. | Platform-specific (e.g. zip + EB, or Git deploy to App Service). |
| **Recommendation** | **Prefer Docker** for this app: you already have Dockerfiles, and it simplifies production parity and CI/CD. |

### 2.2 Is Kubernetes a good option?

| Consideration | Good fit | Poor fit |
|---------------|----------|----------|
| **Scale** | Many services, multiple teams, need for fine-grained scaling and placement. | Single app, small team, modest traffic. |
| **Ops overhead** | Team has K8s experience; need advanced networking, multi-cluster, GitOps. | Prefer minimal ops; want "deploy and forget." |
| **Cost** | Justified by many workloads or strict compliance/portability needs. | Control plane + node cost often high for one app. |

**Recommendation:** **Kubernetes (EKS/AKS) is not the best first choice** for this project unless you have a clear need (e.g. future microservices, multi-region, or existing K8s standards). Prefer a managed app/container platform first.

---

## 3. Per-option summary (cost, ease, CI/CD, troubleshooting)

### AWS

| Option | Cost | Ease of deployment | CI/CD | Ease of troubleshooting |
|--------|------|--------------------|-------|---------------------------|
| **A1** EC2 + manual | Low (VM + RDS only) | Hard: OS, runtimes, reverse proxy, SSL. | Custom (e.g. CodeDeploy, Ansible, or scripts). | SSH, own logging; you own everything. |
| **A2** Elastic Beanstalk | Low–medium | Medium: config files, no VM SSH by default. | Good: EB CLI, CodePipeline, GitHub Actions. | Logs in console; extensions for agents. |
| **A3** EC2 + Compose | Low–medium | Medium: VM + Docker + Compose; you handle updates. | Build images in CI, push to ECR; SSH or agent to pull and restart. | Docker logs; CloudWatch agent optional. |
| **A4** ECS Fargate | Medium | Medium: task defs, service, ALB, ECR. | Good: build image in CI, push ECR, update ECS service. | CloudWatch Logs per task; metrics from ALB/ECS. |
| **A5** ECS EC2 | Medium | Harder: cluster, capacity, scaling. | Same as A4. | Same as A4; plus node-level debugging. |
| **A6** App Runner | Medium | Easiest (AWS): connect repo or ECR, set env, deploy. | Very good: auto-deploy from repo or from pipeline pushing to ECR. | Logs and metrics in App Runner console; simpler than ECS. |
| **A7** EKS | High (control plane + nodes) | Hard: manifests, ingress, secrets, possibly Helm. | Good once pipeline is set (e.g. ArgoCD, Flux, or pipeline that applies manifests). | kubectl, Prometheus/Grafana if you add them; most moving parts. |

### Azure

| Option | Cost | Ease of deployment | CI/CD | Ease of troubleshooting |
|--------|------|--------------------|-------|---------------------------|
| **Z1** VM + manual | Low | Hard: same as A1. | Custom (e.g. Azure DevOps, GitHub Actions + SSH/scripts). | SSH, own logging; you own everything. |
| **Z2** App Service (code) | Low–medium | Medium: Git deploy or zip; runtime selection. | Good: GitHub/Azure Repos integration, Azure DevOps. | Log Stream, App Insights; straightforward. |
| **Z3** VM + Compose | Low–medium | Medium: same as A3. | Build images, push ACR, pull and restart on VM. | Docker logs; Log Analytics agent optional. |
| **Z4** App Service (containers) | Low–medium | Medium: point to ACR image, configure. | Good: CI builds image, pushes ACR; Web App pulls new tag. | Same as Z2; App Insights works. |
| **Z5** Container Apps | Medium | Easy: define app(s), env, scaling; optional Dapr. | Good: GitHub Actions, Azure DevOps; deploy new revision. | Log Analytics, Console log stream; simple. |
| **Z6** ACI | Low–medium | Simple for single container; multi-container less flexible. | Basic: push image, update container group. | Log Analytics; fewer features than Container Apps. |
| **Z7** AKS | High | Hard: same class as EKS. | Good once pipeline is set. | kubectl, Azure Monitor; most moving parts. |

---

## 4. Z4 vs Z5: App Service (containers) vs Container Apps

Use this section to choose between **Z4 App Service (containers)** and **Z5 Container Apps** when the app name is **promptkb** and usage is **low traffic** (~20 users, friends trying it out, not on a regular basis).

### 4.1 Default URLs for app name "promptkb"

| Platform | Default URL(s) | Notes |
|----------|----------------|--------|
| **Z4 App Service (containers)** | **`https://promptkb.azurewebsites.net`** | One app name = one predictable URL. Same for backend and frontend if you use two Web Apps (e.g. `promptkb.azurewebsites.net` for frontend, `promptkb-api.azurewebsites.net` for backend). |
| **Z5 Container Apps** | **`https://promptkb.<environment-id>.azurecontainerapps.io`** | The `<environment-id>` is assigned when you create the Container Apps *environment* (e.g. `bluegrass-0a1b2c3d`). Example: `https://promptkb.bluegrass-0a1b2c3d.azurecontainerapps.io`. The FQDN is static for the app but the middle segment is not as "clean" as App Service. You can add a custom domain to both (e.g. `app.promptkb.com`) later. |

**Summary:** With **App Service (Z4)** you get a simple, memorable URL: **`https://promptkb.azurewebsites.net`**. With **Container Apps (Z5)** you get a URL that includes the environment identifier (e.g. **`https://promptkb.<env-id>.azurecontainerapps.io`**), which is slightly longer and less memorable unless you add a custom domain.

### 4.2 Low-traffic scenario (~20 users, irregular use)

| Aspect | Z4 App Service (containers) | Z5 Container Apps |
|--------|-----------------------------|--------------------|
| **Cost when idle** | App Service always runs at least one instance (except Free tier, which has limits). Basic B1: fixed monthly cost even with no traffic. | Can **scale to zero** (min replicas = 0). When no one visits, compute goes to zero. You still pay for the Container Apps *environment* (shared load balancer, etc.) but vCPU/memory usage can be zero. |
| **Cold start** | None if Always On is enabled (typical on Basic+). App is always warm. | If scaled to zero: first request after idle can take **~5–15 seconds** while the container starts. After that, responses are fast until it scales down again. For 20 friends trying occasionally, this is often acceptable. |
| **Always-on / "instant" response** | Yes on Basic tier and above. Good if you want the site to always feel instant. | Only if you set min replicas ≥ 1 (then no scale-to-zero; cost similar in spirit to a small App Service). |
| **Tiers / sizing** | Free (limited), Basic B1, Standard S1, etc. B1 is a common choice for a small app. | You set CPU/memory per revision; billing is consumption-based. With scale to zero, low traffic can mean very low compute cost. |
| **Custom domain / HTTPS** | Supported; managed TLS. | Supported; managed TLS. |
| **Deployment model** | Two Web Apps (e.g. frontend + backend) or one app with a reverse proxy in the container. | Two Container Apps (frontend + backend) in one environment, or one app that serves both. |
| **OAuth redirect URIs** | Use `https://promptkb.azurewebsites.net/api/auth/...` (or your custom domain). | Use `https://promptkb.<env-id>.azurecontainerapps.io/api/auth/...` (or your custom domain). |

### 4.3 Recommendation for "promptkb" with ~20 users, irregular use

- **Prefer Z5 Container Apps** if:
  - You want the **lowest cost** when the app is rarely used (scale to zero).
  - A **5–15 second delay** on the first visit after idle is acceptable for your friends.
  - You don't mind the default URL including the environment ID, or you're okay adding a custom domain later.

- **Prefer Z4 App Service (containers)** if:
  - You want a **simple, memorable URL** out of the box: **`https://promptkb.azurewebsites.net`**.
  - You want **no cold starts** (app always warm).
  - You're fine with a **fixed monthly cost** (e.g. B1) for "always on" and simpler mental model.

**Practical pick for your case:** For a small, irregularly used app shared with friends, **Z5 Container Apps** is often the better trade-off on cost, and the default URL is still shareable (e.g. `https://promptkb.<env-id>.azurecontainerapps.io`). If you prefer a cleaner URL and zero cold starts and are okay with a small fixed monthly fee, choose **Z4 App Service (containers)** and use **`https://promptkb.azurewebsites.net`**.

---

## 5. CI/CD notes

- **With Docker (all container options):**  
  - **AWS:** Build image in GitHub Actions (or CodeBuild), push to **ECR**, then deploy (App Runner from ECR, ECS task def update, or EKS manifest apply).  
  - **Azure:** Build image in GitHub Actions (or Azure DevOps), push to **ACR**, then deploy (Container Apps revision, App Service container update, or AKS apply).

- **Without Docker:**  
  - **AWS:** Elastic Beanstalk: deploy via EB CLI or CodePipeline (zip or Git).  
  - **Azure:** App Service: deploy via Git, zip, or Azure DevOps from repo.

- **Database migrations:** Run as part of release (e.g. backend startup job that runs `alembic upgrade head` once, or a separate migration step in pipeline before switching traffic). See [deployment_requirements.md](deployment_requirements.md).

---

## 6. Troubleshooting

- **Managed app/container platforms (App Service, Container Apps, App Runner, ECS):** Use built-in logs and metrics; add Application Insights (Azure) or X-Ray/CloudWatch (AWS) for traces and deeper diagnostics. Health endpoints (e.g. `/health`) integrate with load balancers and readiness probes.
- **VM / Docker Compose:** You configure logging (e.g. CloudWatch agent, Log Analytics) and SSH/exec for debug.
- **Kubernetes:** Rely on `kubectl logs`, events, and optional centralized logging/monitoring; most effort to operate.

---

## 7. Shortlist (non-Kubernetes)

Reasonable choices for this app, **without** Kubernetes:

| Cloud | Option | Why consider |
|-------|--------|--------------|
| **AWS** | **A6 App Runner** | Easiest Docker path; good CI/CD; low ops. |
| **AWS** | **A4 ECS Fargate** | More control than App Runner; no VM management. |
| **AWS** | **A2 Elastic Beanstalk** | No Docker; platform-managed; familiar to many. |
| **Azure** | **Z5 Container Apps** | Easy Docker-based deploy; scale to zero; good DX. |
| **Azure** | **Z4 App Service (containers)** | Simple if you already use App Service; good integration. |

---

## 8. Recommended option

**Recommended: Azure Container Apps (Z5) or AWS App Runner (A6), with Docker and managed PostgreSQL.**

- **Docker:** Use your existing Dockerfiles; add a production backend Dockerfile that runs `uvicorn` without `--reload` and a frontend Dockerfile that builds with `npm run build` and serves static files (e.g. nginx or a small server).
- **Database:** Use **Azure Database for PostgreSQL (Flexible Server)** or **Amazon RDS for PostgreSQL** with pgvector.
- **Why this recommendation:**
  - **Ease of deployment:** Both are "push image (or connect repo) and configure"; minimal infra concepts.
  - **Cost:** No control plane or node pool; you pay for app execution and DB. Fits a single app well.
  - **CI/CD:** Straightforward: build image in GitHub Actions (or Azure DevOps), push to ACR/ECR, deploy new revision/service.
  - **Troubleshooting:** Built-in logs and metrics; optional Application Insights (Azure) or CloudWatch/X-Ray (AWS).
  - **No Kubernetes:** Avoids the complexity and cost of EKS/AKS for this scope.

**Choose between the two by:**

- Prefer **Azure Container Apps** if you standardize on Azure (e.g. existing Azure AD, Azure DevOps, or other Azure services).
- Prefer **AWS App Runner** if you standardize on AWS (e.g. existing IAM, CodePipeline, or other AWS services).

Both satisfy the requirements in [deployment_requirements.md](deployment_requirements.md) (build artifacts, DB, config/secrets, networking, health, CI/CD, troubleshooting) with minimal operational overhead.

---

## 9. Summary table (all options)

| # | Option | Cloud | Docker | K8s | Cost | Ease | CI/CD | Troubleshooting |
|---|--------|-------|--------|-----|------|------|-------|------------------|
| A1 | EC2 + manual | AWS | No | No | $ | Hard | Custom | You own it |
| A2 | Elastic Beanstalk | AWS | No | No | $$ | Medium | Good | Good |
| A3 | EC2 + Compose | AWS | Yes | No | $$ | Medium | Good | Medium |
| A4 | ECS Fargate | AWS | Yes | No | $$ | Medium | Good | Good |
| A5 | ECS EC2 | AWS | Yes | No | $$ | Harder | Good | Good |
| A6 | App Runner | AWS | Yes | No | $$ | Easiest | Very good | Good |
| A7 | EKS | AWS | Yes | Yes | $$$ | Hard | Good | Complex |
| Z1 | VM + manual | Azure | No | No | $ | Hard | Custom | You own it |
| Z2 | App Service (code) | Azure | No | No | $$ | Medium | Good | Good |
| Z3 | VM + Compose | Azure | Yes | No | $$ | Medium | Good | Medium |
| Z4 | App Service (containers) | Azure | Yes | No | $$ | Medium | Good | Good |
| Z5 | Container Apps | Azure | Yes | No | $$ | Easy | Good | Good |
| Z6 | ACI | Azure | Yes | No | $–$$ | Simple | Basic | OK |
| Z7 | AKS | Azure | Yes | Yes | $$$ | Hard | Good | Complex |

**Legend:** $ = lower cost, $$$ = higher cost; Ease = deployment ease.

---

*For technology-agnostic deployment requirements (build, DB, config, networking, health, CI/CD, testing, troubleshooting), see [deployment_requirements.md](deployment_requirements.md).*
