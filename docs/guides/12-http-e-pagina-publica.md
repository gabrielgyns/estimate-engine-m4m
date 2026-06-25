# Módulo 12 — HTTP: service, CRUD admin e a página pública por token

> **Como usar este guia:** eu **explico o porquê**, te dou os **models** e os **testes (RED)**.
> **Você escreve a implementação.** Gabarito: `docs/plans/2026-06-25-fase-2-estimates.md`, Tasks 4–8.
>
> **Convenção:** Bun, imports **sem extensão**, raiz `src/`. Testes com `bunx vitest run <path>`.

---

## 1. Objetivo

- Um **service** que compõe a engine de preços (Fase 1) + a máquina de estado (módulo 10) +
  o repository (módulo 11) — a lógica de aplicação, testável com *fakes*, sem HTTP.
- Um **error-handler central** que mapeia erros de domínio para status HTTP.
- Um **`buildServer(deps)`** testável via `app.inject` (sem subir porta).
- As **rotas admin** (CRUD + send) e as **rotas públicas por token** (view + accept/decline).

## 2. Conceitos

### 2.1 Por que uma camada `service` (e não lógica nas rotas)

A rota HTTP deveria fazer só três coisas: **validar** a entrada, **chamar** a regra, **formatar** a
resposta. Toda a orquestração — "buscar a config, rodar `calculate`, gerar token, gravar" — vive num
**service** (`src/modules/estimates/service.ts`). Vantagens:

- **Testa sem HTTP.** O service recebe *fakes* (store + config em memória) e você exercita todas as
  regras (criar, editar, congelar, aceitar) com testes rápidos e diretos.
- **Reutilizável.** A mesma função `createEstimate` poderia ser chamada por uma rota, um job, um CLI.

O service recebe suas dependências num objeto `deps = { estimates, config }` (injeção). Ele **não**
importa o repository concreto — fala com as interfaces `EstimateStore` e `ConfigStore`.

### 2.2 O backend é a fonte da verdade do cálculo

`createEstimate` e `updateEstimate` **rodam `calculate` no servidor** com a `PricingConfig` atual e
gravam o `breakdown`. O frontend **nunca** manda um preço — manda só o `input` (e o `customer`). Isso
fecha a porta para um cliente forjar um total adulterando o request.

### 2.3 Congelar na edição: reusar a máquina de estado

Editar (`PUT`) só é permitido em `draft`. Em vez de um `if (status !== "draft") throw`, reusamos a
**máquina de estado**: como nenhuma transição aponta para `draft`, chamar `assertTransition(status,
"draft")` lança `EstimateStatusError` para qualquer status não-draft. Uma regra, uma fonte da verdade.

> Há quem prefira o `if` explícito por legibilidade — é uma escolha defensável. Aqui optamos por
> centralizar tudo na máquina de estado; o importante é **não** duplicar a regra.

### 2.4 Token como credencial: a superfície pública mínima

A página pública não tem login. A credencial é o **`publicToken`** — aleatório, inguessável
(`randomBytes(24).toString("base64url")`). Quem tem o link, vê a estimate. Por isso:

- A rota pública **nunca** expõe o `id` interno nem o `input` cru nem a `PricingConfig`. Ela devolve
  uma **`PublicEstimateView`** enxuta (`number`, `customer`, `breakdown`, `status`).
- Uma estimate em `draft` **não é pública** (`getPublicView` lança `NotFound` se status é `draft` ou
  o token não existe). O cliente só vê depois do `send`.

Esse princípio tem nome: **minimizar a superfície de exposição**. Você devolve o mínimo necessário.

### 2.5 `buildServer(deps)`: app montável para teste

Em vez de um `src/server.ts` que cria tudo e já dá `listen` (impossível de testar limpo),
extraímos um **factory** `buildServer(deps)` que monta a instância Fastify (cors + error-handler +
rotas) e **retorna sem escutar porta**. Nos testes, `app.inject({ method, url, payload })` simula um
request **em memória** — rápido, sem rede. O `src/server.ts` vira só: montar repositories reais,
chamar `buildServer`, e `listen`.

### 2.6 Error-handler central: erro de domínio → status HTTP

Um único `app.setErrorHandler` traduz exceções:

```
EstimateNotFoundError → 404
EstimateStatusError   → 409   (conflito com o estado atual)
PricingError          → 400   (input viola invariante da engine)
qualquer outro        → 500   (e loga)
```

Assim as rotas podem simplesmente **lançar** (`throw new EstimateNotFoundError()`) e deixar o handler
formatar — sem `try/catch` repetido em cada rota.

## 3. Models

```ts
// src/modules/estimates/token.ts
export function generatePublicToken(): string; // randomBytes(24).toString("base64url")
```

```ts
// src/modules/estimates/service.ts — assinaturas (corpos seus)
import type { ConfigStore } from "../pricing-config/repository";
import type { EstimateStore } from "./repository";
import type { CustomerInfo, Estimate, PublicEstimateView } from "../../domain/estimate/types";
import type { QuoteInput } from "../../domain/pricing/types";

export type EstimateDeps = { estimates: EstimateStore; config: ConfigStore };
export type EstimateInputDto = { customer: CustomerInfo; input: QuoteInput };

export function createEstimate(deps: EstimateDeps, dto: EstimateInputDto): Promise<Estimate>;
export function updateEstimate(deps: EstimateDeps, id: string, dto: EstimateInputDto): Promise<Estimate>;
export function sendEstimate(deps: EstimateDeps, id: string): Promise<Estimate>;
export function acceptByToken(deps: EstimateDeps, token: string): Promise<Estimate>;
export function declineByToken(deps: EstimateDeps, token: string): Promise<Estimate>;
export function getPublicView(deps: EstimateDeps, token: string): Promise<PublicEstimateView>;
```

```ts
// src/modules/estimates/schema.ts — validação na fronteira (Zod). Mostrado por inteiro: é contrato.
import { z } from "zod";
const serviceTypeSchema = z.enum(["deep_clean", "recurring", "move_in_out"]);
const frequencySchema = z.enum(["one_time", "weekly", "bi_weekly", "monthly"]);
export const customerSchema = z.object({
  name: z.string().min(1), email: z.string().email(),
  phone: z.string().min(1), address: z.string().min(1),
});
const quoteInputSchema = z.object({
  sqft: z.number().int().nonnegative(), bedrooms: z.number().int().nonnegative(),
  bathrooms: z.number().int().nonnegative(), pets: z.number().int().nonnegative(),
  service: serviceTypeSchema, frequency: frequencySchema,
  addOns: z.array(z.object({ addOnId: z.string(), quantity: z.number().int().min(1) })).default([]),
  manualDiscount: z.number().int().nonnegative().default(0),
});
export const estimateInputSchema = z.object({ customer: customerSchema, input: quoteInputSchema });
```

```ts
// src/infra/http/error-handler.ts e build-server.ts — assinaturas
export function registerErrorHandler(app: FastifyInstance): void;
export type ServerDeps = { estimates: EstimateStore; config: ConfigStore };
export function buildServer(deps: ServerDeps): FastifyInstance; // registra cors + handler + rotas; NÃO dá listen

// src/modules/estimates/routes.ts e public-routes.ts — assinaturas
export function estimatesRoutes(app: FastifyInstance, deps: ServerDeps): void;       // POST/GET/GET:id/PUT/:id/send
export function publicEstimatesRoutes(app: FastifyInstance, deps: ServerDeps): void; // GET/:token + accept/decline
```

Rotas a expor:

| Método | Rota | Regra |
|--------|------|-------|
| `POST` | `/api/estimates` | cria em `draft` (roda `calculate`) → **201** |
| `GET` | `/api/estimates` | lista summaries |
| `GET` | `/api/estimates/:id` | detalhe; **404** se não existe |
| `PUT` | `/api/estimates/:id` | recalcula; só em `draft` (senão **409**) |
| `POST` | `/api/estimates/:id/send` | `draft → sent` |
| `GET` | `/api/public/estimates/:token` | `PublicEstimateView`; **404** se token inválido ou `draft` |
| `POST` | `/api/public/estimates/:token/accept` | `sent → accepted` (senão **409**) |
| `POST` | `/api/public/estimates/:token/decline` | `sent → declined` (senão **409**) |

## 4. Testes (RED)

O teste-chave é o do **service** (cobre a lógica toda com fakes). Crie um `FakeEstimateStore` (em
memória, implementando `EstimateStore`) e um `FakeConfigStore` (devolve `defaultConfig()`).

`src/modules/estimates/service.test.ts` (trechos essenciais — a versão completa está no plano, Task 4):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { EstimateNotFoundError, EstimateStatusError } from "../../domain/estimate/errors";
import { acceptByToken, createEstimate, getPublicView, sendEstimate, updateEstimate } from "./service";
// ...FakeEstimateStore / FakeConfigStore e o dto do golden case (ver plano)...

describe("estimate service", () => {
  let deps; // { estimates: FakeEstimateStore, config: FakeConfigStore }
  beforeEach(() => { deps = { estimates: new FakeEstimateStore(), config: new FakeConfigStore() }; });

  it("cria em draft com total 19000", async () => {
    const e = await createEstimate(deps, dto);
    expect(e.status).toBe("draft");
    expect(e.breakdown.total).toBe(19000);
    expect(e.publicToken).toBeTruthy();
  });

  it("edita em draft e recalcula (move_in_out -> 34200)", async () => {
    const e = await createEstimate(deps, dto);
    const u = await updateEstimate(deps, e.id, { ...dto, input: { ...dto.input, service: "move_in_out" } });
    expect(u.breakdown.total).toBe(34200);
  });

  it("bloqueia editar depois de send (409 no HTTP)", async () => {
    const e = await createEstimate(deps, dto);
    await sendEstimate(deps, e.id);
    await expect(updateEstimate(deps, e.id, dto)).rejects.toThrow(EstimateStatusError);
  });

  it("accept pela token só vale depois de sent", async () => {
    const e = await createEstimate(deps, dto);
    await expect(acceptByToken(deps, e.publicToken)).rejects.toThrow(EstimateStatusError); // ainda draft
    await sendEstimate(deps, e.id);
    expect((await acceptByToken(deps, e.publicToken)).status).toBe("accepted");
  });

  it("getPublicView esconde draft e token inválido", async () => {
    const e = await createEstimate(deps, dto);
    await expect(getPublicView(deps, e.publicToken)).rejects.toThrow(EstimateNotFoundError); // draft
    await expect(getPublicView(deps, "nope")).rejects.toThrow(EstimateNotFoundError);
  });
});
```

Depois, os testes de **HTTP** com `app.inject` (criar→201, customer inválido→400, PUT após
send→409, GET inexistente→404, GET público de draft→404, accept duplo→409). Versão completa:
plano, Tasks 6 e 7.

Rode e **confirme que falha**:

```bash
bunx vitest run src/modules/estimates/service.test.ts
```

Esperado: **FAIL** (`Cannot find module './service'`).

## 5. Seu desafio (GREEN)

Na ordem do plano:

1. **`token.ts`** — `generatePublicToken` com `node:crypto` (`randomBytes(24).toString("base64url")`).
2. **`service.ts`** — implemente as 6 funções:
   - `createEstimate`: pega `config.get()`, roda `calculate(dto.input, config)`, gera token, `estimates.create(...)`.
   - `updateEstimate`: busca (ou `NotFound`); se não-`draft`, `assertTransition(status, "draft")`
     (lança); recalcula; `estimates.update(...)`.
   - `sendEstimate`/`acceptByToken`/`declineByToken`: busque, `assertTransition` para o destino,
     `update` com o timestamp certo (`sentAt` ou `decidedAt`).
   - `getPublicView`: busca por token; se `null` **ou** `draft` → `NotFound`; devolve a view enxuta.
3. **`error-handler.ts`** — `setErrorHandler` mapeando os 4 casos da seção 2.6.
4. **`build-server.ts`** — monta Fastify, registra cors + handler + `/ping`, depois `estimatesRoutes`
   e `publicEstimatesRoutes`. Retorna **sem** `listen`.
5. **`schema.ts`** + **`routes.ts`** + **`public-routes.ts`** — valide com Zod (400 em falha) e
   delegue ao service; deixe os erros de domínio subirem para o handler.
6. **`src/server.ts`** — monte `new EstimateRepository(db)` + `new PricingConfigRepository(db)`,
   chame `buildServer(...)` e `listen`.

**Dicas:**

- Uma função interna `getOr404(store, id)` evita repetir o "busca ou lança NotFound".
- `transition(deps, id, to, stamp)` interna unifica `send/accept/decline` (variam só o destino e o
  campo de timestamp). DRY.
- Na rota, valide com `schema.safeParse(request.body)`; em `!success`, `reply.status(400)`.
- Para tipar params no Fastify: `app.get<{ Params: { id: string } }>("/api/estimates/:id", ...)`.

```bash
bunx vitest run src/modules/estimates src/infra/http
```

Esperado: **PASS**. (Os testes de integração de repository continuam exigindo `DATABASE_URL`.)

## 6. Refactor & boas práticas

- **Rota fina, service gordo.** Se uma rota tem mais que validar→chamar→responder, mova a lógica
  para o service.
- **Nunca confie no cliente.** O preço sempre vem de `calculate` no servidor. O total no request é
  ignorado (nem existe no schema de entrada).
- **Superfície pública mínima.** Releia `getPublicView`: ela monta um objeto novo, não devolve a
  entidade inteira. Vazar o `id` ou a `config` seria um bug de segurança/privacidade.
- **Erros sobem.** Deixe o handler central traduzir; não espalhe `try/catch` nas rotas.

```bash
git add src/modules/estimates src/infra/http src/server.ts
git commit -m "feat(estimate): service, error-handler, buildServer, admin + public routes"
```

## 7. Checklist de conclusão

- [ ] `service.test.ts` rodou **vermelho** e agora está **verde**.
- [ ] `createEstimate`/`updateEstimate` rodam `calculate` no servidor (preço nunca vem do cliente).
- [ ] Editar fora de `draft` → `EstimateStatusError` (→ **409**).
- [ ] `getPublicView` esconde `draft` e token inválido (→ **404**) e devolve a view enxuta (sem `id`/`input`).
- [ ] `accept`/`decline` só valem em `sent`; repetir → **409**.
- [ ] `buildServer` testável por `app.inject`; `src/server.ts` só monta deps + `listen`.
- [ ] Error-handler mapeia 404/409/400/500.

## 8. Para se aprofundar

- **Fastify:** `inject` (light-my-request), `setErrorHandler`, tipagem de `Params`/`Body`,
  encapsulamento por plugin.
- **Validação na fronteira:** por que validar no *edge* (Zod) e ainda ter invariantes no domínio
  (defesa em profundidade).
- **Tokens não-adivinháveis:** entropia, `crypto.randomBytes`, `base64url`; por que `Math.random`
  **não** serve para credenciais.
- **REST e status codes:** 201 (created), 404, 409 (conflict), 422 (unprocessable) — quando usar cada.
- **Camada de serviço / use cases:** Clean Architecture e o papel da orquestração entre domínio e infra.

---

Pronto? Vá para **`13-frontend-estimates-e-router.md`** — react-router, lista/detalhe/criação e a página pública.
