# Fase 2 — Estimates — Implementation Plan (gabarito)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-by-task. Os steps usam checkbox (`- [ ]`) para acompanhamento.
>
> **Como usar (estudo):** este é o *gabarito*. Os guias `docs/guides/10`–`13` ensinam a mesma coisa entregando só *models* + testes. Tente implementar pelos guias; consulte este plano quando travar.

**Goal:** Transformar o cálculo efêmero da Fase 1 numa **estimate persistida** — com identidade, contato embutido, snapshot do cálculo, máquina de estado `draft → sent → {accepted | declined}` e uma página pública por token onde o cliente aceita/recusa.

**Architecture:** Mantém as camadas da Fase 1 — `src/domain` (puro), `src/modules/<feature>` (rotas + zod + repository + service), `src/infra` (db, http). A engine de preços é reusada. A Fase 2 adiciona: domínio `estimate` (tipos + máquina de estado + erros), schema/repository, um `service` que compõe `calculate` + máquina de estado, rotas admin e públicas, e o frontend com react-router. Backend roda em **Bun**; imports são **extensionless** (`moduleResolution: bundler`).

**Tech Stack:** Bun, TypeScript (ESM), Fastify, `@fastify/cors`, Zod, Drizzle ORM + drizzle-kit + `pg`, Postgres 15+ (via `compose.yml`), Vitest; React 19, Vite, react-router, TanStack Query, axios.

## Global Constraints

- Prosa em português (Brasil); código, nomes de campos, identificadores e termos técnicos em inglês.
- **Estrutura por papel:** `src/domain` (puro, zero framework) ← `src/modules/<feature>` (fatia vertical) ← `src/infra` (db, http). Regra de dependência: a seta aponta sempre pra dentro (domain nunca importa modules/infra).
- **Runtime Bun.** Rodar testes: `bunx vitest run <path>`. Imports relativos **sem extensão** (`moduleResolution: bundler` no `tsconfig.json`). Ex.: `import { calculate } from "../../domain/pricing/calculate"`.
- Dinheiro **sempre** `number` inteiro em cents; nenhum valor monetário é recalculado no frontend.
- O backend é a **fonte da verdade do cálculo**: criar/editar estimate roda `calculate` no servidor; ler estimate devolve o `breakdown` congelado (nunca recalcula na leitura).
- **Snapshot:** a estimate guarda `input` (`QuoteInput`) **e** `breakdown` (`QuoteBreakdown`) como JSONB. Mudar a `PricingConfig` depois não altera estimates já gravadas.
- **Status:** `draft → sent → {accepted | declined}` são as únicas transições válidas. Qualquer outra lança `EstimateStatusError`.
- **Erros → HTTP:** `EstimateStatusError` → **409**, `EstimateNotFoundError` → **404**, falha de Zod → **400**, `PricingError` (Fase 1) → **400**.
- **Token é a credencial pública.** `publicToken` aleatório inguessável; o `id` (uuid) nunca é exposto pela rota pública.
- Spec de referência: `docs/specs/2026-06-25-estimate-engine-fase-2-estimates-design.md`.

## Pré-requisitos da Fase 1 (assumidos prontos)

Este plano assume que a Fase 1 está implementada. Os artefatos consumidos, com caminho e assinatura **na convenção real do projeto**:

- `src/domain/pricing/money.ts` → `type Money = number`, `roundHalfUp(num: Money): Money`.
- `src/domain/pricing/types.ts` → `ServiceType`, `Frequency`, `AddOn`, `SelectedAddOn`, `PricingConfig`, `QuoteInput`, `AddOnLine`, `QuoteBreakdown`.
- `src/domain/pricing/calculate.ts` → `calculate(input: QuoteInput, config: PricingConfig): QuoteBreakdown` (lança `PricingError`).
- `src/domain/pricing/config.ts` → `defaultConfig(): PricingConfig`.
- `src/domain/pricing/errors.ts` → `PricingError` (base).
- `src/modules/pricing-config/repository.ts` → `interface ConfigStore { get(): Promise<PricingConfig>; save(c: PricingConfig): Promise<void> }` e `PricingConfigRepository`.
- `src/infra/db/index.ts` → singleton `db` (Drizzle + `pg`), `import { schema } from "./schemas"`.
- `src/infra/db/schemas/index.ts` → exporta o objeto `schema` (agregando todas as tabelas).

> Se algum desses ainda não existir, implemente a Fase 1 antes (ver `docs/plans/2026-06-22-fase-1-calculadora.md`, adaptando os caminhos para a raiz `src/` e imports extensionless).

---

### Task 1: Domínio — tipos da Estimate, máquina de estado e erros (TDD)

**Files:**
- Create: `src/domain/estimate/types.ts`
- Create: `src/domain/estimate/errors.ts`
- Create: `src/domain/estimate/status.ts`
- Test: `src/domain/estimate/status.test.ts`

**Interfaces:**
- Consumes: `Money` (`src/domain/pricing/money`), `QuoteInput`/`QuoteBreakdown` (`src/domain/pricing/types`).
- Produces: `EstimateStatus`, `CustomerInfo`, `Estimate`, `EstimateSummary`, `PublicEstimateView`; `EstimateError` (base), `EstimateStatusError`, `EstimateNotFoundError`; `ALLOWED_TRANSITIONS`, `assertTransition(from, to)`.

- [ ] **Step 1: Tipos do domínio**

`src/domain/estimate/types.ts`:

```ts
import type { Money } from "../pricing/money";
import type { QuoteBreakdown, QuoteInput } from "../pricing/types";

export type EstimateStatus = "draft" | "sent" | "accepted" | "declined";

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface Estimate {
  id: string; // uuid — chave interna, nunca exposta na rota pública
  number: number; // sequencial legível (exibido como "EST-0007")
  publicToken: string; // credencial da página pública
  customer: CustomerInfo;
  input: QuoteInput; // snapshot da entrada
  breakdown: QuoteBreakdown; // snapshot do cálculo (congelado)
  status: EstimateStatus;
  createdAt: string; // ISO 8601
  updatedAt: string;
  sentAt: string | null;
  decidedAt: string | null;
}

export interface EstimateSummary {
  id: string;
  number: number;
  customerName: string;
  total: Money;
  status: EstimateStatus;
  createdAt: string;
}

export interface PublicEstimateView {
  number: number;
  customer: CustomerInfo;
  breakdown: QuoteBreakdown;
  status: EstimateStatus;
}
```

- [ ] **Step 2: Erros do domínio**

`src/domain/estimate/errors.ts`:

```ts
// Erro base do domínio de estimates. O error-handler HTTP mapeia subclasses para status específicos.
export class EstimateError extends Error {}

// Transição/edição inválida para o status atual. HTTP 409.
export class EstimateStatusError extends EstimateError {
  constructor(from: string, to: string) {
    super(`transição inválida: ${from} -> ${to}`);
    this.name = "EstimateStatusError";
  }
}

// Estimate não encontrada por id ou token. HTTP 404.
export class EstimateNotFoundError extends EstimateError {
  constructor() {
    super("estimate não encontrada");
    this.name = "EstimateNotFoundError";
  }
}
```

- [ ] **Step 3: Escrever o teste que falha (máquina de estado)**

`src/domain/estimate/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EstimateStatusError } from "./errors";
import { assertTransition } from "./status";

describe("assertTransition", () => {
  it("permite as transições válidas", () => {
    expect(() => assertTransition("draft", "sent")).not.toThrow();
    expect(() => assertTransition("sent", "accepted")).not.toThrow();
    expect(() => assertTransition("sent", "declined")).not.toThrow();
  });

  it("rejeita aceitar uma draft", () => {
    expect(() => assertTransition("draft", "accepted")).toThrow(EstimateStatusError);
  });

  it("rejeita reenviar uma accepted", () => {
    expect(() => assertTransition("accepted", "sent")).toThrow(EstimateStatusError);
  });

  it("rejeita decidir uma declined", () => {
    expect(() => assertTransition("declined", "accepted")).toThrow(EstimateStatusError);
  });
});
```

- [ ] **Step 4: Rodar e verificar que falha**

Run: `bunx vitest run src/domain/estimate/status.test.ts`
Expected: FAIL (`Cannot find module './status'`).

- [ ] **Step 5: Implementar a máquina de estado**

`src/domain/estimate/status.ts`:

```ts
import { EstimateStatusError } from "./errors";
import type { EstimateStatus } from "./types";

// Transições permitidas a partir de cada status. Estados terminais têm lista vazia.
export const ALLOWED_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "declined"],
  accepted: [],
  declined: [],
};

// Lança EstimateStatusError se (from -> to) não estiver na lista de permitidas.
export function assertTransition(from: EstimateStatus, to: EstimateStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new EstimateStatusError(from, to);
  }
}
```

- [ ] **Step 6: Rodar e verificar que passa**

Run: `bunx vitest run src/domain/estimate/status.test.ts`
Expected: PASS (todos).

- [ ] **Step 7: Commit**

```bash
git add src/domain/estimate
git commit -m "feat(estimate): domain types, errors and status machine"
```

---

### Task 2: Persistência — schema Drizzle `estimates`

**Files:**
- Create: `src/infra/db/schemas/estimates.ts`
- Modify: `src/infra/db/schemas/index.ts`

**Interfaces:**
- Consumes: `CustomerInfo`, `QuoteInput`, `QuoteBreakdown`.
- Produces: tabela `estimates` (Drizzle) + enum `estimateStatus`; agregadas no objeto `schema` exportado por `schemas/index.ts`.

> **Nota de execução:** requer Postgres. O projeto já tem `compose.yml`:
> `bun db:up` (sobe o Postgres) e `DATABASE_URL` em `.env`
> (`postgres://postgres:postgres@localhost:5432/estimate_engine`).

- [ ] **Step 1: Definir o schema da tabela**

`src/infra/db/schemas/estimates.ts`:

```ts
import { sql } from "drizzle-orm";
import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { CustomerInfo, QuoteInput } from "../../../domain/estimate/types";
import type { QuoteBreakdown } from "../../../domain/pricing/types";

export const estimateStatus = pgEnum("estimate_status", ["draft", "sent", "accepted", "declined"]);

export const estimates = pgTable("estimates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  number: integer("number").generatedAlwaysAsIdentity(),
  publicToken: text("public_token").notNull().unique(),
  customer: jsonb("customer").$type<CustomerInfo>().notNull(),
  input: jsonb("input").$type<QuoteInput>().notNull(),
  breakdown: jsonb("breakdown").$type<QuoteBreakdown>().notNull(),
  status: estimateStatus("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});
```

- [ ] **Step 2: Registrar no índice de schemas**

`src/infra/db/schemas/index.ts` — adicionar `estimates` ao objeto `schema` (preserve as entradas já existentes, ex.: pricing-config):

```ts
import { estimates, estimateStatus } from "./estimates";

// ...mantenha os imports/entradas já existentes (ex.: pricingConfig)...

export const schema = {
  // ...entradas existentes...
  estimates,
  estimateStatus,
};
```

- [ ] **Step 3: Gerar e aplicar a migration**

Run:
```bash
bun db:up
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine'
bun db:generate
bun db:migrate
```
Expected: novo SQL em `drizzle/` e tabela `estimates` (+ enum `estimate_status`) criada.

- [ ] **Step 4: Conferir a tabela**

Run: `bun db:psql -c '\d estimates'`
Expected: colunas `id, number, public_token, customer, input, breakdown, status, created_at, updated_at, sent_at, decided_at`.

- [ ] **Step 5: Commit**

```bash
git add src/infra/db/schemas/estimates.ts src/infra/db/schemas/index.ts drizzle
git commit -m "feat(estimate): drizzle schema for estimates table"
```

---

### Task 3: Repository (integração com Postgres)

**Files:**
- Create: `src/modules/estimates/repository.ts`
- Test: `src/modules/estimates/repository.test.ts`

**Interfaces:**
- Consumes: singleton `db` (`src/infra/db`), tabela `estimates`, tipos do domínio.
- Produces:
  - `interface EstimateStore` com `create(data: NewEstimate): Promise<Estimate>`, `list(): Promise<EstimateSummary[]>`, `getById(id: string): Promise<Estimate | null>`, `getByToken(token: string): Promise<Estimate | null>`, `update(id: string, patch: EstimatePatch): Promise<Estimate>`.
  - `type NewEstimate = { customer: CustomerInfo; input: QuoteInput; breakdown: QuoteBreakdown; publicToken: string }`.
  - `type EstimatePatch = Partial<{ customer: CustomerInfo; input: QuoteInput; breakdown: QuoteBreakdown; status: EstimateStatus; sentAt: string; decidedAt: string }>`.
  - `class EstimateRepository implements EstimateStore`.

- [ ] **Step 1: Escrever o teste que falha (integração)**

`src/modules/estimates/repository.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../infra/db";
import { estimates } from "../../infra/db/schemas/estimates";
import { defaultConfig } from "../../domain/pricing/config";
import { calculate } from "../../domain/pricing/calculate";
import type { QuoteInput } from "../../domain/pricing/types";
import { EstimateRepository } from "./repository";

const url = process.env.DATABASE_URL;

const input: QuoteInput = {
  sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0,
  service: "deep_clean", frequency: "one_time",
  addOns: [], manualDiscount: 0,
};

describe.skipIf(!url)("EstimateRepository", () => {
  const repo = new EstimateRepository(db);

  beforeEach(async () => {
    await db.delete(estimates);
  });

  it("cria e relê uma estimate (com id, number e status draft)", async () => {
    const breakdown = calculate(input, defaultConfig());
    const created = await repo.create({
      customer: { name: "Helena", email: "h@x.com", phone: "1", address: "rua 1" },
      input, breakdown, publicToken: randomUUID(),
    });
    expect(created.id).toBeTruthy();
    expect(created.number).toBeGreaterThan(0);
    expect(created.status).toBe("draft");
    expect(created.breakdown.total).toBe(19000);

    const got = await repo.getById(created.id);
    expect(got?.breakdown.total).toBe(19000);

    const byToken = await repo.getByToken(created.publicToken);
    expect(byToken?.id).toBe(created.id);
  });

  it("atualiza status e timestamps", async () => {
    const breakdown = calculate(input, defaultConfig());
    const created = await repo.create({
      customer: { name: "X", email: "x@x.com", phone: "1", address: "a" },
      input, breakdown, publicToken: randomUUID(),
    });
    const sentAt = new Date().toISOString();
    const updated = await repo.update(created.id, { status: "sent", sentAt });
    expect(updated.status).toBe("sent");
    expect(updated.sentAt).toBeTruthy();
  });

  it("lista resumos", async () => {
    const breakdown = calculate(input, defaultConfig());
    await repo.create({
      customer: { name: "Ana", email: "a@x.com", phone: "1", address: "a" },
      input, breakdown, publicToken: randomUUID(),
    });
    const rows = await repo.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].customerName).toBe("Ana");
    expect(rows[0].total).toBe(19000);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine' && bunx vitest run src/modules/estimates/repository.test.ts`
Expected: FAIL (`Cannot find module './repository'`).

- [ ] **Step 3: Implementar o repository**

`src/modules/estimates/repository.ts`:

```ts
import { desc, eq } from "drizzle-orm";
import { db } from "../../infra/db";
import { estimates } from "../../infra/db/schemas/estimates";
import type {
  CustomerInfo, Estimate, EstimateStatus, EstimateSummary,
} from "../../domain/estimate/types";
import type { QuoteBreakdown, QuoteInput } from "../../domain/pricing/types";

export type NewEstimate = {
  customer: CustomerInfo;
  input: QuoteInput;
  breakdown: QuoteBreakdown;
  publicToken: string;
};

export type EstimatePatch = Partial<{
  customer: CustomerInfo;
  input: QuoteInput;
  breakdown: QuoteBreakdown;
  status: EstimateStatus;
  sentAt: string;
  decidedAt: string;
}>;

export interface EstimateStore {
  create(data: NewEstimate): Promise<Estimate>;
  list(): Promise<EstimateSummary[]>;
  getById(id: string): Promise<Estimate | null>;
  getByToken(token: string): Promise<Estimate | null>;
  update(id: string, patch: EstimatePatch): Promise<Estimate>;
}

// Tipo do client Drizzle, derivado do singleton (sem reinstanciar o pool).
export type Db = typeof db;

// Converte a row do Drizzle (Date | null nos timestamps) para o tipo de domínio (ISO string | null).
type Row = typeof estimates.$inferSelect;
function toEstimate(row: Row): Estimate {
  return {
    id: row.id,
    number: row.number,
    publicToken: row.publicToken,
    customer: row.customer,
    input: row.input,
    breakdown: row.breakdown,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

export class EstimateRepository implements EstimateStore {
  constructor(private db: Db) {}

  async create(data: NewEstimate): Promise<Estimate> {
    const [row] = await this.db.insert(estimates).values(data).returning();
    return toEstimate(row);
  }

  async list(): Promise<EstimateSummary[]> {
    const rows = await this.db.select().from(estimates).orderBy(desc(estimates.createdAt));
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      customerName: row.customer.name,
      total: row.breakdown.total,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getById(id: string): Promise<Estimate | null> {
    const rows = await this.db.select().from(estimates).where(eq(estimates.id, id));
    return rows[0] ? toEstimate(rows[0]) : null;
  }

  async getByToken(token: string): Promise<Estimate | null> {
    const rows = await this.db.select().from(estimates).where(eq(estimates.publicToken, token));
    return rows[0] ? toEstimate(rows[0]) : null;
  }

  async update(id: string, patch: EstimatePatch): Promise<Estimate> {
    const [row] = await this.db
      .update(estimates)
      .set({
        ...patch,
        sentAt: patch.sentAt ? new Date(patch.sentAt) : undefined,
        decidedAt: patch.decidedAt ? new Date(patch.decidedAt) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(estimates.id, id))
      .returning();
    return toEstimate(row);
  }
}
```

> Nota: `Db = typeof db` reaproveita o tipo do singleton para tipar a injeção. Importar `db` aqui não cria um novo pool — é o mesmo singleton já instanciado em `src/infra/db`. Os testes injetam esse mesmo `db`.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine' && bunx vitest run src/modules/estimates/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/estimates/repository.ts src/modules/estimates/repository.test.ts
git commit -m "feat(estimate): repository with snapshot persistence"
```

---

### Task 4: Service — compõe `calculate` + máquina de estado (TDD com fakes)

**Files:**
- Create: `src/modules/estimates/token.ts`
- Create: `src/modules/estimates/service.ts`
- Test: `src/modules/estimates/service.test.ts`

**Interfaces:**
- Consumes: `EstimateStore`, `NewEstimate`, `ConfigStore` (Fase 1), `calculate`, `assertTransition`, erros do domínio.
- Produces:
  - `generatePublicToken(): string`.
  - `type EstimateInputDto = { customer: CustomerInfo; input: QuoteInput }`.
  - `createEstimate(deps, dto): Promise<Estimate>`
  - `updateEstimate(deps, id, dto): Promise<Estimate>` (só em `draft`)
  - `sendEstimate(deps, id): Promise<Estimate>`
  - `acceptByToken(deps, token): Promise<Estimate>` / `declineByToken(deps, token): Promise<Estimate>`
  - `getPublicView(deps, token): Promise<PublicEstimateView>`
  - `type EstimateDeps = { estimates: EstimateStore; config: ConfigStore }`.

- [ ] **Step 1: Gerador de token**

`src/modules/estimates/token.ts`:

```ts
import { randomBytes } from "node:crypto";

// Token URL-safe inguessável usado como credencial da página pública.
export function generatePublicToken(): string {
  return randomBytes(24).toString("base64url");
}
```

- [ ] **Step 2: Escrever o teste que falha (service com fakes)**

`src/modules/estimates/service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../domain/pricing/config";
import type { PricingConfig } from "../../domain/pricing/types";
import { EstimateStatusError, EstimateNotFoundError } from "../../domain/estimate/errors";
import type { Estimate } from "../../domain/estimate/types";
import type { EstimateStore, EstimatePatch, NewEstimate } from "./repository";
import {
  acceptByToken, createEstimate, getPublicView, sendEstimate, updateEstimate,
} from "./service";

class FakeConfigStore {
  config: PricingConfig = defaultConfig();
  async get() { return this.config; }
  async save(c: PricingConfig) { this.config = c; }
}

// Store em memória que imita o repository.
class FakeEstimateStore implements EstimateStore {
  rows: Estimate[] = [];
  seq = 0;
  async create(data: NewEstimate): Promise<Estimate> {
    const now = new Date().toISOString();
    const e: Estimate = {
      id: `id-${++this.seq}`, number: this.seq, publicToken: data.publicToken,
      customer: data.customer, input: data.input, breakdown: data.breakdown,
      status: "draft", createdAt: now, updatedAt: now, sentAt: null, decidedAt: null,
    };
    this.rows.push(e);
    return e;
  }
  async list() {
    return this.rows.map((r) => ({
      id: r.id, number: r.number, customerName: r.customer.name,
      total: r.breakdown.total, status: r.status, createdAt: r.createdAt,
    }));
  }
  async getById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async getByToken(t: string) { return this.rows.find((r) => r.publicToken === t) ?? null; }
  async update(id: string, patch: EstimatePatch) {
    const r = this.rows.find((x) => x.id === id);
    if (!r) throw new Error("not found in fake");
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return r;
  }
}

const dto = {
  customer: { name: "Helena", email: "h@x.com", phone: "1", address: "rua 1" },
  input: {
    sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0,
    service: "deep_clean" as const, frequency: "one_time" as const,
    addOns: [], manualDiscount: 0,
  },
};

describe("estimate service", () => {
  let deps: { estimates: FakeEstimateStore; config: FakeConfigStore };
  beforeEach(() => {
    deps = { estimates: new FakeEstimateStore(), config: new FakeConfigStore() };
  });

  it("cria em draft com breakdown do golden case (19000)", async () => {
    const e = await createEstimate(deps, dto);
    expect(e.status).toBe("draft");
    expect(e.breakdown.total).toBe(19000);
    expect(e.publicToken).toBeTruthy();
  });

  it("edita em draft e recalcula", async () => {
    const e = await createEstimate(deps, dto);
    const updated = await updateEstimate(deps, e.id, {
      ...dto, input: { ...dto.input, service: "move_in_out" },
    });
    expect(updated.breakdown.total).toBe(34200); // 19000 * 1.8
  });

  it("bloqueia editar fora de draft", async () => {
    const e = await createEstimate(deps, dto);
    await sendEstimate(deps, e.id);
    await expect(updateEstimate(deps, e.id, dto)).rejects.toThrow(EstimateStatusError);
  });

  it("send: draft -> sent e seta sentAt", async () => {
    const e = await createEstimate(deps, dto);
    const sent = await sendEstimate(deps, e.id);
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).toBeTruthy();
  });

  it("accept pela token: sent -> accepted", async () => {
    const e = await createEstimate(deps, dto);
    await sendEstimate(deps, e.id);
    const accepted = await acceptByToken(deps, e.publicToken);
    expect(accepted.status).toBe("accepted");
    expect(accepted.decidedAt).toBeTruthy();
  });

  it("accept de uma draft falha (status)", async () => {
    const e = await createEstimate(deps, dto);
    await expect(acceptByToken(deps, e.publicToken)).rejects.toThrow(EstimateStatusError);
  });

  it("getPublicView de draft -> NotFound; token inválido -> NotFound", async () => {
    const e = await createEstimate(deps, dto);
    await expect(getPublicView(deps, e.publicToken)).rejects.toThrow(EstimateNotFoundError);
    await expect(getPublicView(deps, "nope")).rejects.toThrow(EstimateNotFoundError);
  });

  it("getPublicView de sent retorna view sanitizada (sem id/input)", async () => {
    const e = await createEstimate(deps, dto);
    await sendEstimate(deps, e.id);
    const view = await getPublicView(deps, e.publicToken);
    expect(view.number).toBe(e.number);
    expect(view.breakdown.total).toBe(19000);
    expect((view as Record<string, unknown>).id).toBeUndefined();
    expect((view as Record<string, unknown>).input).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `bunx vitest run src/modules/estimates/service.test.ts`
Expected: FAIL (`Cannot find module './service'`).

- [ ] **Step 4: Implementar o service**

`src/modules/estimates/service.ts`:

```ts
import { calculate } from "../../domain/pricing/calculate";
import { assertTransition } from "../../domain/estimate/status";
import { EstimateNotFoundError } from "../../domain/estimate/errors";
import type { CustomerInfo, Estimate, EstimateStatus, PublicEstimateView } from "../../domain/estimate/types";
import type { QuoteInput } from "../../domain/pricing/types";
import type { ConfigStore } from "../pricing-config/repository";
import type { EstimateStore } from "./repository";
import { generatePublicToken } from "./token";

export type EstimateDeps = { estimates: EstimateStore; config: ConfigStore };
export type EstimateInputDto = { customer: CustomerInfo; input: QuoteInput };

// Lê a estimate ou lança NotFound — concentra o tratamento de "não existe".
async function getOr404(store: EstimateStore, id: string): Promise<Estimate> {
  const e = await store.getById(id);
  if (!e) throw new EstimateNotFoundError();
  return e;
}

export async function createEstimate(deps: EstimateDeps, dto: EstimateInputDto): Promise<Estimate> {
  const config = await deps.config.get();
  const breakdown = calculate(dto.input, config); // backend é a fonte da verdade
  return deps.estimates.create({
    customer: dto.customer,
    input: dto.input,
    breakdown,
    publicToken: generatePublicToken(),
  });
}

export async function updateEstimate(deps: EstimateDeps, id: string, dto: EstimateInputDto): Promise<Estimate> {
  const current = await getOr404(deps.estimates, id);
  if (current.status !== "draft") {
    // Reusa a máquina de estado para sinalizar "congelada": draft -> draft não é permitido.
    assertTransition(current.status, "draft");
  }
  const config = await deps.config.get();
  const breakdown = calculate(dto.input, config);
  return deps.estimates.update(id, { customer: dto.customer, input: dto.input, breakdown });
}

async function transition(
  deps: EstimateDeps, id: string, to: EstimateStatus, stamp: "sentAt" | "decidedAt",
): Promise<Estimate> {
  const current = await getOr404(deps.estimates, id);
  assertTransition(current.status, to);
  return deps.estimates.update(id, { status: to, [stamp]: new Date().toISOString() });
}

export function sendEstimate(deps: EstimateDeps, id: string): Promise<Estimate> {
  return transition(deps, id, "sent", "sentAt");
}

async function decideByToken(deps: EstimateDeps, token: string, to: EstimateStatus): Promise<Estimate> {
  const current = await deps.estimates.getByToken(token);
  if (!current) throw new EstimateNotFoundError();
  assertTransition(current.status, to);
  return deps.estimates.update(current.id, { status: to, decidedAt: new Date().toISOString() });
}

export function acceptByToken(deps: EstimateDeps, token: string): Promise<Estimate> {
  return decideByToken(deps, token, "accepted");
}

export function declineByToken(deps: EstimateDeps, token: string): Promise<Estimate> {
  return decideByToken(deps, token, "declined");
}

export async function getPublicView(deps: EstimateDeps, token: string): Promise<PublicEstimateView> {
  const e = await deps.estimates.getByToken(token);
  if (!e || e.status === "draft") throw new EstimateNotFoundError(); // draft não é público
  return { number: e.number, customer: e.customer, breakdown: e.breakdown, status: e.status };
}
```

> Nota didática: `updateEstimate` reusa `assertTransition(status, "draft")` para rejeitar edição fora de `draft` — como nenhuma transição aponta para `draft`, qualquer status não-draft lança `EstimateStatusError`. Uma alternativa é checar `status !== "draft"` e lançar direto; escolhemos reusar a máquina para ter uma única fonte da verdade das regras de estado.

- [ ] **Step 5: Rodar e verificar que passa**

Run: `bunx vitest run src/modules/estimates/service.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add src/modules/estimates/token.ts src/modules/estimates/service.ts src/modules/estimates/service.test.ts
git commit -m "feat(estimate): service composing calculate and status machine"
```

---

### Task 5: HTTP — error-handler central + `buildServer` factory

**Files:**
- Create: `src/infra/http/error-handler.ts`
- Create: `src/infra/http/build-server.ts`
- Test: `src/infra/http/build-server.test.ts`

**Interfaces:**
- Consumes: `PricingError`, `EstimateStatusError`, `EstimateNotFoundError`, `EstimateStore`, `ConfigStore`.
- Produces:
  - `registerErrorHandler(app: FastifyInstance): void` — mapeia `EstimateNotFoundError`→404, `EstimateStatusError`→409, `PricingError`→400, resto→500.
  - `type ServerDeps = { estimates: EstimateStore; config: ConfigStore }`.
  - `buildServer(deps: ServerDeps): FastifyInstance` — registra cors + error-handler + rotas (admin e públicas das Tasks 6/7). **Não** dá `listen`.

> Se a Fase 1 já criou um `buildServer`/error-handler, estenda-os em vez de duplicar. Aqui assumimos que ainda não existem como factory testável.

- [ ] **Step 1: Error-handler central**

`src/infra/http/error-handler.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { PricingError } from "../../domain/pricing/errors";
import { EstimateNotFoundError, EstimateStatusError } from "../../domain/estimate/errors";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof EstimateNotFoundError) {
      return reply.status(404).send({ error: error.message });
    }
    if (error instanceof EstimateStatusError) {
      return reply.status(409).send({ error: error.message });
    }
    if (error instanceof PricingError) {
      return reply.status(400).send({ error: error.message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "internal server error" });
  });
}
```

- [ ] **Step 2: Escrever o teste que falha (server vazio responde /ping)**

`src/infra/http/build-server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../../domain/pricing/config";
import type { PricingConfig } from "../../domain/pricing/types";
import type { Estimate } from "../../domain/estimate/types";
import type { EstimateStore, EstimatePatch, NewEstimate } from "../../modules/estimates/repository";
import { buildServer } from "./build-server";

class FakeConfigStore {
  config: PricingConfig = defaultConfig();
  async get() { return this.config; }
  async save(c: PricingConfig) { this.config = c; }
}
class FakeEstimateStore implements EstimateStore {
  rows: Estimate[] = [];
  seq = 0;
  async create(data: NewEstimate) {
    const now = new Date().toISOString();
    const e: Estimate = {
      id: `id-${++this.seq}`, number: this.seq, publicToken: data.publicToken,
      customer: data.customer, input: data.input, breakdown: data.breakdown,
      status: "draft", createdAt: now, updatedAt: now, sentAt: null, decidedAt: null,
    };
    this.rows.push(e);
    return e;
  }
  async list() {
    return this.rows.map((r) => ({
      id: r.id, number: r.number, customerName: r.customer.name,
      total: r.breakdown.total, status: r.status, createdAt: r.createdAt,
    }));
  }
  async getById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async getByToken(t: string) { return this.rows.find((r) => r.publicToken === t) ?? null; }
  async update(id: string, patch: EstimatePatch) {
    const r = this.rows.find((x) => x.id === id);
    if (!r) throw new Error("not found in fake");
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return r;
  }
}

export function fakeDeps() {
  return { estimates: new FakeEstimateStore(), config: new FakeConfigStore() };
}

describe("buildServer", () => {
  it("responde 200 em /ping", async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: "GET", url: "/ping" });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `bunx vitest run src/infra/http/build-server.test.ts`
Expected: FAIL (`Cannot find module './build-server'`).

- [ ] **Step 4: Implementar o `buildServer` (sem rotas de feature ainda)**

`src/infra/http/build-server.ts`:

```ts
import fastifyCors from "@fastify/cors";
import fastify, { type FastifyInstance } from "fastify";
import type { ConfigStore } from "../../modules/pricing-config/repository";
import type { EstimateStore } from "../../modules/estimates/repository";
import { registerErrorHandler } from "./error-handler";

export type ServerDeps = { estimates: EstimateStore; config: ConfigStore };

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = fastify({ logger: false });

  app.register(fastifyCors, { origin: process.env.CLIENT_ORIGIN || "http://localhost:3000" });
  registerErrorHandler(app);

  app.get("/ping", async () => "pong\n");

  // As rotas de feature (admin + públicas) são registradas nas Tasks 6 e 7:
  // estimatesRoutes(app, deps);
  // publicEstimatesRoutes(app, deps);

  return app;
}
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `bunx vitest run src/infra/http/build-server.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/infra/http/error-handler.ts src/infra/http/build-server.ts src/infra/http/build-server.test.ts
git commit -m "feat(http): central error-handler and buildServer factory"
```

---

### Task 6: HTTP — rotas admin + schemas Zod

**Files:**
- Create: `src/modules/estimates/schema.ts`
- Create: `src/modules/estimates/routes.ts`
- Modify: `src/infra/http/build-server.ts`
- Test: `src/modules/estimates/routes.test.ts`

**Interfaces:**
- Consumes: `buildServer`/`fakeDeps` (Task 5), service (Task 4).
- Produces:
  - `estimateInputSchema` (Zod: `{ customer, input }`).
  - `estimatesRoutes(app: FastifyInstance, deps: ServerDeps): void` — registra `POST /api/estimates`, `GET /api/estimates`, `GET /api/estimates/:id`, `PUT /api/estimates/:id`, `POST /api/estimates/:id/send`.

- [ ] **Step 1: Schema Zod**

`src/modules/estimates/schema.ts`:

```ts
import { z } from "zod";

const serviceTypeSchema = z.enum(["deep_clean", "recurring", "move_in_out"]);
const frequencySchema = z.enum(["one_time", "weekly", "bi_weekly", "monthly"]);

export const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address: z.string().min(1),
});

const quoteInputSchema = z.object({
  sqft: z.number().int().nonnegative(),
  bedrooms: z.number().int().nonnegative(),
  bathrooms: z.number().int().nonnegative(),
  pets: z.number().int().nonnegative(),
  service: serviceTypeSchema,
  frequency: frequencySchema,
  addOns: z.array(z.object({ addOnId: z.string(), quantity: z.number().int().min(1) })).default([]),
  manualDiscount: z.number().int().nonnegative().default(0),
});

export const estimateInputSchema = z.object({
  customer: customerSchema,
  input: quoteInputSchema,
});
```

- [ ] **Step 2: Escrever o teste que falha**

`src/modules/estimates/routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildServer } from "../../infra/http/build-server";
import { fakeDeps } from "../../infra/http/build-server.test";

const body = {
  customer: { name: "Helena", email: "h@x.com", phone: "1", address: "rua 1" },
  input: {
    sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0,
    service: "deep_clean", frequency: "one_time", addOns: [], manualDiscount: 0,
  },
};

describe("rotas admin de estimates", () => {
  it("POST cria em draft com total 19000", async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: "POST", url: "/api/estimates", payload: body });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("draft");
    expect(res.json().breakdown.total).toBe(19000);
  });

  it("POST com customer inválido retorna 400", async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({
      method: "POST", url: "/api/estimates",
      payload: { ...body, customer: { ...body.customer, email: "nope" } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT em draft recalcula; depois de send, PUT retorna 409", async () => {
    const app = buildServer(fakeDeps());
    const id = (await app.inject({ method: "POST", url: "/api/estimates", payload: body })).json().id;

    const put = await app.inject({
      method: "PUT", url: `/api/estimates/${id}`,
      payload: { ...body, input: { ...body.input, service: "move_in_out" } },
    });
    expect(put.json().breakdown.total).toBe(34200);

    await app.inject({ method: "POST", url: `/api/estimates/${id}/send` });
    const put2 = await app.inject({ method: "PUT", url: `/api/estimates/${id}`, payload: body });
    expect(put2.statusCode).toBe(409);
  });

  it("GET /:id inexistente retorna 404", async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: "GET", url: "/api/estimates/nope" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `bunx vitest run src/modules/estimates/routes.test.ts`
Expected: FAIL (rotas inexistentes → 404 onde se espera 201).

- [ ] **Step 4: Implementar as rotas admin**

`src/modules/estimates/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ServerDeps } from "../../infra/http/build-server";
import { EstimateNotFoundError } from "../../domain/estimate/errors";
import { estimateInputSchema } from "./schema";
import { createEstimate, sendEstimate, updateEstimate } from "./service";

export function estimatesRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.post("/api/estimates", async (request, reply) => {
    const parsed = estimateInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const created = await createEstimate(deps, parsed.data);
    return reply.status(201).send(created);
  });

  app.get("/api/estimates", async () => deps.estimates.list());

  app.get<{ Params: { id: string } }>("/api/estimates/:id", async (request) => {
    const e = await deps.estimates.getById(request.params.id);
    if (!e) throw new EstimateNotFoundError(); // error-handler -> 404
    return e;
  });

  app.put<{ Params: { id: string } }>("/api/estimates/:id", async (request, reply) => {
    const parsed = estimateInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    // updateEstimate lança EstimateStatusError (409) ou EstimateNotFoundError (404).
    return updateEstimate(deps, request.params.id, parsed.data);
  });

  app.post<{ Params: { id: string } }>("/api/estimates/:id/send", async (request) =>
    sendEstimate(deps, request.params.id),
  );
}
```

- [ ] **Step 5: Registrar as rotas no `buildServer`**

Em `src/infra/http/build-server.ts`, importar e chamar `estimatesRoutes` (substituindo o comentário da Task 5):

```ts
import { estimatesRoutes } from "../../modules/estimates/routes";
// ...dentro de buildServer, após registerErrorHandler/ping:
estimatesRoutes(app, deps);
```

- [ ] **Step 6: Rodar e verificar que passa**

Run: `bunx vitest run src/modules/estimates/routes.test.ts`
Expected: PASS (todos).

- [ ] **Step 7: Commit**

```bash
git add src/modules/estimates/schema.ts src/modules/estimates/routes.ts src/infra/http/build-server.ts src/modules/estimates/routes.test.ts
git commit -m "feat(estimate): admin HTTP routes (CRUD + send)"
```

---

### Task 7: HTTP — rotas públicas por token

**Files:**
- Create: `src/modules/estimates/public-routes.ts`
- Modify: `src/infra/http/build-server.ts`
- Test: `src/modules/estimates/public-routes.test.ts`

**Interfaces:**
- Consumes: `buildServer`/`fakeDeps`, service (`getPublicView`, `acceptByToken`, `declineByToken`).
- Produces: `publicEstimatesRoutes(app: FastifyInstance, deps: ServerDeps): void` — registra `GET /api/public/estimates/:token`, `POST /api/public/estimates/:token/accept`, `POST /api/public/estimates/:token/decline`.

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/estimates/public-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildServer } from "../../infra/http/build-server";
import { fakeDeps } from "../../infra/http/build-server.test";

const body = {
  customer: { name: "Helena", email: "h@x.com", phone: "1", address: "rua 1" },
  input: {
    sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0,
    service: "deep_clean", frequency: "one_time", addOns: [], manualDiscount: 0,
  },
};

// Cria + envia uma estimate e devolve o token público.
async function createAndSend(app: ReturnType<typeof buildServer>) {
  const created = (await app.inject({ method: "POST", url: "/api/estimates", payload: body })).json();
  await app.inject({ method: "POST", url: `/api/estimates/${created.id}/send` });
  return created.publicToken as string;
}

describe("rotas públicas de estimates", () => {
  it("GET com token de uma sent retorna view sanitizada (sem id/input)", async () => {
    const app = buildServer(fakeDeps());
    const token = await createAndSend(app);
    const res = await app.inject({ method: "GET", url: `/api/public/estimates/${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().breakdown.total).toBe(19000);
    expect(res.json().id).toBeUndefined();
    expect(res.json().input).toBeUndefined();
  });

  it("GET com token inválido retorna 404", async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: "GET", url: "/api/public/estimates/nope" });
    expect(res.statusCode).toBe(404);
  });

  it("accept muda status; segundo accept retorna 409", async () => {
    const app = buildServer(fakeDeps());
    const token = await createAndSend(app);
    const ok = await app.inject({ method: "POST", url: `/api/public/estimates/${token}/accept` });
    expect(ok.json().status).toBe("accepted");
    const again = await app.inject({ method: "POST", url: `/api/public/estimates/${token}/accept` });
    expect(again.statusCode).toBe(409);
  });

  it("decline de uma draft (não enviada) retorna 409", async () => {
    const app = buildServer(fakeDeps());
    const created = (await app.inject({ method: "POST", url: "/api/estimates", payload: body })).json();
    const res = await app.inject({ method: "POST", url: `/api/public/estimates/${created.publicToken}/decline` });
    expect(res.statusCode).toBe(409);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `bunx vitest run src/modules/estimates/public-routes.test.ts`
Expected: FAIL (rotas públicas inexistentes).

- [ ] **Step 3: Implementar as rotas públicas**

`src/modules/estimates/public-routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ServerDeps } from "../../infra/http/build-server";
import { acceptByToken, declineByToken, getPublicView } from "./service";

export function publicEstimatesRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.get<{ Params: { token: string } }>("/api/public/estimates/:token", async (request) =>
    getPublicView(deps, request.params.token),
  );

  app.post<{ Params: { token: string } }>("/api/public/estimates/:token/accept", async (request) =>
    acceptByToken(deps, request.params.token),
  );

  app.post<{ Params: { token: string } }>("/api/public/estimates/:token/decline", async (request) =>
    declineByToken(deps, request.params.token),
  );
}
```

- [ ] **Step 4: Registrar no `buildServer`**

Em `src/infra/http/build-server.ts`, após `estimatesRoutes(app, deps)`:

```ts
import { publicEstimatesRoutes } from "../../modules/estimates/public-routes";
// ...
publicEstimatesRoutes(app, deps);
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `bunx vitest run src/modules/estimates/public-routes.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add src/modules/estimates/public-routes.ts src/infra/http/build-server.ts src/modules/estimates/public-routes.test.ts
git commit -m "feat(estimate): public token routes (view + accept/decline)"
```

---

### Task 8: Wiring — `src/server.ts` usa `buildServer`

**Files:**
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `buildServer`, `EstimateRepository`, `PricingConfigRepository`, singleton `db`.

- [ ] **Step 1: Compor as dependências reais e dar listen**

Reescrever `src/server.ts` para montar os repositories reais e delegar ao `buildServer` (preservando a rota `/api/auth/*` do better-auth, se já existir, registrando-a sobre a instância retornada):

```ts
import { buildServer } from "./infra/http/build-server";
import { db } from "./infra/db";
import { EstimateRepository } from "./modules/estimates/repository";
import { PricingConfigRepository } from "./modules/pricing-config/repository";

const app = buildServer({
  estimates: new EstimateRepository(db),
  config: new PricingConfigRepository(db),
});

app.listen({ port: 8080 }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
```

> Se a rota `/api/auth/*` (better-auth) for necessária agora, registre-a dentro de `buildServer` ou sobre `app` antes do `listen`, mantendo o handler que já existe no `src/server.ts` atual.

- [ ] **Step 2: Smoke test manual**

Run:
```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine'
bun dev &
sleep 2
curl -s -X POST localhost:8080/api/estimates -H 'Content-Type: application/json' \
  -d '{"customer":{"name":"Helena","email":"h@x.com","phone":"1","address":"rua 1"},"input":{"sqft":1000,"bedrooms":2,"bathrooms":1,"pets":0,"service":"deep_clean","frequency":"one_time","addOns":[],"manualDiscount":0}}'
kill %1
```
Expected: JSON da estimate criada com `"status":"draft"` e `"total":19000`.

- [ ] **Step 3: Rodar a suíte inteira do backend**

Run: `bunx vitest run src`
Expected: PASS (domínio + service + http; integração roda só com `DATABASE_URL`).

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat(http): wire buildServer with real repositories"
```

---

### Task 9: Frontend — router, API client e tipos de estimate

**Files:**
- Create: `frontend/src/lib/estimates.ts`
- Create: `frontend/src/types/estimate.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `api` (axios, Fase 1), `QuoteInput`/`QuoteBreakdown` (tipos do front, Fase 1).
- Produces: tipos `EstimateStatus`/`CustomerInfo`/`Estimate`/`EstimateSummary`/`PublicEstimateView`; funções de API (`createEstimate`, `listEstimates`, `getEstimate`, `updateEstimate`, `sendEstimate`, `getPublicEstimate`, `acceptPublic`, `declinePublic`); rotas do react-router.

- [ ] **Step 1: Instalar react-router**

```bash
cd frontend
bun add react-router-dom
```

- [ ] **Step 2: Tipos (espelham o backend)**

`frontend/src/types/estimate.ts`:

```ts
import type { QuoteBreakdown, QuoteInput } from "../types"; // tipos da Fase 1

export type EstimateStatus = "draft" | "sent" | "accepted" | "declined";

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface Estimate {
  id: string;
  number: number;
  publicToken: string;
  customer: CustomerInfo;
  input: QuoteInput;
  breakdown: QuoteBreakdown;
  status: EstimateStatus;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  decidedAt: string | null;
}

export interface EstimateSummary {
  id: string;
  number: number;
  customerName: string;
  total: number;
  status: EstimateStatus;
  createdAt: string;
}

export interface PublicEstimateView {
  number: number;
  customer: CustomerInfo;
  breakdown: QuoteBreakdown;
  status: EstimateStatus;
}
```

- [ ] **Step 3: Funções de API**

`frontend/src/lib/estimates.ts`:

```ts
import { api } from "./api";
import type { CustomerInfo, Estimate, EstimateSummary, PublicEstimateView } from "../types/estimate";
import type { QuoteInput } from "../types";

type EstimateInput = { customer: CustomerInfo; input: QuoteInput };

export async function createEstimate(dto: EstimateInput): Promise<Estimate> {
  return (await api.post("/estimates", dto)).data;
}
export async function listEstimates(): Promise<EstimateSummary[]> {
  return (await api.get("/estimates")).data;
}
export async function getEstimate(id: string): Promise<Estimate> {
  return (await api.get(`/estimates/${id}`)).data;
}
export async function updateEstimate(id: string, dto: EstimateInput): Promise<Estimate> {
  return (await api.put(`/estimates/${id}`, dto)).data;
}
export async function sendEstimate(id: string): Promise<Estimate> {
  return (await api.post(`/estimates/${id}/send`)).data;
}
export async function getPublicEstimate(token: string): Promise<PublicEstimateView> {
  return (await api.get(`/public/estimates/${token}`)).data;
}
export async function acceptPublic(token: string): Promise<PublicEstimateView> {
  return (await api.post(`/public/estimates/${token}/accept`)).data;
}
export async function declinePublic(token: string): Promise<PublicEstimateView> {
  return (await api.post(`/public/estimates/${token}/decline`)).data;
}
```

- [ ] **Step 4: Configurar o router**

`frontend/src/main.tsx` — envolver `App` com `BrowserRouter` (dentro do `QueryClientProvider` da Fase 1):

```tsx
import { BrowserRouter } from "react-router-dom";
// ...
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

`frontend/src/App.tsx` — definir as rotas:

```tsx
import { Routes, Route, Link } from "react-router-dom";
import { CalculatorPage } from "./pages/CalculatorPage";
import { EstimatesListPage } from "./pages/EstimatesListPage";
import { EstimateDetailPage } from "./pages/EstimateDetailPage";
import { PublicEstimatePage } from "./pages/PublicEstimatePage";

export default function App() {
  return (
    <Routes>
      <Route path="/e/:token" element={<PublicEstimatePage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<CalculatorPage />} />
        <Route path="/estimates" element={<EstimatesListPage />} />
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Route>
    </Routes>
  );
}

// Layout com navegação; a página pública (/e/:token) fica fora dele de propósito.
function AppShell() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="flex gap-4 border-b border-zinc-800 px-6 py-3 text-sm">
        <Link to="/">Nova estimate</Link>
        <Link to="/estimates">Estimates</Link>
      </nav>
      <Outlet />
    </div>
  );
}
```

Adicionar `import { Outlet } from "react-router-dom";` no topo.

- [ ] **Step 5: Sanidade de tipos**

Run: `cd frontend && bunx tsc --noEmit`
Expected: sem erros (as páginas referenciadas serão criadas na Task 10; se `tsc` reclamar de imports faltando, prossiga para a Task 10 e rode de novo ao final).

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/lib/estimates.ts frontend/src/types/estimate.ts frontend/src/main.tsx frontend/src/App.tsx frontend/package.json
git commit -m "feat(frontend): router, estimate api client and types"
```

---

### Task 10: Frontend — telas de lista, detalhe e criação

**Files:**
- Create: `frontend/src/lib/estimateNumber.ts`
- Test: `frontend/src/lib/estimateNumber.test.ts`
- Create: `frontend/src/pages/EstimatesListPage.tsx`
- Create: `frontend/src/pages/EstimateDetailPage.tsx`
- Modify: `frontend/src/pages/CalculatorPage.tsx`

**Interfaces:**
- Consumes: funções de API (Task 9), `formatCents`/`BreakdownPanel` (Fase 1), TanStack Query.
- Produces: `formatEstimateNumber(n: number): string`; telas `EstimatesListPage`, `EstimateDetailPage`; bloco de customer + "Salvar como rascunho" na `CalculatorPage`.

- [ ] **Step 1: Escrever o teste que falha (formatador do número)**

`frontend/src/lib/estimateNumber.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatEstimateNumber } from "./estimateNumber";

describe("formatEstimateNumber", () => {
  it("formata como EST-#### com zero-padding", () => {
    expect(formatEstimateNumber(7)).toBe("EST-0007");
    expect(formatEstimateNumber(1234)).toBe("EST-1234");
    expect(formatEstimateNumber(99999)).toBe("EST-99999");
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd frontend && bunx vitest run src/lib/estimateNumber.test.ts`
Expected: FAIL (`Cannot find module './estimateNumber'`).

- [ ] **Step 3: Implementar o formatador**

`frontend/src/lib/estimateNumber.ts`:

```ts
// Formata o número sequencial da estimate como "EST-0007" (mínimo de 4 dígitos).
export function formatEstimateNumber(n: number): string {
  return `EST-${String(n).padStart(4, "0")}`;
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `cd frontend && bunx vitest run src/lib/estimateNumber.test.ts`
Expected: PASS.

- [ ] **Step 5: Tela de lista**

`frontend/src/pages/EstimatesListPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listEstimates } from "../lib/estimates";
import { formatCents } from "../lib/money";
import { formatEstimateNumber } from "../lib/estimateNumber";

export function EstimatesListPage() {
  const q = useQuery({ queryKey: ["estimates"], queryFn: listEstimates });
  if (q.isLoading) return <div className="p-6">Carregando…</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Estimates</h1>
      <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {q.data?.map((e) => (
          <Link key={e.id} to={`/estimates/${e.id}`} className="flex items-center justify-between p-4 hover:bg-zinc-900">
            <span>{formatEstimateNumber(e.number)} · {e.customerName}</span>
            <span className="flex items-center gap-3">
              <span className="text-xs uppercase text-zinc-400">{e.status}</span>
              <span>{formatCents(e.total)}</span>
            </span>
          </Link>
        ))}
        {q.data?.length === 0 && <div className="p-4 text-zinc-400">Nenhuma estimate ainda.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Tela de detalhe (com Send + link público)**

`frontend/src/pages/EstimateDetailPage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getEstimate, sendEstimate } from "../lib/estimates";
import { BreakdownPanel } from "../components/BreakdownPanel";
import { formatEstimateNumber } from "../lib/estimateNumber";

export function EstimateDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["estimate", id], queryFn: () => getEstimate(id) });
  const send = useMutation({
    mutationFn: () => sendEstimate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimate", id] }),
  });

  if (q.isLoading || !q.data) return <div className="p-6">Carregando…</div>;
  const e = q.data;
  const publicUrl = `${window.location.origin}/e/${e.publicToken}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{formatEstimateNumber(e.number)} · {e.customer.name}</h1>
        <span className="text-xs uppercase text-zinc-400">{e.status}</span>
      </div>
      <BreakdownPanel b={e.breakdown} />
      {e.status === "draft" ? (
        <button type="button" onClick={() => send.mutate()} className="rounded-lg bg-blue-600 px-4 py-2">
          Enviar
        </button>
      ) : (
        <label className="block text-sm text-zinc-400">
          Link público
          <input readOnly value={publicUrl} className="mt-1 w-full rounded-lg bg-zinc-900 p-2 text-zinc-100" />
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Adicionar customer + "Salvar como rascunho" na CalculatorPage**

Em `frontend/src/pages/CalculatorPage.tsx`, adicionar estado de `customer`, uma mutation de criação e um botão. Inserir os imports e, abaixo do formulário existente, o bloco:

```tsx
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createEstimate } from "../lib/estimates";
import type { CustomerInfo } from "../types/estimate";
// dentro do componente CalculatorPage:
const navigate = useNavigate();
const [customer, setCustomer] = useState<CustomerInfo>({ name: "", email: "", phone: "", address: "" });
const save = useMutation({
  mutationFn: () => createEstimate({ customer, input }),
  onSuccess: (e) => navigate(`/estimates/${e.id}`),
});
```

E na JSX, um bloco de inputs de `customer` + botão:

```tsx
<div className="space-y-2">
  {(["name", "email", "phone", "address"] as const).map((field) => (
    <input
      key={field}
      placeholder={field}
      value={customer[field]}
      onChange={(ev) => setCustomer((c) => ({ ...c, [field]: ev.target.value }))}
      className="w-full rounded-lg bg-zinc-900 p-2"
    />
  ))}
  <button type="button" onClick={() => save.mutate()} className="rounded-lg bg-blue-600 px-4 py-2">
    Salvar como rascunho
  </button>
</div>
```

- [ ] **Step 8: Rodar testes do front e checagem de tipos**

Run: `cd frontend && bunx vitest run && bunx tsc --noEmit`
Expected: PASS e sem erros de tipo.

- [ ] **Step 9: Commit**

```bash
cd ..
git add frontend/src/lib/estimateNumber.ts frontend/src/lib/estimateNumber.test.ts frontend/src/pages/EstimatesListPage.tsx frontend/src/pages/EstimateDetailPage.tsx frontend/src/pages/CalculatorPage.tsx
git commit -m "feat(frontend): estimates list, detail and create flow"
```

---

### Task 11: Frontend — página pública de accept/decline

**Files:**
- Create: `frontend/src/pages/PublicEstimatePage.tsx`

**Interfaces:**
- Consumes: `getPublicEstimate`, `acceptPublic`, `declinePublic`, `BreakdownPanel`, `formatEstimateNumber`.

- [ ] **Step 1: Implementar a página pública isolada**

`frontend/src/pages/PublicEstimatePage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { acceptPublic, declinePublic, getPublicEstimate } from "../lib/estimates";
import { BreakdownPanel } from "../components/BreakdownPanel";
import { formatEstimateNumber } from "../lib/estimateNumber";

export function PublicEstimatePage() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["public-estimate", token], queryFn: () => getPublicEstimate(token) });

  const decide = (fn: (t: string) => Promise<unknown>) =>
    useMutation({
      mutationFn: () => fn(token),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["public-estimate", token] }),
    });
  const accept = decide(acceptPublic);
  const decline = decide(declinePublic);

  if (q.isLoading) return <div className="p-10 text-center">Carregando…</div>;
  if (q.isError || !q.data) return <div className="p-10 text-center">Estimate não encontrada.</div>;
  const v = q.data;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-10">
      <h1 className="text-center text-2xl font-semibold">{formatEstimateNumber(v.number)}</h1>
      <p className="text-center text-zinc-400">Olá, {v.customer.name}. Aqui está seu orçamento:</p>
      <BreakdownPanel b={v.breakdown} />
      {v.status === "sent" ? (
        <div className="flex gap-3">
          <button type="button" onClick={() => accept.mutate()} className="flex-1 rounded-lg bg-green-600 px-4 py-3">
            Aceitar
          </button>
          <button type="button" onClick={() => decline.mutate()} className="flex-1 rounded-lg bg-zinc-700 px-4 py-3">
            Recusar
          </button>
        </div>
      ) : (
        <p className="text-center text-lg">
          {v.status === "accepted" ? "✅ Você aceitou esta estimate." : "Esta estimate foi recusada."}
        </p>
      )}
    </div>
  );
}
```

> Nota: a página pública vive fora do `AppShell` (sem a navegação do app) — ver Task 9, Step 4.

- [ ] **Step 2: Checagem de tipos + build**

Run: `cd frontend && bunx tsc --noEmit && bun run build`
Expected: sem erros; build conclui.

- [ ] **Step 3: Smoke test manual (e2e leve)**

Com backend (`bun dev`) e front (`bun dev` no `frontend/`) no ar: criar estimate em `/`, enviar em `/estimates/:id`, copiar o link público, abrir `/e/:token` em aba anônima, aceitar. Conferir que o status muda para `accepted`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/src/pages/PublicEstimatePage.tsx
git commit -m "feat(frontend): public accept/decline page"
```

---

## Resumo de cobertura (plano × spec)

| Requisito do spec | Task(s) |
|-------------------|---------|
| Tipos da Estimate + contato embutido | 1 |
| Máquina de estado (draft→sent→accepted/declined) | 1, 4 |
| Erros 409/404 | 1, 5 |
| Schema/persistência + snapshot JSONB | 2, 3 |
| Repository (CRUD + token) | 3 |
| Service: calcula no create/update, congela no send | 4 |
| API admin (POST/GET/GET:id/PUT/send) | 6 |
| API pública por token (view/accept/decline) | 7 |
| Wiring com repositories reais | 8 |
| Frontend: router + tipos + client | 9 |
| Frontend: lista/detalhe/criação | 10 |
| Frontend: página pública | 11 |
| Dinheiro em cents, sem recálculo no front | 6, 7, 10, 11 |
