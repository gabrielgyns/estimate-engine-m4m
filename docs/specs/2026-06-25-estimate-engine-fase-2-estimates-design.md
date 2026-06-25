# Estimate Engine — Spec da Fase 2 (Estimates)

> Data: 2026-06-25
> Status: aprovado para escrita do plano de implementação da Fase 2
> Idioma: prosa em português (Brasil); modelos, código, nomes de campos e termos técnicos em inglês.
> Pré-requisito: Fase 1 (Calculadora) concluída — ver `docs/specs/2026-06-22-estimate-engine-calculadora-design.md`.

---

## 1. Visão geral

A Fase 2 transforma um **cálculo efêmero** (Fase 1: `QuoteInput → QuoteBreakdown`, stateless) numa
**estimate persistida**: um documento com identidade, dono (dados de contato), estado e um link
público onde o cliente aceita ou recusa. É o passo que fecha o loop *lead-to-quote*.

A engine de preços da Fase 1 é **reusada como está**. A Fase 2 adiciona, em volta dela:
identidade, *snapshot* do cálculo, uma **máquina de estado** e uma **rota pública por token**.

Integração com o m4m fica **fora de escopo** nesta fase (a ponte `Customer` é a Fase 4). Aqui
guardamos apenas os dados de contato necessários, embutidos na própria estimate.

## 2. Objetivos de aprendizado

- **CRUD real** com Drizzle: create → read (list/detail) → update → ação de transição.
- **Máquina de estado** como domínio puro: transições válidas/inválidas testáveis sem DB/HTTP.
- **Snapshot / imutabilidade**: congelar o resultado para que mudanças futuras na config não
  alterem estimates já enviadas.
- **Rota pública sem auth**: um *token* inguessável como credencial; superfície de dados reduzida
  (a página pública nunca vê a config interna).
- **react-router** no frontend: múltiplas telas (lista, detalhe, criação, página pública isolada).
- Continuação da disciplina da Fase 1: dinheiro em cents, TDD com Vitest, camadas
  `domain / modules / infra`, validação em duas camadas (Zod na fronteira + erros de domínio).

## 3. Decisões de domínio registradas

1. **Contato embutido (snapshot).** Os dados de contato (`customer`: name/email/phone/address)
   ficam **na própria linha da estimate** como JSONB. Sem tabela `Lead`/`Customer` nesta fase —
   elas nascem nas Fases 3/4 e ganharão um FK opcional na estimate. Zero join, zero entidade
   antes da hora.
2. **Estimate auto-contida.** A estimate persiste o `QuoteInput` **e** o `QuoteBreakdown` inteiro
   (itemizado) como JSONB. Para exibir, lê-se o JSON — **nunca recalcula**. Isso congela os
   add-ons (suas linhas já carregam nome + preço unitário) e o preço final automaticamente.
3. **Ciclo de status:** `draft → sent → {accepted | declined}`. Só essas transições são válidas.
4. **Draft é editável.** Em `draft`, editar reexecuta a engine com a `PricingConfig` **atual** e
   regrava o breakdown (o backend é a fonte da verdade). Ao **send**, a estimate **congela**:
   editar uma estimate não-`draft` é proibido.
5. **Token é a credencial pública.** Cada estimate tem um `publicToken` aleatório inguessável,
   separado do `id` interno. A URL pública usa o token; o `id` nunca é exposto.
6. **Página pública sem fricção.** O cliente apenas clica Accept/Decline (não digita nome nem
   assina) — escopo de estudo. Assinatura/aceite formal fica para fase posterior, se um dia.

## 4. Modelo de domínio

```ts
// Reaproveita os tipos da Fase 1 (de src/domain/pricing/types.ts e money.ts).
import type { QuoteInput, QuoteBreakdown } from "../pricing/types.js";
import type { Money } from "../pricing/money.js";

export type EstimateStatus = "draft" | "sent" | "accepted" | "declined";

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface Estimate {
  id: string;            // uuid — chave interna, nunca exposta na rota pública
  number: number;        // sequencial legível (exibido como "EST-0007")
  publicToken: string;   // credencial da página pública (inguessável)
  customer: CustomerInfo;
  input: QuoteInput;          // snapshot da entrada
  breakdown: QuoteBreakdown;  // snapshot do cálculo (congelado)
  status: EstimateStatus;
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
  sentAt: string | null;     // setado na transição → sent
  decidedAt: string | null;  // setado na transição → accepted | declined
}

// Resumo para a tela de listagem (evita trafegar o breakdown inteiro na lista).
export interface EstimateSummary {
  id: string;
  number: number;
  customerName: string;
  total: Money;          // breakdown.total
  status: EstimateStatus;
  createdAt: string;
}

// Visão sanitizada da rota pública: o necessário para o cliente decidir, nada interno.
export interface PublicEstimateView {
  number: number;
  customer: CustomerInfo;
  breakdown: QuoteBreakdown;
  status: EstimateStatus;
}
```

### 4.1 Máquina de estado (domínio puro)

`src/domain/estimate/status.ts` — sem dependência de HTTP nem DB. Transições válidas:

```
draft  ── send ──▶  sent
sent   ── accept ─▶  accepted
sent   ── decline ▶  declined
```

Qualquer outra transição (aceitar uma `draft`, reenviar uma `accepted`, editar fora de `draft`)
é inválida e lança `EstimateStatusError`.

```ts
// Conjunto de transições permitidas; função pura que valida ou lança.
export const ALLOWED_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "declined"],
  accepted: [],
  declined: [],
};

// Lança EstimateStatusError se (from → to) não for permitido.
export function assertTransition(from: EstimateStatus, to: EstimateStatus): void;
```

## 5. Erros (estendem o padrão da Fase 1)

Mesmo modelo de erros de domínio mapeados a HTTP por um error-handler central:

| Erro (domínio/módulo) | Significado | HTTP |
|-----------------------|-------------|------|
| `EstimateStatusError` | Transição/edição inválida para o status atual | **409** |
| `EstimateNotFoundError` | `id`/`token` não encontrado | **404** |
| (Zod falhou na fronteira) | Shape/tipos inválidos no body | **400** |
| `PricingError` (Fase 1) | Input viola invariante da engine | **400** |

O `error-handler` da Fase 1 é estendido para reconhecer `EstimateStatusError` (409) e
`EstimateNotFoundError` (404), mantendo `PricingError` → 400.

## 6. Persistência (`infra/db/schema.ts`)

Tabela `estimates`:

| Coluna | Tipo (Postgres) | Notas |
|--------|-----------------|-------|
| `id` | `uuid` PK (default `gen_random_uuid()`) | chave interna |
| `number` | `integer generated always as identity` | sequencial legível |
| `public_token` | `text` unique not null | credencial pública (`crypto.randomBytes(24).toString("base64url")`) |
| `customer` | `jsonb` (`$type<CustomerInfo>()`) | snapshot de contato |
| `input` | `jsonb` (`$type<QuoteInput>()`) | snapshot da entrada |
| `breakdown` | `jsonb` (`$type<QuoteBreakdown>()`) | snapshot do cálculo (congelado) |
| `status` | `pgEnum` (`draft`/`sent`/`accepted`/`declined`) default `draft` | |
| `created_at` | `timestamptz` default now | |
| `updated_at` | `timestamptz` default now | |
| `sent_at` | `timestamptz` null | |
| `decided_at` | `timestamptz` null | |

Repository (`modules/estimates/repository.ts`) segue o molde do `PricingConfigRepository`:
injeção de `Db`, interface (`EstimateStore`) para permitir *fake* nos testes de HTTP, e testes de
integração com `describe.skipIf(!process.env.DATABASE_URL)`.

```ts
export interface EstimateStore {
  create(data: NewEstimate): Promise<Estimate>;
  list(): Promise<EstimateSummary[]>;
  getById(id: string): Promise<Estimate | null>;
  getByToken(token: string): Promise<Estimate | null>;
  update(id: string, patch: EstimatePatch): Promise<Estimate>;
}
```

## 7. API

### 7.1 Admin (`modules/estimates/routes.ts`)

| Método | Rota | Função |
|--------|------|--------|
| `POST` | `/api/estimates` | `{ customer, input }` → busca config atual, roda `calculate`, grava. Status `draft`. |
| `GET`  | `/api/estimates` | Lista (`EstimateSummary[]`). |
| `GET`  | `/api/estimates/:id` | Detalhe (`Estimate`). 404 se não existe. |
| `PUT`  | `/api/estimates/:id` | `{ customer, input }`. **Só em `draft`** — recalcula e regrava. 409 caso contrário. |
| `POST` | `/api/estimates/:id/send` | `draft → sent`. Seta `sentAt`. 409 se não-`draft`. |

### 7.2 Pública (`modules/estimates/public-routes.ts`) — sem auth, token é a credencial

| Método | Rota | Função |
|--------|------|--------|
| `GET`  | `/api/public/estimates/:token` | `PublicEstimateView` (sem config interna). 404 se token inválido **ou** status `draft`. |
| `POST` | `/api/public/estimates/:token/accept` | `sent → accepted`. Seta `decidedAt`. 409 se não-`sent`. |
| `POST` | `/api/public/estimates/:token/decline` | `sent → declined`. Seta `decidedAt`. 409 se não-`sent`. |

**Princípio:** o backend continua a fonte da verdade. O front nunca recalcula nem reimplementa a
fórmula; lê o `breakdown` congelado. A rota pública expõe um subconjunto reduzido (sem `id`,
sem `input` cru, sem `PricingConfig`).

## 8. Frontend (react-router entra nesta fase)

- **Criação:** reusa a tela da calculadora da Fase 1 (preview ao vivo via `/quotes/calculate`)
  + um bloco de campos `customer` + botão **"Salvar como rascunho"** → `POST /api/estimates`.
- **`/estimates`** — lista: `number` (formatado `EST-0007`), customer, total, status, data.
- **`/estimates/:id`** — detalhe admin: `BreakdownPanel` read-only (reusado da Fase 1), dados do
  customer, status, e ações: **Send** (`draft`) → revela/copia o link público; em `sent`, mostra
  o link e o status.
- **`/e/:token`** — **página pública isolada** (sem a navegação do app): breakdown read-only +
  botões **Accept/Decline** → tela de confirmação. Em estimate já decidida, mostra o resultado.

Rotas: `/` (calculadora/nova), `/estimates`, `/estimates/:id`, `/e/:token`, `/config`.

## 9. Testes (TDD, Vitest)

- **Domínio — máquina de estado:** cada transição válida passa; cada inválida lança
  `EstimateStatusError` (aceitar `draft`, reenviar `accepted`, declinar `declined`, etc.).
- **Repository (integração, `skipIf` sem DB):** create gera `id`/`number`/`publicToken`;
  getById/getByToken; update troca status e timestamps; list devolve summaries.
- **HTTP (`app.inject`, store *fake*):**
  - `POST /api/estimates` cria em `draft` com breakdown do golden case (total 19000).
  - `PUT` em `draft` recalcula; `PUT` em `sent` → 409 (congelado).
  - `POST /:id/send` → `sent`.
  - `GET /api/public/estimates/:token` de uma `sent` retorna view sanitizada; de uma `draft` → 404.
  - `accept`/`decline` em `sent` mudam status; em não-`sent` → 409.
  - token inexistente → 404.

## 10. Critérios de aceite

- [ ] Máquina de estado coberta por testes (todas as transições válidas e inválidas) verdes.
- [ ] `POST /api/estimates` persiste input + breakdown congelado; cria em `draft` com `number` e `publicToken`.
- [ ] `PUT` recalcula em `draft` e é bloqueado (409) fora de `draft`.
- [ ] `send`/`accept`/`decline` aplicam as transições e os timestamps corretos.
- [ ] Rota pública por token mostra a view sanitizada e nunca expõe `id`/config; `draft` não é público.
- [ ] Frontend: criar (reusando a calculadora) → listar → detalhar → enviar → aceitar/recusar na página pública.
- [ ] Dinheiro segue em cents inteiros; nenhum valor monetário recalculado no front.

## 11. Entregáveis de documentação (mesmo formato didático da Fase 1)

1. Este **spec** (`docs/specs/2026-06-25-estimate-engine-fase-2-estimates-design.md`).
2. **Plano-gabarito** de implementação (`docs/plans/2026-06-25-fase-2-estimates.md`), TDD task-by-task.
3. **Guias de estudo** novos (só *models* + testes, **sem corpos de implementação**):
   - `10-estimate-dominio-e-status.md` — entidade Estimate + máquina de estado.
   - `11-persistencia-estimates.md` — schema, repository, snapshot/JSONB.
   - `12-http-e-pagina-publica.md` — CRUD admin + rota pública por token.
   - `13-frontend-estimates-e-router.md` — react-router, lista/detalhe/criação + página pública.
4. Atualizar `spec-docs.html` (array `DOCS`) com os novos documentos.

## 12. Decisões em aberto (para fases futuras)

- FK opcional `leadId`/`customerId` na estimate (Fases 3/4) e a ponte com o m4m.
- Expiração de estimate (`expired`) e validade temporal — adiável para a Fase 5.
- Reenvio/duplicação de estimate, e edição pós-envio via nova versão (versionamento) — fora de escopo.
- Notificação por email do link público — depende de infra de email (fase de suporte).
