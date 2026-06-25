# Módulo 11 — Persistência das estimates (schema, JSONB e repository)

> **Como usar este guia:** eu **explico o porquê**, te dou os **models** e os **testes (RED)**.
> **Você escreve a implementação.** Gabarito: `docs/plans/2026-06-25-fase-2-estimates.md`, Tasks 2 e 3.
>
> **Convenção:** Bun, imports **sem extensão**, código na raiz `src/`. Testes de integração rodam
> com `bunx vitest run <path>` e exigem `DATABASE_URL`.

---

## 1. Objetivo

- Modelar a tabela `estimates` com **Drizzle** (incluindo `pgEnum`, `uuid`, coluna de identidade e
  três colunas **JSONB** tipadas).
- Implementar o **repository** (`EstimateRepository`) que grava e lê estimates, convertendo entre a
  *row* do banco e o tipo de domínio.
- Escrever **testes de integração** que rodam contra um Postgres real (e que se pulam sozinhos
  quando não há banco).

## 2. Conceitos

### 2.1 JSONB para o snapshot

A estimate guarda três blobs de JSON: `customer`, `input` e `breakdown`. Em vez de explodir cada
campo do breakdown em dezenas de colunas, gravamos o objeto inteiro numa coluna **`jsonb`**. O
Drizzle deixa isso **tipado** com `.$type<T>()`:

```ts
breakdown: jsonb("breakdown").$type<QuoteBreakdown>().notNull(),
```

Assim o TypeScript sabe que `row.breakdown` é um `QuoteBreakdown` — autocompletar e checagem de
tipo de graça, mesmo o dado vindo de uma coluna JSON. (Cuidado: `$type` é uma **promessa** sua ao
compilador; o banco não valida o shape. Quem garante o shape na entrada é o Zod, no módulo 12.)

> `jsonb` (binário) vs `json` (texto): use **`jsonb`**. Ele é mais eficiente para consultar e
> indexar, e normaliza o conteúdo. Para snapshot, é o certo.

### 2.2 `id` uuid + `number` legível: duas identidades, dois propósitos

- **`id` (uuid)** — chave primária interna, inguessável, usada nas rotas admin (`/estimates/:id`).
- **`number`** — um inteiro **sequencial** (`generatedAlwaysAsIdentity()`), que vira `EST-0007` na
  tela. É amigável para humanos ("me manda a estimate 7"), mas **previsível** — por isso **não**
  serve como credencial.

Ter os dois é proposital: o uuid protege, o number comunica. (E há um **terceiro** identificador, o
`publicToken`, que é a credencial da página pública — ver módulo 12.)

### 2.3 `pgEnum`: o status no banco

O `status` é um `pgEnum("estimate_status", [...])`. Isso cria um **tipo enum no Postgres**, então o
banco **recusa** um status fora da lista — uma segunda linha de defesa além do TypeScript.

### 2.4 Repository pattern + injeção de dependência

O `EstimateRepository` é a **única** parte do código que conhece tabelas e SQL. O resto da app fala
com a `interface EstimateStore` (um contrato: `create/list/getById/getByToken/update`). Benefícios:

- **Testável por cima:** o módulo 12 troca o repository real por um *fake* em memória (que também
  implementa `EstimateStore`) e testa as rotas sem banco.
- **Trocável:** se um dia mudar de Drizzle/Postgres, muda só o repository.

A injeção é simples: o repository recebe o `db` no construtor (`new EstimateRepository(db)`), em vez
de importar o singleton "por dentro". Isso deixa explícito do que ele depende.

### 2.5 Mapear *row* → domínio: o detalhe dos timestamps

O Drizzle devolve `timestamp` como **`Date`** (ou `null`). O nosso tipo `Estimate` usa **`string`
ISO** (`createdAt: string`, `sentAt: string | null`). Então o repository tem uma função
`toEstimate(row)` que faz a ponte: `row.createdAt.toISOString()`, e `row.sentAt ?
row.sentAt.toISOString() : null`. Centralizar essa conversão num lugar evita repetir `.toISOString()`
em todo método e mantém a fronteira "banco ↔ domínio" limpa.

### 2.6 Testes de integração que se pulam sozinhos

Testes de repository tocam um Postgres real (não dá pra "fingir" SQL com fidelidade). Para não
quebrar quando não há banco, usamos `describe.skipIf(!process.env.DATABASE_URL)`: com `DATABASE_URL`
setado, rodam; sem ele, são **pulados** (não falham). Cada teste limpa a tabela num `beforeEach`
para começar do zero.

## 3. Models

```ts
// src/infra/db/schemas/estimates.ts
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

Registre a tabela no objeto `schema` em `src/infra/db/schemas/index.ts` (preservando o que já
existe lá):

```ts
import { estimates, estimateStatus } from "./estimates";
export const schema = { /* ...entradas existentes..., */ estimates, estimateStatus };
```

O **contrato** e a **classe** do repository (assinaturas — corpos são seus):

```ts
// src/modules/estimates/repository.ts
import { db } from "../../infra/db";
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

export type Db = typeof db; // tipo do singleton, sem reinstanciar o pool

export class EstimateRepository implements EstimateStore {
  constructor(private db: Db) {}
  // create / list / getById / getByToken / update — implementação sua
}
```

## 4. Testes (RED)

Suba o Postgres e gere/aplique a migration antes:

```bash
bun db:up
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine'
bun db:generate
bun db:migrate
```

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
  service: "deep_clean", frequency: "one_time", addOns: [], manualDiscount: 0,
};

describe.skipIf(!url)("EstimateRepository", () => {
  const repo = new EstimateRepository(db);
  beforeEach(async () => { await db.delete(estimates); });

  it("cria e relê (id, number, status draft, total congelado)", async () => {
    const breakdown = calculate(input, defaultConfig());
    const created = await repo.create({
      customer: { name: "Helena", email: "h@x.com", phone: "1", address: "rua 1" },
      input, breakdown, publicToken: randomUUID(),
    });
    expect(created.id).toBeTruthy();
    expect(created.number).toBeGreaterThan(0);
    expect(created.status).toBe("draft");
    expect(created.breakdown.total).toBe(19000);
    expect((await repo.getById(created.id))?.breakdown.total).toBe(19000);
    expect((await repo.getByToken(created.publicToken))?.id).toBe(created.id);
  });

  it("atualiza status e timestamps", async () => {
    const breakdown = calculate(input, defaultConfig());
    const created = await repo.create({
      customer: { name: "X", email: "x@x.com", phone: "1", address: "a" },
      input, breakdown, publicToken: randomUUID(),
    });
    const updated = await repo.update(created.id, { status: "sent", sentAt: new Date().toISOString() });
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
    expect(rows[0].customerName).toBe("Ana");
    expect(rows[0].total).toBe(19000);
  });
});
```

Rode e **confirme que falha**:

```bash
bunx vitest run src/modules/estimates/repository.test.ts
```

Esperado: **FAIL** com `Cannot find module './repository'`.

## 5. Seu desafio (GREEN)

1. Crie o schema `estimates.ts` (como mostrado — é declarativo) e registre no `schema`.
2. Gere e aplique a migration (`bun db:generate && bun db:migrate`). Confira com
   `bun db:psql -c '\d estimates'`.
3. Implemente `EstimateRepository`:
   - `create`: `insert(...).values(data).returning()` e mapeie a row para `Estimate`.
   - `getById` / `getByToken`: `select().from(estimates).where(eq(...))`; devolva `null` se vazio.
   - `list`: `select` ordenado por `createdAt` desc; **projete** só os campos do `EstimateSummary`
     (incluindo `customerName` vindo de `customer.name` e `total` de `breakdown.total`).
   - `update`: `update(...).set({...patch, updatedAt: new Date()}).where(eq(id)).returning()`.
     Converta `sentAt`/`decidedAt` (string ISO no patch) para `Date` ao gravar.

**Dicas:**

- Escreva **uma** função `toEstimate(row)` que converte os `Date` para ISO string e reúna o objeto
  de domínio. Reuse-a em `create/getById/getByToken/update`. DRY.
- `eq` e `desc` vêm de `drizzle-orm`. O tipo da row é `typeof estimates.$inferSelect`.
- No `update`, valores `undefined` no `.set(...)` são ignorados pelo Drizzle — útil para um patch
  parcial.

```bash
bunx vitest run src/modules/estimates/repository.test.ts
```

Esperado: **PASS** (com `DATABASE_URL` setado).

## 6. Refactor & boas práticas

- **Fronteira de tipos num lugar só.** A conversão `Date ↔ string ISO` mora em `toEstimate`. O
  domínio não deve nem saber que existe `Date`.
- **Repository burro, domínio esperto.** O repository **não** decide regra de negócio (não valida
  transição, não calcula preço). Ele só persiste/lê. A regra fica no domínio e no service (módulo 12).
- **Projeção na lista.** Não devolva o `breakdown` inteiro no `list()` — a tela de lista só precisa
  do `total`. Trafegar menos é mais rápido e mais claro.

```bash
git add src/infra/db/schemas/estimates.ts src/infra/db/schemas/index.ts drizzle \
  src/modules/estimates/repository.ts src/modules/estimates/repository.test.ts
git commit -m "feat(estimate): drizzle schema and repository"
```

## 7. Checklist de conclusão

- [ ] Tabela `estimates` criada (migration aplicada); `bun db:psql -c '\d estimates'` mostra as colunas.
- [ ] `status` é um `pgEnum`; `id` é uuid com default; `number` é coluna de identidade; `public_token` é único.
- [ ] `EstimateRepository` implementa os 5 métodos do contrato `EstimateStore`.
- [ ] `toEstimate` converte `Date → ISO string` e é reusada (sem repetição).
- [ ] `list()` devolve **summaries** (sem o breakdown inteiro).
- [ ] Testes de integração **verdes** com `DATABASE_URL`; **pulados** (não falham) sem ele.

## 8. Para se aprofundar

- **Drizzle:** `jsonb().$type<T>()`, `pgEnum`, `generatedAlwaysAsIdentity`, `$inferSelect`/`$inferInsert`,
  `onConflictDoUpdate`. Leia a doc do `drizzle-orm/pg-core`.
- **JSONB no Postgres:** operadores `->`, `->>`, `@>`, e índices GIN (úteis no futuro para buscar
  dentro do JSON).
- **Repository pattern & Ports/Adapters (Hexagonal):** por que isolar o acesso a dados atrás de uma
  interface, e como isso destrava testes rápidos por cima.
- **Testes de integração:** estratégias de isolamento (truncate por teste, transações, bancos
  efêmeros via Docker/Testcontainers).

---

Pronto? Vá para **`12-http-e-pagina-publica.md`** — o service, as rotas admin e a rota pública por token.
