# Módulo 15 — Persistência dos leads e o seam de eventos

> **Como usar este guia:** eu **explico o porquê**, te dou os **models** e os **testes (RED)**.
> **Você escreve a implementação.** Gabarito: `docs/plans/2026-06-25-fase-3-leads-pipeline.md`, Tasks 2–4.
>
> **Convenção:** Bun, imports **sem extensão**, raiz `src/`. Integração: `bunx vitest run` + `DATABASE_URL`.

---

## 1. Objetivo

- A tabela `leads` e uma **migration que evolui** a `estimates` (adiciona `lead_id`).
- O `LeadRepository` (CRUD + `updateStage`) e o `EstimateRepository.listByLead`.
- O **seam de eventos** na prática: alterar o `estimate service` para (a) criar a estimate **a partir
  de um lead** e (b) **auto-avançar** o lead nas transições, via `nextStage`.

## 2. Conceitos

> **Colunas vs `jsonb` — o papel define o storage.** O contato do lead vira **colunas planas**
> (`name`, `email`, `phone`, `address`), não `jsonb`. Por quê? Porque o lead é **dado vivo e
> consultável**: você vai buscar por email, filtrar/ordenar por nome, talvez pôr um índice único.
> `jsonb` serve para **snapshot** (o `customer`/`breakdown` da estimate, que congelam e nunca se
> consulta isolado) — não para dado canônico que se edita e pesquisa. Mesmos campos, papéis
> diferentes ⇒ storage diferente.

### 2.1 Relação 1—N e uma FK *nullable*

`Lead 1 — N Estimate`: uma estimate **pertence** a um lead. No banco, isso é uma **foreign key**:
`estimates.lead_id` referenciando `leads.id`. Mas há um detalhe: estimates da **Fase 2** já existem
**sem** lead. Se a coluna fosse `NOT NULL`, a migration quebraria nelas. Solução: `lead_id` é
**nullable** no banco. O **fluxo novo** sempre seta (a API exige `leadId`); o nullable existe só para
conviver com o legado. É um padrão comum: *evoluir um schema sem romper o que já está lá*.

### 2.2 Migration que altera tabela existente

Até aqui as migrations só **criavam** tabelas. Agora uma delas faz `ALTER TABLE estimates ADD COLUMN
lead_id ...`. O `drizzle-kit generate` detecta a diferença entre o schema TypeScript e o banco e gera
o SQL. Você **revisa** o SQL gerado (é um bom hábito) e aplica com `migrate`. Migrations são a história
versionada do seu banco — cada uma é um passo para frente, reproduzível.

### 2.3 Onde o `customer` snapshot vem agora

Na Fase 2, o `customer` da estimate era digitado na calculadora. Agora ele é **copiado do lead** no
momento da criação: `createEstimate` monta o `customer` a partir dos campos planos do lead
(`{ name: lead.name, email: lead.email, phone: lead.phone, address: lead.address }`) e grava como o
snapshot da estimate. Continua sendo um **snapshot** congelado: se o contato do lead mudar depois,
estimates antigas não mudam. O lead é a origem; a estimate guarda a foto do momento.

### 2.4 O seam: service compõe, não o repository

O auto-avanço **não** mora no repository (que é burro: só lê/grava). Ele mora no **service**, que
**orquestra**: depois de mudar o status da estimate, o service busca o lead, calcula `nextStage` e
grava o novo estágio. Para isso, o `estimate service` ganha uma dependência **`leads: LeadStore`** —
explícita, injetada. Repare na direção: o estimate service passa a conhecer o `LeadStore` (uma
interface), mas o domínio puro de ambos continua sem se importar com o outro.

```
sendEstimate ──▶ estimates.update(status: sent)
             └──▶ advanceLead(leadId, "sent")  ──▶ nextStage(lead.stage, "sent") ──▶ leads.updateStage
```

### 2.5 Defensivo: e se não houver lead?

`advanceLead` é defensivo: se a estimate não tem `leadId` (legado da Fase 2) ou o lead sumiu, ele
**pula** silenciosamente — não quebra a transição da estimate. O auto-avanço é um "bônus", não pode
derrubar a operação principal.

## 3. Models

```ts
// src/infra/db/schemas/leads.ts (declarativo — mostrado por inteiro)
import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const leadStage = pgEnum("lead_stage", ["new_lead", "contacted", "estimate_sent", "won", "lost"]);
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(), // .unique() se quiser garantir 1 lead por email
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  source: text("source"),
  notes: text("notes"),
  stage: leadStage("stage").notNull().default("new_lead"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Em `schemas/estimates.ts`, adicione a FK (nullable):

```ts
import { leads } from "./leads";
// dentro de pgTable("estimates", { ... }):
leadId: uuid("lead_id").references(() => leads.id),
```

`LeadStore` + repository (assinaturas — corpos seus):

```ts
// src/modules/leads/repository.ts
export type NewLead = { name: string; email: string; phone: string; address: string; source: string | null; notes: string | null };
export type LeadPatch = Partial<NewLead>;

export interface LeadStore {
  create(data: NewLead): Promise<Lead>;
  list(): Promise<LeadSummary[]>;
  getById(id: string): Promise<Lead | null>;
  update(id: string, patch: LeadPatch): Promise<Lead>;
  updateStage(id: string, stage: LeadStage): Promise<Lead>;
}
export class LeadRepository implements LeadStore { constructor(private db: typeof db) {} /* ... */ }
```

E o estimate service alterado (assinaturas):

```ts
export type EstimateDeps = { estimates: EstimateStore; config: ConfigStore; leads: LeadStore };
export type EstimateInputDto = { leadId: string; input: QuoteInput };
export type EstimateUpdateDto = { input: QuoteInput };
// createEstimate(deps, { leadId, input }) — busca lead (404 se não existe), copia contato, calcula, grava
// sendEstimate/acceptByToken/declineByToken — transicionam E chamam advanceLead(deps, leadId, event)
```

> Lembre de adicionar `listByLead(leadId): Promise<EstimateSummary[]>` à interface `EstimateStore` e
> implementá-lo no `EstimateRepository` (filtra por `lead_id`), e mapear `leadId` no `toEstimate`.

## 4. Testes (RED)

Dois focos. **(a)** Integração do `LeadRepository` (precisa de DB):

```ts
// src/modules/leads/repository.test.ts (trecho — completo no plano, Task 3)
describe.skipIf(!process.env.DATABASE_URL)("LeadRepository", () => {
  const repo = new LeadRepository(db);
  beforeEach(async () => { await db.delete(leads); });
  it("cria em new_lead e move de estágio", async () => {
    const c = await repo.create({ contact, source: "website", notes: null });
    expect(c.stage).toBe("new_lead");
    expect((await repo.updateStage(c.id, "contacted")).stage).toBe("contacted");
  });
});
```

**(b)** O seam no estimate service, com **fakes** (sem DB) — o teste-chave da fase:

```ts
// src/modules/estimates/service.test.ts (trecho — fakes completos no plano, Task 4)
it("accept -> won; decline posterior NÃO rebaixa (guarda do won)", async () => {
  const deps = { estimates: new FakeEstimateStore(), config: new FakeConfigStore(), leads: new FakeLeadStore() };
  const lead = await deps.leads.create({ contact, source: null, notes: null });
  const e = await createEstimate(deps, { leadId: lead.id, input });
  await sendEstimate(deps, e.id);
  await acceptByToken(deps, e.publicToken);
  expect((await deps.leads.getById(lead.id)).stage).toBe("won");

  const e2 = await createEstimate(deps, { leadId: lead.id, input });
  await sendEstimate(deps, e2.id);
  await declineByToken(deps, e2.publicToken);
  expect((await deps.leads.getById(lead.id)).stage).toBe("won"); // guarda
});
```

Rode e **confirme que falha**:

```bash
bunx vitest run src/modules/estimates/service.test.ts
```

Esperado: **FAIL** (contrato antigo `createEstimate(deps, { customer, input })`).

## 5. Seu desafio (GREEN)

1. **Schema** `leads.ts` + FK `lead_id` na `estimates`; registre no `schema`. Gere e aplique a
   migration (`bun db:generate && bun db:migrate`); confira com `bun db:psql -c '\d estimates'`.
2. **`Estimate.leadId`**: adicione `leadId: string | null` ao tipo, mapeie no `toEstimate`, e
   `leadId: string` no `NewEstimate`. Implemente `EstimateRepository.listByLead`.
3. **`LeadRepository`**: implemente os 5 métodos (reuse uma função `toLead` para o mapeamento Date→ISO).
4. **Estimate service**: 
   - `createEstimate`: `leads.getById(leadId)` (404 se `null`), monte o `customer` a partir dos campos
     planos do lead, `calculate`, `estimates.create({ leadId, customer, input, breakdown, publicToken })`.
   - `advanceLead(deps, leadId, event)`: se não há `leadId`/lead, pula; senão `nextStage` e, se mudou,
     `leads.updateStage`.
   - `sendEstimate/acceptByToken/declineByToken`: após a transição, chame `advanceLead` com o evento
     (`"sent"`/`"accepted"`/`"declined"`).

**Dicas:**

- Uma função interna `transition(deps, id, to, stamp, event)` unifica as três transições (variam só o
  destino, o timestamp e o evento). DRY.
- O `advanceLead` é defensivo (seção 2.5): nunca deixe ele lançar e derrubar a transição da estimate.

```bash
bunx vitest run src/modules/leads src/modules/estimates
```

Esperado: **PASS** (integração só com `DATABASE_URL`).

## 6. Refactor & boas práticas

- **Repository burro, service esperto.** O auto-avanço é orquestração → service. O repository só
  persiste.
- **Dependência explícita.** O `estimate service` declara `leads: LeadStore` nas suas `deps` — fica
  óbvio que ele agora depende de leads. Sem singletons escondidos.
- **Snapshot continua snapshot.** Copiar o contato do lead **na criação** mantém a estimate
  auto-contida (mudou o lead depois? a estimate antiga não muda).

```bash
git add src/infra/db/schemas src/domain/estimate/types.ts src/modules/leads src/modules/estimates drizzle
git commit -m "feat(lead): persistence + estimate create-from-lead and stage auto-advance"
```

## 7. Checklist de conclusão

- [ ] Tabela `leads` criada; `estimates.lead_id` adicionado por migration (nullable).
- [ ] `EstimateRepository.listByLead` filtra por `lead_id`; `toEstimate` mapeia `leadId`.
- [ ] `LeadRepository` com os 5 métodos; `toLead` reusado.
- [ ] `createEstimate` exige lead (404 se não existe) e copia o contato.
- [ ] Enviar/aceitar/recusar auto-avança o lead; a **guarda do won** segura o decline posterior.
- [ ] Testes verdes (integração com `DATABASE_URL`).

## 8. Para se aprofundar

- **Migrations de evolução:** adicionar colunas/`NOT NULL` com backfill, sem downtime; por que
  nullable primeiro.
- **Foreign keys & integridade referencial:** `ON DELETE` (restrict/cascade/set null) — o que acontece
  com estimates se um lead for deletado.
- **Injeção de dependência entre módulos:** como passar uma store para um service sem acoplar a
  implementação concreta.
- **Composition root:** onde montar tudo (no `src/server.ts`) — ver módulo 16.

---

Pronto? Vá para **`16-http-leads.md`** — as rotas de leads e a mudança no `POST /estimates`.
