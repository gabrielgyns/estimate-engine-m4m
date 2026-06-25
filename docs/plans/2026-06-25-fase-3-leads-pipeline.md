# Fase 3 — Leads + Pipeline — Implementation Plan (gabarito)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-by-task. Steps usam checkbox (`- [ ]`).
>
> **Como usar (estudo):** este é o *gabarito*. Os guias `docs/guides/14`–`17` ensinam o mesmo
> entregando só *models* + testes. Tente implementar pelos guias; consulte aqui quando travar.

**Goal:** Colocar um funil de vendas em volta das estimates — `Lead` como ponto de entrada
(1 lead → N estimates), um Kanban com drag-and-drop entre estágios fixos, e um *seam* de eventos
leve onde transições da estimate auto-avançam o estágio do lead.

**Architecture:** Mantém as camadas `src/domain` (puro) ← `src/modules/<feature>` ← `src/infra`. Adiciona
o domínio `lead` (tipos + helpers de estágio puros, incluindo `nextStage`), a tabela `leads` e uma
migration que adiciona `lead_id` em `estimates`. O `estimate service` passa a depender de uma
`LeadStore`: cria estimate a partir de um `leadId` (copiando o contato) e, ao enviar/aceitar/recusar,
chama `nextStage` para empurrar o estágio do lead. Frontend ganha um board com `dnd-kit`.

**Tech Stack:** Bun, TypeScript (ESM), Fastify, Zod, Drizzle ORM + drizzle-kit + `pg`, Postgres 15+,
Vitest; React 19, Vite, Tailwind v4, react-router, TanStack Query, `@dnd-kit/core`, axios.

## Global Constraints

- Prosa em português (Brasil); código, identificadores e termos técnicos em inglês.
- **Estrutura por papel:** `src/domain` (puro) ← `src/modules/<feature>` ← `src/infra`. A seta de
  dependência aponta sempre pra dentro.
- **Runtime Bun.** Testes: `bunx vitest run <path>`. Imports relativos **sem extensão** (`moduleResolution: bundler`).
- Dinheiro em cents; o frontend nunca recalcula preço.
- **Lead é o ponto de entrada:** estimate exige `leadId`; o `customer` snapshot é copiado do lead.
- **Estágios fixos:** `new_lead → contacted → estimate_sent → won → lost` (won/lost terminais).
- **Movimentação híbrida:** drag livre **+** auto-avanço por evento (`send→estimate_sent`,
  `accept→won`, `decline→lost`). **Guarda:** o auto-avanço **não rebaixa** um lead já em `won`.
- **Erros → HTTP:** `LeadNotFoundError` → **404**; Zod inválido → **400** (somando-se aos da Fase 2).
- Spec de referência: `docs/specs/2026-06-25-estimate-engine-fase-3-leads-pipeline-design.md`.

## Pré-requisitos (Fases 1 e 2, assumidos prontos)

- `src/domain/pricing/*` (`calculate`, `types`, `config`, `errors`).
- `src/domain/estimate/{types,errors,status}.ts` (`Estimate`, `assertTransition`, `EstimateNotFoundError`).
- `src/modules/estimates/{repository,service,schema,routes,public-routes,token}.ts`.
- `src/modules/pricing-config/repository.ts` (`ConfigStore`).
- `src/infra/http/{error-handler,build-server}.ts` (`ServerDeps`, `buildServer`, `registerErrorHandler`).
- `src/infra/db/index.ts` (singleton `db`) e `src/infra/db/schemas/index.ts` (objeto `schema`).
- Frontend Fase 2: react-router, `api`, `BreakdownPanel`, `formatCents`, páginas de estimate.

---

### Task 1: Domínio — Lead, estágios e o seam (`nextStage`) (TDD)

**Files:**
- Create: `src/domain/lead/types.ts`
- Create: `src/domain/lead/errors.ts`
- Create: `src/domain/lead/stage.ts`
- Test: `src/domain/lead/stage.test.ts`

**Interfaces:**
- Consumes: nada do projeto (domínio puro).
- Produces: `LeadStage`, `Lead` (contato em campos planos), `LeadSummary`; `LeadNotFoundError`; `LEAD_STAGES`,
  `EstimateEvent`, `stageForEstimateEvent(event)`, `isTerminal(stage)`, `nextStage(current, event)`.

- [ ] **Step 1: Tipos**

`src/domain/lead/types.ts`:

```ts
export type LeadStage = "new_lead" | "contacted" | "estimate_sent" | "won" | "lost";

// Contato em campos PLANOS (o lead é dado vivo/consultável -> colunas, não jsonb).
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  source: string | null;
  notes: string | null;
  stage: LeadStage;
  createdAt: string;
  updatedAt: string;
}

export interface LeadSummary {
  id: string;
  name: string;
  stage: LeadStage;
  createdAt: string;
}
```

- [ ] **Step 2: Erro**

`src/domain/lead/errors.ts`:

```ts
export class LeadError extends Error {}
export class LeadNotFoundError extends LeadError {
  constructor() {
    super("lead não encontrado");
    this.name = "LeadNotFoundError";
  }
}
```

- [ ] **Step 3: Escrever o teste que falha (estágios e nextStage)**

`src/domain/lead/stage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTerminal, nextStage, stageForEstimateEvent } from "./stage";

describe("stageForEstimateEvent", () => {
  it("mapeia evento -> estágio sugerido", () => {
    expect(stageForEstimateEvent("sent")).toBe("estimate_sent");
    expect(stageForEstimateEvent("accepted")).toBe("won");
    expect(stageForEstimateEvent("declined")).toBe("lost");
  });
});

describe("isTerminal", () => {
  it("won e lost são terminais; os outros não", () => {
    expect(isTerminal("won")).toBe(true);
    expect(isTerminal("lost")).toBe(true);
    expect(isTerminal("new_lead")).toBe(false);
    expect(isTerminal("estimate_sent")).toBe(false);
  });
});

describe("nextStage (auto-avanço com guarda do won)", () => {
  it("avança normalmente", () => {
    expect(nextStage("new_lead", "sent")).toBe("estimate_sent");
    expect(nextStage("estimate_sent", "accepted")).toBe("won");
    expect(nextStage("estimate_sent", "declined")).toBe("lost");
  });

  it("NÃO rebaixa um lead já em won", () => {
    expect(nextStage("won", "declined")).toBe("won");
    expect(nextStage("won", "sent")).toBe("won");
  });
});
```

- [ ] **Step 4: Rodar e verificar que falha**

Run: `bunx vitest run src/domain/lead/stage.test.ts`
Expected: FAIL (`Cannot find module './stage'`).

- [ ] **Step 5: Implementar os helpers de estágio**

`src/domain/lead/stage.ts`:

```ts
import type { LeadStage } from "./types";

export const LEAD_STAGES: LeadStage[] = ["new_lead", "contacted", "estimate_sent", "won", "lost"];

export type EstimateEvent = "sent" | "accepted" | "declined";

// Mapa do auto-avanço: que estágio um evento de estimate sugere.
export function stageForEstimateEvent(event: EstimateEvent): LeadStage {
  if (event === "sent") return "estimate_sent";
  if (event === "accepted") return "won";
  return "lost"; // declined
}

export function isTerminal(stage: LeadStage): boolean {
  return stage === "won" || stage === "lost";
}

// Aplica o auto-avanço com a guarda: nunca rebaixa um lead já ganho.
export function nextStage(current: LeadStage, event: EstimateEvent): LeadStage {
  if (current === "won") return "won";
  return stageForEstimateEvent(event);
}
```

- [ ] **Step 6: Rodar e verificar que passa**

Run: `bunx vitest run src/domain/lead/stage.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/lead
git commit -m "feat(lead): domain types, errors and stage helpers (nextStage)"
```

---

### Task 2: Persistência — tabela `leads` + `lead_id` em `estimates`

**Files:**
- Create: `src/infra/db/schemas/leads.ts`
- Modify: `src/infra/db/schemas/estimates.ts`
- Modify: `src/infra/db/schemas/index.ts`
- Modify: `src/domain/estimate/types.ts`
- Modify: `src/modules/estimates/repository.ts`

**Interfaces:**
- Consumes: `LeadStage`.
- Produces: tabela `leads` + enum `leadStage`; coluna `leadId` em `estimates`; `Estimate.leadId: string | null`;
  `NewEstimate.leadId: string`; `EstimateRepository.listByLead(leadId): Promise<EstimateSummary[]>`.

- [ ] **Step 1: Schema da tabela `leads`**

`src/infra/db/schemas/leads.ts`:

```ts
import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const leadStage = pgEnum("lead_stage", ["new_lead", "contacted", "estimate_sent", "won", "lost"]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  source: text("source"),
  notes: text("notes"),
  stage: leadStage("stage").notNull().default("new_lead"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Adicionar `lead_id` em `estimates`**

Em `src/infra/db/schemas/estimates.ts`, importar `leads` e adicionar a coluna (nullable):

```ts
import { leads } from "./leads";
// ...dentro de pgTable("estimates", { ...colunas existentes...,
  leadId: uuid("lead_id").references(() => leads.id),
// })
```

- [ ] **Step 3: Registrar no índice de schemas**

Em `src/infra/db/schemas/index.ts`, adicionar ao objeto `schema`:

```ts
import { leads, leadStage } from "./leads";
export const schema = { /* ...existentes (estimates, etc.)..., */ leads, leadStage };
```

- [ ] **Step 4: `Estimate` ganha `leadId`**

Em `src/domain/estimate/types.ts`, adicionar à interface `Estimate`:

```ts
  leadId: string | null;
```

- [ ] **Step 5: Repository de estimates reflete `leadId` + `listByLead`**

Em `src/modules/estimates/repository.ts`:

```ts
// 1) NewEstimate ganha leadId (obrigatório para estimates novas):
export type NewEstimate = {
  leadId: string;
  customer: CustomerInfo;
  input: QuoteInput;
  breakdown: QuoteBreakdown;
  publicToken: string;
};

// 2) toEstimate(row) passa a mapear leadId:
//    leadId: row.leadId,    // adicione esta linha no objeto retornado

// 3) novo método no contrato EstimateStore e na classe:
//    listByLead(leadId: string): Promise<EstimateSummary[]>;
```

Implementação do `listByLead` na classe `EstimateRepository`:

```ts
async listByLead(leadId: string): Promise<EstimateSummary[]> {
  const rows = await this.db
    .select()
    .from(estimates)
    .where(eq(estimates.leadId, leadId))
    .orderBy(desc(estimates.createdAt));
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    customerName: row.customer.name,
    total: row.breakdown.total,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }));
}
```

> Adicione `listByLead` também à **interface** `EstimateStore` (e aos *fakes* nas Tasks 4/5).

- [ ] **Step 6: Gerar e aplicar a migration**

Run:
```bash
bun db:up
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine'
bun db:generate
bun db:migrate
```
Expected: SQL criando `leads` (+ enum `lead_stage`) e `ALTER TABLE estimates ADD COLUMN lead_id`.

- [ ] **Step 7: Conferir**

Run: `bun db:psql -c '\d leads' && bun db:psql -c '\d estimates'`
Expected: tabela `leads` criada; `estimates` com coluna `lead_id`.

- [ ] **Step 8: Commit**

```bash
git add src/infra/db/schemas src/domain/estimate/types.ts src/modules/estimates/repository.ts drizzle
git commit -m "feat(lead): leads schema and lead_id on estimates"
```

---

### Task 3: `LeadRepository` (integração)

**Files:**
- Create: `src/modules/leads/repository.ts`
- Test: `src/modules/leads/repository.test.ts`

**Interfaces:**
- Consumes: singleton `db`, tabela `leads`, tipos do domínio lead.
- Produces:
  - `type NewLead = { name: string; email: string; phone: string; address: string; source: string | null; notes: string | null }`.
  - `type LeadPatch = Partial<NewLead>`.
  - `interface LeadStore { create(d: NewLead): Promise<Lead>; list(): Promise<LeadSummary[]>; getById(id: string): Promise<Lead | null>; update(id: string, patch: LeadPatch): Promise<Lead>; updateStage(id: string, stage: LeadStage): Promise<Lead> }`.
  - `class LeadRepository implements LeadStore`.

- [ ] **Step 1: Escrever o teste que falha (integração)**

`src/modules/leads/repository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../infra/db";
import { leads } from "../../infra/db/schemas/leads";
import { LeadRepository } from "./repository";

const url = process.env.DATABASE_URL;
const base = { name: "Helena", email: "h@x.com", phone: "1", address: "rua 1" };

describe.skipIf(!url)("LeadRepository", () => {
  const repo = new LeadRepository(db);
  beforeEach(async () => { await db.delete(leads); });

  it("cria em new_lead e relê", async () => {
    const created = await repo.create({ ...base, source: "website", notes: null });
    expect(created.id).toBeTruthy();
    expect(created.stage).toBe("new_lead");
    expect((await repo.getById(created.id))?.name).toBe("Helena");
  });

  it("move de estágio", async () => {
    const created = await repo.create({ ...base, source: null, notes: null });
    const moved = await repo.updateStage(created.id, "contacted");
    expect(moved.stage).toBe("contacted");
  });

  it("lista summaries", async () => {
    await repo.create({ ...base, source: null, notes: null });
    const rows = await repo.list();
    expect(rows[0].name).toBe("Helena");
    expect(rows[0].stage).toBe("new_lead");
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine' && bunx vitest run src/modules/leads/repository.test.ts`
Expected: FAIL (`Cannot find module './repository'`).

- [ ] **Step 3: Implementar o repository**

`src/modules/leads/repository.ts`:

```ts
import { desc, eq } from "drizzle-orm";
import { db } from "../../infra/db";
import { leads } from "../../infra/db/schemas/leads";
import type { Lead, LeadStage, LeadSummary } from "../../domain/lead/types";

export type NewLead = { name: string; email: string; phone: string; address: string; source: string | null; notes: string | null };
export type LeadPatch = Partial<NewLead>;

export interface LeadStore {
  create(data: NewLead): Promise<Lead>;
  list(): Promise<LeadSummary[]>;
  getById(id: string): Promise<Lead | null>;
  update(id: string, patch: LeadPatch): Promise<Lead>;
  updateStage(id: string, stage: LeadStage): Promise<Lead>;
}

export type Db = typeof db;
type Row = typeof leads.$inferSelect;

// Domínio e banco são planos -> o mapper só ajusta os timestamps (Date -> ISO string).
function toLead(row: Row): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    source: row.source,
    notes: row.notes,
    stage: row.stage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class LeadRepository implements LeadStore {
  constructor(private db: Db) {}

  async create(data: NewLead): Promise<Lead> {
    const [row] = await this.db.insert(leads).values(data).returning();
    return toLead(row);
  }

  async list(): Promise<LeadSummary[]> {
    const rows = await this.db.select().from(leads).orderBy(desc(leads.createdAt));
    return rows.map((row) => ({
      id: row.id, name: row.name, stage: row.stage, createdAt: row.createdAt.toISOString(),
    }));
  }

  async getById(id: string): Promise<Lead | null> {
    const rows = await this.db.select().from(leads).where(eq(leads.id, id));
    return rows[0] ? toLead(rows[0]) : null;
  }

  async update(id: string, patch: LeadPatch): Promise<Lead> {
    const [row] = await this.db
      .update(leads).set({ ...patch, updatedAt: new Date() }).where(eq(leads.id, id)).returning();
    return toLead(row);
  }

  async updateStage(id: string, stage: LeadStage): Promise<Lead> {
    const [row] = await this.db
      .update(leads).set({ stage, updatedAt: new Date() }).where(eq(leads.id, id)).returning();
    return toLead(row);
  }
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine' && bunx vitest run src/modules/leads/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leads/repository.ts src/modules/leads/repository.test.ts
git commit -m "feat(lead): repository (CRUD + updateStage)"
```

---

### Task 4: Services — lead service + estimate service (create-from-lead + auto-avanço)

**Files:**
- Create: `src/modules/leads/schema.ts`
- Create: `src/modules/leads/service.ts`
- Test: `src/modules/leads/service.test.ts`
- Modify: `src/modules/estimates/service.ts`
- Test: `src/modules/estimates/service.test.ts`

**Interfaces:**
- Consumes: `LeadStore`, `nextStage`, `LeadNotFoundError`, `calculate`, `EstimateStore`, `ConfigStore`.
- Produces:
  - `leadInputSchema` (Zod) + `type LeadInput = z.infer<typeof leadInputSchema>` (DTO inferido) + `stageSchema`.
  - Lead service: `LeadDeps = { leads: LeadStore }`; `createLead(deps, dto)`, `updateLead(deps, id, dto)`, `moveStage(deps, id, stage)`, `getLeadOr404(store, id)`.
  - Estimate service (alterado): `EstimateDeps = { estimates: EstimateStore; config: ConfigStore; leads: LeadStore }`; `EstimateInputDto = { leadId: string; input: QuoteInput }`; `EstimateUpdateDto = { input: QuoteInput }`. `createEstimate` cria a partir do lead; `sendEstimate/acceptByToken/declineByToken` auto-avançam o lead.

- [ ] **Step 1: Schema Zod (DTO inferido) + lead service**

`src/modules/leads/schema.ts` — o input nasce do Zod; o tipo do DTO sai por `z.infer` (uma fonte da verdade do contrato de entrada):

```ts
import { z } from "zod";
import { LEAD_STAGES } from "../../domain/lead/stage";

export const leadInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address: z.string().min(1),
  source: z.string().optional(),
  notes: z.string().optional(),
});
export type LeadInput = z.infer<typeof leadInputSchema>;

export const stageSchema = z.object({ stage: z.enum(LEAD_STAGES as [string, ...string[]]) });
```

`src/modules/leads/service.ts`:

```ts
import { LeadNotFoundError } from "../../domain/lead/errors";
import type { Lead, LeadStage } from "../../domain/lead/types";
import type { LeadStore, NewLead } from "./repository";
import type { LeadInput } from "./schema";

export type LeadDeps = { leads: LeadStore };

export async function getLeadOr404(store: LeadStore, id: string): Promise<Lead> {
  const lead = await store.getById(id);
  if (!lead) throw new LeadNotFoundError();
  return lead;
}

// Normaliza o DTO (source/notes opcionais) para o NewLead do repo (string | null).
function toNewLead(dto: LeadInput): NewLead {
  return {
    name: dto.name, email: dto.email, phone: dto.phone, address: dto.address,
    source: dto.source ?? null, notes: dto.notes ?? null,
  };
}

export function createLead(deps: LeadDeps, dto: LeadInput): Promise<Lead> {
  return deps.leads.create(toNewLead(dto));
}

export async function updateLead(deps: LeadDeps, id: string, dto: LeadInput): Promise<Lead> {
  await getLeadOr404(deps.leads, id);
  return deps.leads.update(id, toNewLead(dto));
}

export async function moveStage(deps: LeadDeps, id: string, stage: LeadStage): Promise<Lead> {
  await getLeadOr404(deps.leads, id);
  return deps.leads.updateStage(id, stage);
}
```

- [ ] **Step 2: Escrever o teste que falha (estimate service alterado + auto-avanço)**

Reescrever `src/modules/estimates/service.test.ts` para o novo contrato (cria a partir de `leadId` e
auto-avança o lead). Trechos essenciais (a versão completa dos fakes está no fim desta task):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { LeadNotFoundError } from "../../domain/lead/errors";
import { acceptByToken, createEstimate, declineByToken, sendEstimate } from "./service";
// FakeEstimateStore, FakeConfigStore, FakeLeadStore e o input do golden case (ver Step 5)

describe("estimate service (Fase 3)", () => {
  let deps;
  let leadId: string;
  beforeEach(async () => {
    deps = { estimates: new FakeEstimateStore(), config: new FakeConfigStore(), leads: new FakeLeadStore() };
    const lead = await deps.leads.create({
      name: "Helena", email: "h@x.com", phone: "1", address: "rua 1", source: null, notes: null,
    });
    leadId = lead.id;
  });

  it("cria a partir do lead, copiando o contato para o snapshot", async () => {
    const e = await createEstimate(deps, { leadId, input });
    expect(e.status).toBe("draft");
    expect(e.leadId).toBe(leadId);
    expect(e.customer.name).toBe("Helena");
    expect(e.breakdown.total).toBe(19000);
  });

  it("leadId inexistente -> LeadNotFoundError", async () => {
    await expect(createEstimate(deps, { leadId: "nope", input })).rejects.toThrow(LeadNotFoundError);
  });

  it("send auto-avança o lead para estimate_sent", async () => {
    const e = await createEstimate(deps, { leadId, input });
    await sendEstimate(deps, e.id);
    expect((await deps.leads.getById(leadId)).stage).toBe("estimate_sent");
  });

  it("accept -> won; decline depois NÃO rebaixa o won", async () => {
    const e = await createEstimate(deps, { leadId, input });
    await sendEstimate(deps, e.id);
    await acceptByToken(deps, e.publicToken);
    expect((await deps.leads.getById(leadId)).stage).toBe("won");

    const e2 = await createEstimate(deps, { leadId, input });
    await sendEstimate(deps, e2.id);
    await declineByToken(deps, e2.publicToken);
    expect((await deps.leads.getById(leadId)).stage).toBe("won"); // guarda do won
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `bunx vitest run src/modules/estimates/service.test.ts`
Expected: FAIL (contrato antigo `createEstimate(deps, { customer, input })`).

- [ ] **Step 4: Alterar o estimate service**

Em `src/modules/estimates/service.ts`:

```ts
import { calculate } from "../../domain/pricing/calculate";
import { assertTransition } from "../../domain/estimate/status";
import { EstimateNotFoundError } from "../../domain/estimate/errors";
import { LeadNotFoundError } from "../../domain/lead/errors";
import { nextStage, type EstimateEvent } from "../../domain/lead/stage";
import type { Estimate, EstimateStatus, PublicEstimateView } from "../../domain/estimate/types";
import type { QuoteInput } from "../../domain/pricing/types";
import type { ConfigStore } from "../pricing-config/repository";
import type { LeadStore } from "../leads/repository";
import type { EstimateStore } from "./repository";
import { generatePublicToken } from "./token";

export type EstimateDeps = { estimates: EstimateStore; config: ConfigStore; leads: LeadStore };
export type EstimateInputDto = { leadId: string; input: QuoteInput };
export type EstimateUpdateDto = { input: QuoteInput };

async function getOr404(store: EstimateStore, id: string): Promise<Estimate> {
  const e = await store.getById(id);
  if (!e) throw new EstimateNotFoundError();
  return e;
}

export async function createEstimate(deps: EstimateDeps, dto: EstimateInputDto): Promise<Estimate> {
  const lead = await deps.leads.getById(dto.leadId);
  if (!lead) throw new LeadNotFoundError();
  const config = await deps.config.get();
  const breakdown = calculate(dto.input, config);
  return deps.estimates.create({
    leadId: dto.leadId,
    // snapshot prefillado dos campos do lead
    customer: { name: lead.name, email: lead.email, phone: lead.phone, address: lead.address },
    input: dto.input,
    breakdown,
    publicToken: generatePublicToken(),
  });
}

export async function updateEstimate(deps: EstimateDeps, id: string, dto: EstimateUpdateDto): Promise<Estimate> {
  const current = await getOr404(deps.estimates, id);
  if (current.status !== "draft") assertTransition(current.status, "draft"); // congelada -> lança
  const config = await deps.config.get();
  const breakdown = calculate(dto.input, config);
  return deps.estimates.update(id, { input: dto.input, breakdown });
}

// Empurra o estágio do lead conforme o evento (sem rebaixar um won; pula se não há lead).
async function advanceLead(deps: EstimateDeps, leadId: string | null, event: EstimateEvent): Promise<void> {
  if (!leadId) return;
  const lead = await deps.leads.getById(leadId);
  if (!lead) return;
  const next = nextStage(lead.stage, event);
  if (next !== lead.stage) await deps.leads.updateStage(leadId, next);
}

async function transition(
  deps: EstimateDeps, id: string, to: EstimateStatus, stamp: "sentAt" | "decidedAt", event: EstimateEvent,
): Promise<Estimate> {
  const current = await getOr404(deps.estimates, id);
  assertTransition(current.status, to);
  const updated = await deps.estimates.update(id, { status: to, [stamp]: new Date().toISOString() });
  await advanceLead(deps, current.leadId, event);
  return updated;
}

export function sendEstimate(deps: EstimateDeps, id: string): Promise<Estimate> {
  return transition(deps, id, "sent", "sentAt", "sent");
}

async function decideByToken(deps: EstimateDeps, token: string, to: EstimateStatus, event: EstimateEvent): Promise<Estimate> {
  const current = await deps.estimates.getByToken(token);
  if (!current) throw new EstimateNotFoundError();
  assertTransition(current.status, to);
  const updated = await deps.estimates.update(current.id, { status: to, decidedAt: new Date().toISOString() });
  await advanceLead(deps, current.leadId, event);
  return updated;
}

export function acceptByToken(deps: EstimateDeps, token: string): Promise<Estimate> {
  return decideByToken(deps, token, "accepted", "accepted");
}
export function declineByToken(deps: EstimateDeps, token: string): Promise<Estimate> {
  return decideByToken(deps, token, "declined", "declined");
}

export async function getPublicView(deps: EstimateDeps, token: string): Promise<PublicEstimateView> {
  const e = await deps.estimates.getByToken(token);
  if (!e || e.status === "draft") throw new EstimateNotFoundError();
  return { number: e.number, customer: e.customer, breakdown: e.breakdown, status: e.status };
}
```

- [ ] **Step 5: Atualizar os fakes do teste**

No topo de `src/modules/estimates/service.test.ts`, os fakes (note `FakeEstimateStore.create` setando
`leadId`, e o novo `FakeLeadStore`):

```ts
import type { Estimate } from "../../domain/estimate/types";
import type { EstimatePatch, NewEstimate } from "./repository";
import type { Lead, LeadStage } from "../../domain/lead/types";
import type { NewLead, LeadPatch } from "../leads/repository";
import { defaultConfig } from "../../domain/pricing/config";

const input = {
  sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0,
  service: "deep_clean" as const, frequency: "one_time" as const, addOns: [], manualDiscount: 0,
};

class FakeConfigStore {
  config = defaultConfig();
  async get() { return this.config; }
  async save(c) { this.config = c; }
}

class FakeLeadStore {
  rows: Lead[] = [];
  seq = 0;
  async create(d: NewLead): Promise<Lead> {
    const now = new Date().toISOString();
    const l: Lead = { id: `lead-${++this.seq}`, name: d.name, email: d.email, phone: d.phone, address: d.address, source: d.source, notes: d.notes, stage: "new_lead", createdAt: now, updatedAt: now };
    this.rows.push(l); return l;
  }
  async list() { return this.rows.map((r) => ({ id: r.id, name: r.name, stage: r.stage, createdAt: r.createdAt })); }
  async getById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async update(id: string, patch: LeadPatch) { const r = this.rows.find((x) => x.id === id)!; Object.assign(r, patch); return r; }
  async updateStage(id: string, stage: LeadStage) { const r = this.rows.find((x) => x.id === id)!; r.stage = stage; return r; }
}

class FakeEstimateStore {
  rows: Estimate[] = [];
  seq = 0;
  async create(data: NewEstimate): Promise<Estimate> {
    const now = new Date().toISOString();
    const e: Estimate = {
      id: `id-${++this.seq}`, number: this.seq, publicToken: data.publicToken, leadId: data.leadId,
      customer: data.customer, input: data.input, breakdown: data.breakdown,
      status: "draft", createdAt: now, updatedAt: now, sentAt: null, decidedAt: null,
    };
    this.rows.push(e); return e;
  }
  async list() { return this.rows.map((r) => ({ id: r.id, number: r.number, customerName: r.customer.name, total: r.breakdown.total, status: r.status, createdAt: r.createdAt })); }
  async listByLead(leadId: string) { return (await this.list()).filter((_s, i) => this.rows[i].leadId === leadId); }
  async getById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async getByToken(t: string) { return this.rows.find((r) => r.publicToken === t) ?? null; }
  async update(id: string, patch: EstimatePatch) { const r = this.rows.find((x) => x.id === id)!; Object.assign(r, patch, { updatedAt: new Date().toISOString() }); return r; }
}
```

- [ ] **Step 6: Teste do lead service**

`src/modules/leads/service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LeadNotFoundError } from "../../domain/lead/errors";
import { createLead, moveStage } from "./service";
// reutilize um FakeLeadStore equivalente ao do estimate service (em memória)

it("cria lead em new_lead", async () => {
  const deps = { leads: new FakeLeadStore() };
  const l = await createLead(deps, { name: "Ana", email: "a@x.com", phone: "1", address: "a" });
  expect(l.stage).toBe("new_lead");
});

it("moveStage de lead inexistente -> 404", async () => {
  const deps = { leads: new FakeLeadStore() };
  await expect(moveStage(deps, "nope", "contacted")).rejects.toThrow(LeadNotFoundError);
});
```

- [ ] **Step 7: Rodar e verificar que passa**

Run: `bunx vitest run src/modules/leads/service.test.ts src/modules/estimates/service.test.ts`
Expected: PASS (todos).

- [ ] **Step 8: Commit**

```bash
git add src/modules/leads/service.ts src/modules/leads/service.test.ts src/modules/estimates/service.ts src/modules/estimates/service.test.ts
git commit -m "feat(lead): lead service + estimate create-from-lead and stage auto-advance"
```

---

### Task 5: HTTP — rotas de leads, mudança no `POST /estimates`, `ServerDeps` + handler

**Files:**
- Modify: `src/infra/http/error-handler.ts`
- Modify: `src/infra/http/build-server.ts`
- Modify: `src/infra/http/build-server.test.ts`
- Create: `src/modules/leads/schema.ts`
- Create: `src/modules/leads/routes.ts`
- Modify: `src/modules/estimates/schema.ts`
- Modify: `src/modules/estimates/routes.ts`
- Modify: `src/modules/estimates/routes.test.ts`
- Test: `src/modules/leads/routes.test.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: lead service, `LEAD_STAGES`, `LeadNotFoundError`.
- Produces: `ServerDeps` ganha `leads: LeadStore`; `leadsRoutes(app, deps)`; `estimateInputSchema`
  passa a exigir `leadId`; handler mapeia `LeadNotFoundError` → 404.

- [ ] **Step 1: Estender o error-handler**

Em `src/infra/http/error-handler.ts`, adicionar (antes do genérico):

```ts
import { LeadNotFoundError } from "../../domain/lead/errors";
// dentro do setErrorHandler:
if (error instanceof LeadNotFoundError) return reply.status(404).send({ error: error.message });
```

- [ ] **Step 2: `ServerDeps` ganha `leads`**

Em `src/infra/http/build-server.ts`:

```ts
import type { LeadStore } from "../../modules/leads/repository";
import { leadsRoutes } from "../../modules/leads/routes";

export type ServerDeps = { estimates: EstimateStore; config: ConfigStore; leads: LeadStore };
// dentro de buildServer, junto às outras rotas:
leadsRoutes(app, deps);
```

- [ ] **Step 3: `fakeDeps` do teste inclui leads**

Em `src/infra/http/build-server.test.ts`, adicionar um `FakeLeadStore` (igual ao da Task 4) e incluí-lo:

```ts
export function fakeDeps() {
  return { estimates: new FakeEstimateStore(), config: new FakeConfigStore(), leads: new FakeLeadStore() };
}
```

- [ ] **Step 4: Schema Zod de leads (já criado na Task 4)**

`src/modules/leads/schema.ts` já foi criado na Task 4 (campos planos + `leadInputSchema` +
`type LeadInput = z.infer<...>` + `stageSchema`). As rotas (Step 8) só importam dele. Confira que
ele existe e exporta `leadInputSchema` e `stageSchema`.

- [ ] **Step 5: Mudar o schema de estimate (exigir leadId, remover customer)**

Em `src/modules/estimates/schema.ts`, substituir `estimateInputSchema`:

```ts
export const estimateInputSchema = z.object({
  leadId: z.string().uuid(),
  input: quoteInputSchema,
});
export const estimateUpdateSchema = z.object({ input: quoteInputSchema });
```

(O `customerSchema` pode ser removido — o contato vem do lead.)

- [ ] **Step 6: Escrever o teste de rotas de leads (RED)**

`src/modules/leads/routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildServer } from "../../infra/http/build-server";
import { fakeDeps } from "../../infra/http/build-server.test";

const lead = { name: "Helena", email: "h@x.com", phone: "1", address: "rua 1", source: "website" };

describe("rotas de leads", () => {
  it("POST cria em new_lead; GET lista", async () => {
    const app = buildServer(fakeDeps());
    const created = (await app.inject({ method: "POST", url: "/api/leads", payload: lead })).json();
    expect(created.stage).toBe("new_lead");
    const list = (await app.inject({ method: "GET", url: "/api/leads" })).json();
    expect(list).toHaveLength(1);
  });

  it("PATCH /stage move o lead", async () => {
    const app = buildServer(fakeDeps());
    const id = (await app.inject({ method: "POST", url: "/api/leads", payload: lead })).json().id;
    const res = await app.inject({ method: "PATCH", url: `/api/leads/${id}/stage`, payload: { stage: "contacted" } });
    expect(res.json().stage).toBe("contacted");
  });

  it("PATCH /stage de lead inexistente -> 404", async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: "PATCH", url: "/api/leads/nope/stage", payload: { stage: "contacted" } });
    expect(res.statusCode).toBe(404);
  });

  it("GET /:id/estimates lista as estimates do lead", async () => {
    const app = buildServer(fakeDeps());
    const id = (await app.inject({ method: "POST", url: "/api/leads", payload: lead })).json().id;
    await app.inject({ method: "POST", url: "/api/estimates", payload: { leadId: id, input: {
      sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0, service: "deep_clean", frequency: "one_time", addOns: [], manualDiscount: 0,
    } } });
    const res = await app.inject({ method: "GET", url: `/api/leads/${id}/estimates` });
    expect(res.json()).toHaveLength(1);
  });
});
```

- [ ] **Step 7: Rodar e verificar que falha**

Run: `bunx vitest run src/modules/leads/routes.test.ts`
Expected: FAIL (rotas inexistentes).

- [ ] **Step 8: Implementar as rotas de leads**

`src/modules/leads/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ServerDeps } from "../../infra/http/build-server";
import type { LeadStage } from "../../domain/lead/types";
import { getLeadOr404, createLead, moveStage, updateLead } from "./service";
import { leadInputSchema, stageSchema } from "./schema";

export function leadsRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.post("/api/leads", async (request, reply) => {
    const parsed = leadInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    return reply.status(201).send(await createLead(deps, parsed.data));
  });

  app.get("/api/leads", async () => deps.leads.list());

  app.get<{ Params: { id: string } }>("/api/leads/:id", async (request) =>
    getLeadOr404(deps.leads, request.params.id),
  );

  app.put<{ Params: { id: string } }>("/api/leads/:id", async (request, reply) => {
    const parsed = leadInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    return updateLead(deps, request.params.id, parsed.data);
  });

  app.patch<{ Params: { id: string } }>("/api/leads/:id/stage", async (request, reply) => {
    const parsed = stageSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    return moveStage(deps, request.params.id, parsed.data.stage as LeadStage);
  });

  app.get<{ Params: { id: string } }>("/api/leads/:id/estimates", async (request) => {
    await getLeadOr404(deps.leads, request.params.id); // 404 se lead não existe
    return deps.estimates.listByLead(request.params.id);
  });
}
```

- [ ] **Step 9: Ajustar as rotas de estimate ao novo contrato**

Em `src/modules/estimates/routes.ts`, a rota `PUT` usa `estimateUpdateSchema`; a `POST` já delega a
`createEstimate` (que agora valida o lead). Importar `estimateUpdateSchema` e trocar no handler do `PUT`:

```ts
import { estimateInputSchema, estimateUpdateSchema } from "./schema";
// no PUT: const parsed = estimateUpdateSchema.safeParse(request.body);
```

- [ ] **Step 10: Ajustar o teste de rotas de estimate**

Em `src/modules/estimates/routes.test.ts`, antes de criar uma estimate, crie um lead e use seu `id`
como `leadId` no payload. O caso "PUT recalcula" passa a mandar só `{ input }`:

```ts
async function newLeadId(app) {
  const r = await app.inject({ method: "POST", url: "/api/leads",
    payload: { name: "Helena", email: "h@x.com", phone: "1", address: "rua 1" } });
  return r.json().id as string;
}
// POST /api/estimates payload: { leadId, input: {...} }
// PUT  /api/estimates/:id payload: { input: { ...input, service: "move_in_out" } }
```

- [ ] **Step 11: Wiring do server**

Em `src/server.ts`, montar o `LeadRepository` e passá-lo ao `buildServer`:

```ts
import { LeadRepository } from "./modules/leads/repository";
// ...
const app = buildServer({
  estimates: new EstimateRepository(db),
  config: new PricingConfigRepository(db),
  leads: new LeadRepository(db),
});
```

- [ ] **Step 12: Rodar a suíte de HTTP**

Run: `bunx vitest run src/modules src/infra/http`
Expected: PASS (leads + estimates + público; integração roda só com `DATABASE_URL`).

- [ ] **Step 13: Commit**

```bash
git add src/infra/http src/modules/leads src/modules/estimates src/server.ts
git commit -m "feat(lead): HTTP routes, estimate create requires leadId, server wiring"
```

---

### Task 6: Frontend — router, client e tipos de lead

**Files:**
- Create: `frontend/src/types/lead.ts`
- Create: `frontend/src/lib/leads.ts`
- Modify: `frontend/src/lib/estimates.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `api` (Fase 1), tipos de estimate (Fase 2).
- Produces: tipos `LeadStage`/`Lead`/`LeadSummary`; `LEAD_STAGES`; funções de API de lead;
  `createEstimate` passa a receber `{ leadId, input }`; rotas `/pipeline`, `/leads/:id`, `/leads/new`.

- [ ] **Step 1: Tipos**

`frontend/src/types/lead.ts`:

```ts
export type LeadStage = "new_lead" | "contacted" | "estimate_sent" | "won" | "lost";
export const LEAD_STAGES: LeadStage[] = ["new_lead", "contacted", "estimate_sent", "won", "lost"];
export const STAGE_LABELS: Record<LeadStage, string> = {
  new_lead: "New", contacted: "Contacted", estimate_sent: "Estimate sent", won: "Won", lost: "Lost",
};
export interface Lead {
  id: string; name: string; email: string; phone: string; address: string;
  source: string | null; notes: string | null;
  stage: LeadStage; createdAt: string; updatedAt: string;
}
export interface LeadSummary { id: string; name: string; stage: LeadStage; createdAt: string }
```

- [ ] **Step 2: Client de API de lead**

`frontend/src/lib/leads.ts`:

```ts
import { api } from "./api";
import type { Lead, LeadStage, LeadSummary } from "../types/lead";
import type { EstimateSummary } from "../types/estimate";

type LeadInput = { name: string; email: string; phone: string; address: string; source?: string; notes?: string };

export async function createLead(dto: LeadInput): Promise<Lead> { return (await api.post("/leads", dto)).data; }
export async function listLeads(): Promise<LeadSummary[]> { return (await api.get("/leads")).data; }
export async function getLead(id: string): Promise<Lead> { return (await api.get(`/leads/${id}`)).data; }
export async function updateLead(id: string, dto: LeadInput): Promise<Lead> { return (await api.put(`/leads/${id}`, dto)).data; }
export async function moveStage(id: string, stage: LeadStage): Promise<Lead> { return (await api.patch(`/leads/${id}/stage`, { stage })).data; }
export async function listLeadEstimates(id: string): Promise<EstimateSummary[]> { return (await api.get(`/leads/${id}/estimates`)).data; }
```

- [ ] **Step 3: Ajustar `createEstimate` do front**

Em `frontend/src/lib/estimates.ts`, trocar a assinatura de `createEstimate`:

```ts
import type { QuoteInput } from "../types";
export async function createEstimate(dto: { leadId: string; input: QuoteInput }): Promise<Estimate> {
  return (await api.post("/estimates", dto)).data;
}
```

- [ ] **Step 4: Rotas novas**

Em `frontend/src/App.tsx`, dentro do `AppShell`, adicionar:

```tsx
import { PipelinePage } from "./pages/PipelinePage";
import { LeadDetailPage } from "./pages/LeadDetailPage";
import { NewLeadPage } from "./pages/NewLeadPage";
// rotas:
<Route path="/pipeline" element={<PipelinePage />} />
<Route path="/leads/new" element={<NewLeadPage />} />
<Route path="/leads/:id" element={<LeadDetailPage />} />
// e links no nav: <Link to="/pipeline">Pipeline</Link>
```

- [ ] **Step 5: Checagem de tipos**

Run: `cd frontend && bunx tsc --noEmit`
Expected: pode acusar páginas faltando (criadas nas Tasks 7–8); rode de novo ao final.

- [ ] **Step 6: Commit**

```bash
cd .. && git add frontend/src/types/lead.ts frontend/src/lib/leads.ts frontend/src/lib/estimates.ts frontend/src/App.tsx
git commit -m "feat(frontend): lead types, api client and routes"
```

---

### Task 7: Frontend — Kanban com drag-and-drop (`dnd-kit`)

**Files:**
- Create: `frontend/src/pages/PipelinePage.tsx`
- Create: `frontend/src/components/LeadCard.tsx`

**Interfaces:**
- Consumes: `listLeads`, `moveStage`, `LEAD_STAGES`/`STAGE_LABELS`, TanStack Query, `@dnd-kit/core`.

- [ ] **Step 1: Instalar dnd-kit**

```bash
cd frontend && bun add @dnd-kit/core
```

- [ ] **Step 2: Card arrastável**

`frontend/src/components/LeadCard.tsx`:

```tsx
import { useDraggable } from "@dnd-kit/core";
import { Link } from "react-router-dom";
import type { LeadSummary } from "../types/lead";

export function LeadCard({ lead }: { lead: LeadSummary }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className="cursor-grab rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
      <Link to={`/leads/${lead.id}`} className="font-medium" onClick={(e) => e.stopPropagation()}>
        {lead.name}
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Board com colunas droppables**

`frontend/src/pages/PipelinePage.tsx`:

```tsx
import { DndContext, type DragEndEvent, useDroppable } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listLeads, moveStage } from "../lib/leads";
import { LEAD_STAGES, STAGE_LABELS, type LeadStage } from "../types/lead";
import { LeadCard } from "../components/LeadCard";

function Column({ stage, children }: { stage: LeadStage; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef}
      className={`flex w-64 flex-col gap-2 rounded-xl border p-3 ${isOver ? "border-blue-500" : "border-zinc-800"}`}>
      <h2 className="text-xs uppercase text-zinc-400">{STAGE_LABELS[stage]}</h2>
      {children}
    </div>
  );
}

export function PipelinePage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["leads"], queryFn: listLeads });
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) => moveStage(id, stage),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const stage = e.over?.id as LeadStage | undefined;
    if (stage && LEAD_STAGES.includes(stage)) move.mutate({ id, stage });
  }

  if (q.isLoading) return <div className="p-6">Carregando…</div>;

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-6">
        {LEAD_STAGES.map((stage) => (
          <Column key={stage} stage={stage}>
            {q.data?.filter((l) => l.stage === stage).map((l) => <LeadCard key={l.id} lead={l} />)}
          </Column>
        ))}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 4: Checagem de tipos + smoke manual**

Run: `cd frontend && bunx tsc --noEmit`
Com backend e front no ar: abra `/pipeline`, arraste um card entre colunas, recarregue e confirme que
o estágio persistiu.

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/pages/PipelinePage.tsx frontend/src/components/LeadCard.tsx frontend/package.json
git commit -m "feat(frontend): Kanban pipeline with dnd-kit"
```

---

### Task 8: Frontend — detalhe do lead, novo lead e estimate vinculada

**Files:**
- Create: `frontend/src/pages/NewLeadPage.tsx`
- Create: `frontend/src/pages/LeadDetailPage.tsx`
- Modify: `frontend/src/pages/CalculatorPage.tsx`

**Interfaces:**
- Consumes: `createLead`, `getLead`, `listLeadEstimates`, `createEstimate`, `BreakdownPanel`, `formatCents`, `formatEstimateNumber`.

- [ ] **Step 1: Form de novo lead**

`frontend/src/pages/NewLeadPage.tsx`:

```tsx
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createLead } from "../lib/leads";

export function NewLeadPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "" });
  const save = useMutation({ mutationFn: () => createLead(form), onSuccess: (l) => navigate(`/leads/${l.id}`) });
  return (
    <div className="mx-auto max-w-md space-y-2 p-6">
      <h1 className="text-xl font-semibold">Novo lead</h1>
      {(["name", "email", "phone", "address"] as const).map((f) => (
        <input key={f} placeholder={f} value={form[f]}
          onChange={(e) => setForm((c) => ({ ...c, [f]: e.target.value }))}
          className="w-full rounded-lg bg-zinc-900 p-2" />
      ))}
      <button type="button" onClick={() => save.mutate()} className="rounded-lg bg-blue-600 px-4 py-2">Salvar</button>
    </div>
  );
}
```

- [ ] **Step 2: Detalhe do lead (com estimates e link p/ nova estimate)**

`frontend/src/pages/LeadDetailPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getLead, listLeadEstimates } from "../lib/leads";
import { formatCents } from "../lib/money";
import { formatEstimateNumber } from "../lib/estimateNumber";
import { STAGE_LABELS } from "../types/lead";

export function LeadDetailPage() {
  const { id = "" } = useParams();
  const lead = useQuery({ queryKey: ["lead", id], queryFn: () => getLead(id) });
  const ests = useQuery({ queryKey: ["lead-estimates", id], queryFn: () => listLeadEstimates(id) });
  if (lead.isLoading || !lead.data) return <div className="p-6">Carregando…</div>;
  const l = lead.data;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{l.name}</h1>
        <span className="text-xs uppercase text-zinc-400">{STAGE_LABELS[l.stage]}</span>
      </div>
      <p className="text-sm text-zinc-400">{l.email} · {l.phone} · {l.address}</p>
      <Link to={`/?leadId=${l.id}`} className="inline-block rounded-lg bg-blue-600 px-4 py-2">
        Nova estimate para este lead
      </Link>
      <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {ests.data?.map((e) => (
          <Link key={e.id} to={`/estimates/${e.id}`} className="flex justify-between p-3 hover:bg-zinc-900">
            <span>{formatEstimateNumber(e.number)} · {e.status}</span>
            <span>{formatCents(e.total)}</span>
          </Link>
        ))}
        {ests.data?.length === 0 && <div className="p-3 text-zinc-400">Sem estimates ainda.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Calculadora vinculada ao lead (lê `leadId` da URL)**

Em `frontend/src/pages/CalculatorPage.tsx`, remover o bloco `customer` (Fase 2) e usar o `leadId` da
query string ao salvar. Substituir a mutation de criação:

```tsx
import { useSearchParams, useNavigate } from "react-router-dom";
import { createEstimate } from "../lib/estimates";
// dentro do componente:
const [params] = useSearchParams();
const leadId = params.get("leadId");
const navigate = useNavigate();
const save = useMutation({
  mutationFn: () => createEstimate({ leadId: leadId!, input }),
  onSuccess: (e) => navigate(`/estimates/${e.id}`),
});
// no JSX: botão "Salvar como rascunho" só habilitado se leadId existir:
<button type="button" disabled={!leadId} onClick={() => save.mutate()}
  className="rounded-lg bg-blue-600 px-4 py-2 disabled:opacity-40">
  {leadId ? "Salvar como rascunho" : "Abra a partir de um lead para salvar"}
</button>
```

- [ ] **Step 4: Checagem de tipos + build**

Run: `cd frontend && bunx tsc --noEmit && bun run build`
Expected: sem erros; build conclui.

- [ ] **Step 5: Smoke test e2e (manual)**

Com backend + front no ar: crie um lead em `/leads/new` → no detalhe, "Nova estimate para este lead"
→ calcule e salve → veja a estimate listada no lead → envie a estimate → confira no `/pipeline` que o
lead foi para **estimate_sent** → aceite pela página pública → confira que foi para **won**.

- [ ] **Step 6: Commit**

```bash
cd .. && git add frontend/src/pages/NewLeadPage.tsx frontend/src/pages/LeadDetailPage.tsx frontend/src/pages/CalculatorPage.tsx
git commit -m "feat(frontend): lead detail, new lead and lead-linked estimate creation"
```

---

## Resumo de cobertura (plano × spec)

| Requisito do spec | Task(s) |
|-------------------|---------|
| Domínio Lead + estágios + `nextStage` (guarda do won) | 1 |
| Tabela `leads` + `lead_id` em `estimates` (migration) | 2 |
| `LeadRepository` (CRUD + updateStage) + `listByLead` | 2, 3 |
| Lead service + estimate create-from-lead | 4 |
| Seam de eventos (auto-avanço nas transições) | 4 |
| Erro `LeadNotFoundError` → 404 | 1, 5 |
| API de leads (CRUD + PATCH stage + estimates do lead) | 5 |
| `POST /estimates` exige `leadId` | 5 |
| Frontend: router + client + tipos | 6 |
| Kanban com drag-and-drop | 7 |
| Detalhe do lead + novo lead + estimate vinculada | 8 |
