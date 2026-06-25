# Estimate Engine — Spec da Fase 3 (Leads + Pipeline)

> Data: 2026-06-25
> Status: aprovado para escrita do plano de implementação da Fase 3
> Idioma: prosa em português (Brasil); modelos, código, nomes de campos e termos técnicos em inglês.
> Pré-requisitos: Fases 1 (Calculadora) e 2 (Estimates) concluídas — ver os specs em `docs/specs/`.

---

## 1. Visão geral

A Fase 3 coloca um **funil de vendas** em volta das estimates. Até aqui, uma estimate nascia solta
(form da calculadora + contato digitado na hora). Agora o **`Lead` vira a porta de entrada**: o
prospect é cadastrado primeiro, e as estimates nascem **dentro** dele (1 lead → N estimates). Um
**Kanban** (pipeline) mostra os leads por estágio, e o usuário arrasta cards entre colunas.

O vínculo lead↔estimate é vivo: ao **enviar/aceitar/recusar** uma estimate, o lead **auto-avança**
de estágio (um *seam* de eventos de domínio leve). A conversão `won → Customer` (a ponte com o m4m)
continua **fora de escopo** — é a Fase 4.

## 2. Objetivos de aprendizado

- **Relações entre entidades**: `Lead 1—N Estimate` (FK, leitura por relação).
- **Kanban / board UI** com **drag-and-drop** (`dnd-kit`) movendo estado.
- **Seam de eventos de domínio** (leve): uma transição de estimate empurra o estágio do lead, via
  uma função pura testável e uma dependência explícita (sem framework de eventos).
- **Migração de schema** que evolui uma tabela existente (adicionar FK em `estimates`).
- Continuação: domínio puro + TDD, camadas `domain / modules / infra`, validação em duas camadas.

## 3. Decisões de domínio registradas

1. **Lead é o ponto de entrada.** Cria-se o lead; as estimates são criadas a partir dele e ganham
   `leadId`. O `customer` embutido na estimate (snapshot da Fase 2) passa a ser **prefillado do
   lead** no momento da criação — continua congelado na estimate.
2. **`leadId` obrigatório em estimates novas.** No banco a coluna é *nullable* (estimates da Fase 2
   não têm lead), mas o fluxo novo sempre seta. A API de criação passa a exigir `leadId`.
3. **Estágios fixos (enum):** `new_lead → contacted → estimate_sent → won → lost`. `won` e `lost`
   são terminais. Estágios configuráveis ficam para a fase de suporte (YAGNI agora).
4. **Movimentação híbrida:** o usuário **arrasta** o card livremente entre colunas (define o stage),
   **e** eventos da estimate **auto-avançam** o stage:
   - `send` → `estimate_sent` · `accept` → `won` · `decline` → `lost`.
5. **Guarda do auto-avanço:** o auto-avanço **não rebaixa** um lead já em `won` (um decline tardio de
   outra estimate não "des-ganha" o lead). O drag manual sempre pode sobrescrever. Regra pura,
   testável (função `nextStage`).
6. **`source` e `notes`** são campos **opcionais** do lead (texto livre). Sem catálogo, sem enum.

## 4. Modelo de domínio

```ts
import type { QuoteInput } from "../pricing/types";

export type LeadStage = "new_lead" | "contacted" | "estimate_sent" | "won" | "lost";

export interface LeadContact {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface Lead {
  id: string; // uuid
  contact: LeadContact;
  source: string | null; // ex.: "website", "referral" — texto livre, opcional
  notes: string | null;
  stage: LeadStage;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// Card do Kanban (a lista do board não precisa de notes/source).
export interface LeadSummary {
  id: string;
  name: string; // contact.name
  stage: LeadStage;
  createdAt: string;
}
```

### 4.1 Estágios e o seam de eventos (domínio puro)

`src/domain/lead/stage.ts` — sem máquina estrita (drag é livre), só helpers puros:

```ts
// Ordem das colunas no board.
export const LEAD_STAGES: LeadStage[] = ["new_lead", "contacted", "estimate_sent", "won", "lost"];

export type EstimateEvent = "sent" | "accepted" | "declined";

// Mapa do auto-avanço: qual stage um evento de estimate sugere.
export function stageForEstimateEvent(event: EstimateEvent): LeadStage; // sent->estimate_sent, accepted->won, declined->lost

export function isTerminal(stage: LeadStage): boolean; // won | lost

// Aplica o auto-avanço COM a guarda da decisão 5: nunca rebaixa um lead já em "won".
export function nextStage(current: LeadStage, event: EstimateEvent): LeadStage;
```

> `nextStage` é o coração do seam: o `estimate service` chama `nextStage(lead.stage, event)` e grava
> o resultado. Toda a regra de "como um evento move o lead" mora aqui — uma fonte da verdade, pura.

## 5. Erros

| Erro (domínio) | Significado | HTTP |
|----------------|-------------|------|
| `LeadNotFoundError` | `id` de lead não encontrado | **404** |
| (Zod falhou) | shape/stage inválido no body | **400** |

O `error-handler` central (Fase 2) é estendido para mapear `LeadNotFoundError` → 404.

## 6. Persistência

### 6.1 Tabela `leads`

| Coluna | Tipo (Postgres) | Notas |
|--------|-----------------|-------|
| `id` | `uuid` PK (`gen_random_uuid()`) | |
| `contact` | `jsonb` (`$type<LeadContact>()`) | contato |
| `source` | `text` null | opcional |
| `notes` | `text` null | opcional |
| `stage` | `pgEnum` (`new_lead`/`contacted`/`estimate_sent`/`won`/`lost`) default `new_lead` | |
| `created_at` | `timestamptz` default now | |
| `updated_at` | `timestamptz` default now | |

### 6.2 Evolução da `estimates`

Adicionar `lead_id uuid` referenciando `leads.id` (nullable — estimates da Fase 2 não têm lead).
Uma migration `ALTER TABLE`.

### 6.3 Repositories

- `LeadRepository`: `create`, `list` (summaries p/ o board), `getById`, `update` (contato/source/notes),
  `updateStage` (o drag).
- `EstimateRepository`: ganha `listByLead(leadId): Promise<EstimateSummary[]>`.

## 7. API

### 7.1 Leads (`modules/leads`)

| Método | Rota | Função |
|--------|------|--------|
| `POST` | `/api/leads` | cria lead (stage `new_lead`). |
| `GET` | `/api/leads` | lista (`LeadSummary[]`) para o board. |
| `GET` | `/api/leads/:id` | detalhe (`Lead`). 404 se não existe. |
| `PUT` | `/api/leads/:id` | edita contato/source/notes. |
| `PATCH` | `/api/leads/:id/stage` | move de estágio (o drag). Body: `{ stage }`. |
| `GET` | `/api/leads/:id/estimates` | estimates do lead (`EstimateSummary[]`). |

### 7.2 Mudança na criação de estimate

`POST /api/estimates` passa a receber `{ leadId, input }` (sem `customer`). O service busca o lead,
copia `lead.contact` para o `customer` snapshot da estimate e roda `calculate`. Se o `leadId` não
existe → `LeadNotFoundError` (404).

### 7.3 Seam de eventos (auto-avanço)

O `estimate service` recebe a dependência `leads: LeadStore`. Em `sendEstimate`, `acceptByToken` e
`declineByToken`, após a transição da estimate, chama `nextStage(lead.stage, event)` e grava via
`leads.updateStage`. Se a estimate não tiver `leadId` (legado), o passo é pulado.

## 8. Frontend

- **`/pipeline`** — Kanban: cinco colunas (`LEAD_STAGES`), cards = leads, **drag-and-drop com
  `dnd-kit`**; soltar um card numa coluna chama `PATCH /api/leads/:id/stage`.
- **`/leads/:id`** — detalhe do lead: contato + notes + **lista de estimates** + botão "Nova estimate
  para este lead" (abre a calculadora já vinculada ao `leadId`).
- **Form de novo lead** (`/leads/new` ou modal). 
- A criação de estimate (Fase 2) **perde o bloco customer solto** — o contato vem do lead.
- Navegação ganha **Pipeline** e **Leads**.

## 9. Testes (TDD, Vitest)

- **Domínio — stage:** `stageForEstimateEvent` (os três mapeamentos), `isTerminal`, e `nextStage`
  (auto-avanço normal **e** a guarda do `won`: `nextStage("won", "declined") === "won"`).
- **Repository (integração, skipIf):** `LeadRepository` CRUD + `updateStage`; `listByLead`.
- **Estimate service (fakes):** criar a partir de `leadId` copia o contato; `leadId` inexistente →
  `LeadNotFoundError`; ao enviar/aceitar/recusar, o `LeadStore` fake recebe o stage certo; a guarda
  do `won` segura.
- **HTTP (`app.inject`):** CRUD de leads; `PATCH /stage`; `POST /api/estimates` sem `leadId` → 400,
  com `leadId` inexistente → 404; `GET /api/leads/:id/estimates`.

## 10. Critérios de aceite

- [ ] Domínio de stage coberto por testes (incluindo a guarda do `won`).
- [ ] `leads` persistida; `estimates.lead_id` adicionado por migration.
- [ ] CRUD de leads + `PATCH /stage` funcionando; `GET /api/leads/:id/estimates` lista por relação.
- [ ] `POST /api/estimates` exige `leadId` e prefilla o `customer` snapshot do lead.
- [ ] Enviar/aceitar/recusar uma estimate auto-avança o lead (com a guarda do `won`).
- [ ] Kanban com drag-and-drop movendo o estágio; tela de detalhe do lead com suas estimates.

## 11. Entregáveis de documentação (mesmo formato didático)

1. Este **spec** (`docs/specs/2026-06-25-estimate-engine-fase-3-leads-pipeline-design.md`).
2. **Plano-gabarito** (`docs/plans/2026-06-25-fase-3-leads-pipeline.md`), TDD task-by-task.
3. **Guias** novos (só *models* + testes, **sem corpos de implementação**):
   - `14-lead-dominio-e-pipeline.md` — entidade Lead, estágios e o seam de eventos.
   - `15-persistencia-e-seam-de-eventos.md` — schema `leads`, migration na `estimates`, repository, auto-avanço.
   - `16-http-leads.md` — CRUD de leads, `PATCH /stage`, mudança no `POST /estimates`.
   - `17-frontend-kanban.md` — `dnd-kit`, board, detalhe do lead, criação de estimate vinculada.
4. Atualizar `spec-docs.html` (array `DOCS`) com os novos documentos.

## 12. Decisões em aberto (fases futuras)

- **Fase 4:** `won → Customer` (ponte m4m), formalizando o seam de eventos (event bus/handlers).
- Estágios configuráveis (renomear/reordenar) — fase de suporte.
- Reabrir um lead `won`/`lost`; histórico de mudanças de estágio (audit) — fase de suporte.
- Atribuição de lead a um usuário/owner — depende de auth (Fase 5).
