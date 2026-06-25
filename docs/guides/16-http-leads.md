# Módulo 16 — HTTP: rotas de leads e a mudança no `POST /estimates`

> **Como usar este guia:** eu **explico o porquê**, te dou os **models** e os **testes (RED)**.
> **Você escreve a implementação.** Gabarito: `docs/plans/2026-06-25-fase-3-leads-pipeline.md`, Task 5.
>
> **Convenção:** Bun, imports **sem extensão**, raiz `src/`. Testes: `bunx vitest run <path>`.

---

## 1. Objetivo

- As **rotas de leads**: CRUD + `PATCH /stage` (o drag) + `GET /:id/estimates` (estimates do lead).
- A mudança no **`POST /api/estimates`**: passa a exigir `leadId` (o `customer` vem do lead).
- Estender `ServerDeps` com `leads` e o error-handler com `LeadNotFoundError` → 404.

## 2. Conceitos

> **Onde os tipos nascem: Zod no boundary, entidade à mão no domínio.** A entidade `Lead` é um tipo
> **escrito à mão** em `domain/lead/types.ts` — puro, sem importar Zod (o domínio não conhece
> framework). Já o **input** da API nasce do **Zod** aqui no módulo, e o tipo do DTO é **inferido**
> com `z.infer` — *uma fonte da verdade* para o contrato de entrada. Por que não inferir o `Lead` do
> Zod? (1) acoplaria o domínio ao Zod; (2) o input **não é** a entidade — ele não tem `id`, `stage`,
> `createdAt` (o servidor define isso). São formas diferentes. Regra: **entidade à mão (domínio
> puro) + DTO inferido do Zod (boundary)**.

### 2.1 `PATCH` para uma mudança parcial: o drag

Mover um lead de estágio muda **um** campo (`stage`). O verbo HTTP certo para "atualização parcial" é
**`PATCH`** (vs `PUT`, que sugere substituir o recurso inteiro). Por isso o drag do Kanban chama
`PATCH /api/leads/:id/stage` com `{ stage }`. É uma rota pequena e específica — fácil de chamar do
front a cada *drop*.

### 2.2 Validar o destino do drag

O board é drag livre (módulo 14), mas "livre" significa **qualquer estágio válido** — não um texto
qualquer. O Zod valida que `stage` é um dos `LEAD_STAGES`. Se vier lixo, **400** antes de tocar o
banco. Repare na divisão: a *forma* (é um estágio conhecido?) é Zod na fronteira; a *regra de negócio*
(o auto-avanço, a guarda do won) é o domínio. Cada coisa no seu lugar.

### 2.3 A rota que muda contrato: `POST /api/estimates`

Esta é a mudança mais delicada da fase. Antes (Fase 2): `{ customer, input }`. Agora: `{ leadId,
input }`. O `customer` **sai** do contrato — o service o deriva do lead. Consequências:

- O `estimateInputSchema` muda (exige `leadId: uuid`, sem `customer`).
- O `PUT` (editar draft) agora manda só `{ input }` (um `estimateUpdateSchema` próprio).
- Quem criava estimate "solta" precisa de um lead antes. Isso **quebra** o teste de rotas da Fase 2 de
  propósito — você o atualiza para criar um lead primeiro. Mudança de contrato é assim: o teste te
  obriga a propagar a consequência por todo lado. É uma feature, não um aborrecimento.

### 2.4 `ServerDeps` cresce: composição em um lugar só

O `buildServer` agora precisa de `leads`. Então `ServerDeps` vira `{ estimates, config, leads }`, e o
**composition root** (`src/server.ts`) monta `new LeadRepository(db)` junto. Como os testes usam
`fakeDeps()`, esse helper também ganha um `FakeLeadStore`. Centralizar a montagem num lugar (o
`server.ts`) e injetar o resto é o que mantém o sistema testável e sem singletons espalhados.

### 2.5 404 consistente

`LeadNotFoundError` entra no error-handler central, ao lado de `EstimateNotFoundError`. Qualquer rota
que faça `getLeadOr404(...)` (detalhe, update, stage, estimates-do-lead) ganha o **404** de graça —
sem `try/catch` repetido. Uma rota lança; o handler formata.

## 3. Models

```ts
// src/modules/leads/schema.ts (contrato — mostrado por inteiro)
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

// O TIPO do input nasce do schema — uma fonte da verdade para o contrato de entrada.
export type LeadInput = z.infer<typeof leadInputSchema>;

export const stageSchema = z.object({ stage: z.enum(LEAD_STAGES as [string, ...string[]]) });
```

```ts
// src/modules/estimates/schema.ts — substitui o da Fase 2
export const estimateInputSchema = z.object({ leadId: z.string().uuid(), input: quoteInputSchema });
export const estimateUpdateSchema = z.object({ input: quoteInputSchema });
```

```ts
// assinaturas das rotas / deps
export type ServerDeps = { estimates: EstimateStore; config: ConfigStore; leads: LeadStore };
export function leadsRoutes(app: FastifyInstance, deps: ServerDeps): void;
```

Rotas a expor:

| Método | Rota | Regra |
|--------|------|-------|
| `POST` | `/api/leads` | cria em `new_lead` → **201** |
| `GET` | `/api/leads` | lista `LeadSummary[]` (board) |
| `GET` | `/api/leads/:id` | detalhe; **404** se não existe |
| `PUT` | `/api/leads/:id` | edita contato/source/notes |
| `PATCH` | `/api/leads/:id/stage` | move de estágio (drag); **400** se stage inválido |
| `GET` | `/api/leads/:id/estimates` | estimates do lead; **404** se lead não existe |
| `POST` | `/api/estimates` | agora exige `{ leadId, input }`; **400** sem leadId, **404** se leadId não existe |

## 4. Testes (RED)

`src/modules/leads/routes.test.ts` (trechos — completo no plano, Task 5):

```ts
import { describe, expect, it } from "vitest";
import { buildServer } from "../../infra/http/build-server";
import { fakeDeps } from "../../infra/http/build-server.test"; // agora inclui FakeLeadStore

const lead = { name: "Helena", email: "h@x.com", phone: "1", address: "rua 1", source: "website" };

it("POST cria em new_lead; PATCH move; PATCH inexistente -> 404", async () => {
  const app = buildServer(fakeDeps());
  const id = (await app.inject({ method: "POST", url: "/api/leads", payload: lead })).json().id;
  expect((await app.inject({ method: "PATCH", url: `/api/leads/${id}/stage`, payload: { stage: "contacted" } })).json().stage).toBe("contacted");
  expect((await app.inject({ method: "PATCH", url: "/api/leads/nope/stage", payload: { stage: "contacted" } })).statusCode).toBe(404);
});

it("GET /:id/estimates lista as estimates do lead", async () => {
  const app = buildServer(fakeDeps());
  const id = (await app.inject({ method: "POST", url: "/api/leads", payload: lead })).json().id;
  await app.inject({ method: "POST", url: "/api/estimates", payload: { leadId: id, input: {
    sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0, service: "deep_clean", frequency: "one_time", addOns: [], manualDiscount: 0,
  } } });
  expect((await app.inject({ method: "GET", url: `/api/leads/${id}/estimates` })).json()).toHaveLength(1);
});
```

Rode e **confirme que falha**:

```bash
bunx vitest run src/modules/leads/routes.test.ts
```

Esperado: **FAIL** (rotas de leads inexistentes).

## 5. Seu desafio (GREEN)

1. **error-handler**: adicione `LeadNotFoundError → 404` (antes do genérico).
2. **`ServerDeps`** ganha `leads`; em `buildServer`, chame `leadsRoutes(app, deps)`; em
   `build-server.test.ts`, inclua um `FakeLeadStore` no `fakeDeps()`.
3. **`leads/schema.ts`** + **`leads/routes.ts`**: implemente as 6 rotas. Use `getLeadOr404` (do
   service) onde precisar do 404; valide o body com Zod (400 em falha).
4. **`estimates/schema.ts`**: troque para exigir `leadId` + crie `estimateUpdateSchema`. Ajuste o `PUT`
   das rotas de estimate para usar `estimateUpdateSchema`.
5. **`estimates/routes.test.ts`**: crie um lead antes e passe `leadId` no payload do `POST`; o `PUT`
   manda só `{ input }`.
6. **`src/server.ts`**: monte `new LeadRepository(db)` e passe no `buildServer`.

**Dicas:**

- `app.patch<{ Params: { id: string } }>("/api/leads/:id/stage", ...)` para tipar o param.
- O `z.enum(LEAD_STAGES as [string, ...string[]])` aceita a lista como tupla; o `parsed.data.stage`
  sai como `string` — faça `as LeadStage` ao passar pro service.
- Na rota `/:id/estimates`, chame `getLeadOr404` **antes** de `listByLead` (404 se o lead não existe).

```bash
bunx vitest run src/modules src/infra/http
```

Esperado: **PASS** (leads + estimates + público).

## 6. Refactor & boas práticas

- **Verbo certo, rota pequena.** `PATCH /stage` faz uma coisa. Resista à tentação de um `PUT` gigante
  que aceita tudo.
- **Propague a mudança de contrato.** Quando o `POST /estimates` mudou, os testes da Fase 2 quebraram —
  conserte-os, não os ignore. O verde de novo é a prova de que a mudança está consistente.
- **Composition root único.** Só o `src/server.ts` conhece os repositories concretos. Rotas e services
  falam com interfaces.

```bash
git add src/infra/http src/modules/leads src/modules/estimates src/server.ts
git commit -m "feat(lead): HTTP routes, estimate requires leadId, server wiring"
```

## 7. Checklist de conclusão

- [ ] As 6 rotas de leads funcionam; `PATCH /stage` move e valida (400 em stage inválido, 404 em lead inexistente).
- [ ] `POST /api/estimates` exige `leadId` (400 sem, 404 se não existe) e deriva o `customer` do lead.
- [ ] `GET /api/leads/:id/estimates` lista por relação.
- [ ] `ServerDeps`/`fakeDeps` incluem `leads`; `src/server.ts` monta o `LeadRepository`.
- [ ] error-handler mapeia `LeadNotFoundError` → 404; testes da Fase 2 atualizados e verdes.

## 8. Para se aprofundar

- **PATCH vs PUT vs POST:** semântica de cada verbo; idempotência.
- **Mudança de contrato de API:** versionamento, *deprecation*, como evoluir sem quebrar clientes.
- **Composition root / Inversão de Controle:** montar o grafo de dependências num único lugar.
- **Validação na borda com Zod:** `z.enum`, refine, e como derivar tipos do schema.

---

Pronto? Vá para **`17-frontend-kanban.md`** — o board com drag-and-drop e a estimate vinculada ao lead.
