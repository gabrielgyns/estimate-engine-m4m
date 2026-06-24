# 06 — HTTP API (Fastify, Zod, rotas e camadas)

> **Como usar este guia:** continuação do curso prático. Eu **explico o porquê**, te dou as
> **assinaturas** (models), a **interface**, os **schemas Zod** e os **testes (TDD)** prontos — mas
> **você escreve a implementação**. A resposta existe no plano
> (`docs/plans/2026-06-22-fase-1-calculadora.md`, Task 8), mas use-o só como *gabarito* quando travar
> de verdade. Você aprende escrevendo, não lendo.

Pré-requisito: ter terminado os guias **01–05** (engine `calculate` com `PricingError`, e o
`ConfigStore`/`PricingConfigRepository`).

---

## 1. Objetivo

Expor a engine e a config por uma API HTTP **fina e em camadas**, usando **Fastify** e validação
com **Zod**. Ao final você vai ter:

- Um `buildServer(store: ConfigStore): FastifyInstance` com três rotas.
- Validação na **fronteira** com Zod (`safeParse` → 400 em erro).
- Mapeamento de **erro de domínio** (`PricingError`) → **HTTP 400**.
- CORS habilitado para o frontend em `:5173`.
- O `index.ts` que faz o *wiring* (createDb → repo → buildServer → listen).
- Testes de handler com `app.inject()` — HTTP testado sem subir servidor real.

## 2. Conceitos

### 2.1 Arquitetura em camadas: handler fino → store → engine

A regra de ouro de um handler HTTP saudável: **ele é fino**. Um handler só faz três coisas:

1. **Valida** a entrada (Zod) — rejeita lixo com 400 antes de qualquer lógica.
2. **Chama** quem sabe fazer o trabalho (o `store` para ler/gravar config; a engine `calculate`
   para o cálculo).
3. **Serializa** a resposta (JSON) e escolhe o status code.

Toda a *lógica de negócio* fica fora do handler — na engine pura (guia 03/04) e no repository (guia
05). O handler é só o "porteiro HTTP". Em camadas:

```
HTTP (Fastify + Zod)  →  store (ConfigStore)  →  engine (calculate, puro)
```

Por que isso importa: a engine permanece **testável sem HTTP**, o store **testável sem HTTP**, e o
handler vira tão burro que quase não precisa de teste — e o pouco que precisa, testamos com
`inject()` (seção 6).

### 2.2 Fastify — instância, rotas, plugins, CORS

**Fastify** é o framework HTTP do backend. Conceitos que você vai usar:

- **Instância** — `Fastify({ logger: true })` cria o app. É o objeto onde você registra rotas e
  plugins, e que no fim "escuta" numa porta (`app.listen(...)`).
- **Rotas** — `app.post(path, handler)`, `app.get(...)`, `app.put(...)`. O handler recebe
  `(request, reply)` e retorna o corpo da resposta (ou usa `reply` para setar status).
- **Plugins via `register`** — funcionalidade transversal entra como plugin. CORS é um plugin.
- **CORS** (`@fastify/cors`) — o navegador bloqueia, por padrão, requisições de uma origem
  (`http://localhost:5173`, o Vite do front) para outra (`http://localhost:8080`, a API). CORS é o
  mecanismo pelo qual a API **autoriza** explicitamente essa origem. Sem isso, o front não consegue
  chamar o back em desenvolvimento.

A assinatura que você vai implementar:

```ts
export function buildServer(store: ConfigStore): FastifyInstance;
```

Repare: `buildServer` recebe um `ConfigStore` (a *interface*, não o repo concreto). Isso é o que
permite, nos testes, passar um `FakeStore`. As três rotas:

| Método | Rota | Função |
|--------|------|--------|
| `POST` | `/api/quotes/calculate` | Stateless. `QuoteInput` → `QuoteBreakdown`. Preview ao vivo. |
| `GET`  | `/api/pricing-config`   | Lê a config atual (inclui catálogo de add-ons). |
| `PUT`  | `/api/pricing-config`   | Valida e grava a config + catálogo (admin). |

### 2.3 Validação na fronteira com Zod — as duas camadas (de novo)

No guia 04 você viu que há **duas camadas de validação**:

1. **Fronteira HTTP (Zod)** — valida *shape*, tipos, números não-negativos, `quantity >= 1` e
   pertinência aos enums. Acontece **aqui**, antes de chegar na engine. Rejeita com **400**.
2. **Domínio (engine)** — a engine não confia no chamador e lança `PricingError` para invariantes
   que dependem dos *dados* (ex.: add-on que não existe no catálogo).

Por que duas? A Zod protege contra *malformação* genérica (campo faltando, string onde devia ser
número). A engine protege contra *violações de regra de domínio* que a Zod não tem como conhecer
(ela não sabe quais add-ons existem na config). Defesa em profundidade.

Os schemas Zod (declarativos — são os "models" de validação, mostrados na íntegra):

`backend/src/http/schemas.ts`:

```ts
import { z } from "zod";

export const serviceTypeSchema = z.enum(["deep_clean", "recurring", "move_in_out"]);
export const frequencySchema = z.enum(["one_time", "weekly", "bi_weekly", "monthly"]);

export const quoteInputSchema = z.object({
  sqft: z.number().int().nonnegative(),
  bedrooms: z.number().int().nonnegative(),
  bathrooms: z.number().int().nonnegative(),
  pets: z.number().int().nonnegative(),
  service: serviceTypeSchema,
  frequency: frequencySchema,
  addOns: z.array(z.object({ addOnId: z.string(), quantity: z.number().int().min(1) })).default([]),
  manualDiscount: z.number().int().nonnegative().default(0),
});

export const addOnSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().int().nonnegative(),
});

export const pricingConfigSchema = z.object({
  basePrice: z.number().int().nonnegative(),
  perSqft: z.number().int().nonnegative(),
  perBedroom: z.number().int().nonnegative(),
  perBathroom: z.number().int().nonnegative(),
  perPet: z.number().int().nonnegative(),
  serviceMultipliers: z.record(serviceTypeSchema, z.number().nonnegative()),
  frequencyDiscounts: z.record(frequencySchema, z.number().min(0).max(1)),
  minimumPrice: z.number().int().nonnegative(),
  addOns: z.array(addOnSchema),
});
```

O padrão de uso no handler é **`safeParse`**: ele não lança exceção; devolve
`{ success: true, data }` ou `{ success: false, error }`. Você checa `parsed.success`; se for
`false`, responde **400** com a mensagem de erro. Se for `true`, segue com `parsed.data` (já tipado).

> **Por que `safeParse` e não `parse`?** `parse` lança em erro; `safeParse` te dá um resultado que
> você trata com um `if`. Em um handler, lidar com o erro de validação como fluxo normal (400) é
> mais limpo do que capturar exceção.

### 2.4 Mapeamento de erro de domínio → HTTP

Depois da validação Zod, o handler de `/calculate` chama `calculate(...)`. A engine pode lançar uma
`PricingError` (ex.: `UnknownAddOnError`). O handler precisa **traduzir** isso para HTTP:

- Embrulhe a chamada de `calculate` em `try/catch`.
- No `catch`, se `err instanceof PricingError` → responda **400** com `err.message`.
- Se for **qualquer outro erro** (bug inesperado) → **re-lance** (`throw err`). Isso vira um 500, e é
  o comportamento certo: um erro não previsto não deve virar silenciosamente um 400.

O fluxo conceitual do `POST /calculate`: `safeParse` → (400 se inválido) → `store.get()` para pegar
a config → `try { return calculate(data, config) } catch (PricingError) → 400`. Você vai escrever
esse corpo (seção 5) — aqui descrevo o fluxo, não colo o handler.

## 3. Models (o que você vai escrever)

### 3.1 A interface `ConfigStore` (do guia 05 — o contrato consumido aqui)

```ts
export interface ConfigStore {
  get(): Promise<PricingConfig>;
  save(config: PricingConfig): Promise<void>;
}
```

`buildServer` depende disso — **não** do `PricingConfigRepository` concreto. É o que torna os testes
de handler possíveis sem banco.

### 3.2 A assinatura de `buildServer` (SEM corpo — é o seu desafio)

`backend/src/http/server.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { calculate } from "../pricing/calculate.js";
import { PricingError } from "../pricing/errors.js";
import type { ConfigStore } from "../config/repository.js";
import { quoteInputSchema, pricingConfigSchema } from "./schemas.js";

export function buildServer(store: ConfigStore): FastifyInstance {
  const app = Fastify({ logger: true });

  // TODO (você implementa — seção 5):
  //  - registrar CORS para http://localhost:5173
  //  - POST /api/quotes/calculate  (safeParse → store.get → try/catch PricingError)
  //  - GET  /api/pricing-config
  //  - PUT  /api/pricing-config     (safeParse → store.save)

  return app;
}
```

### 3.3 O `index.ts` (SEM corpo — o wiring é seu desafio)

`backend/src/index.ts` faz o *wiring* de produção: lê `DATABASE_URL`/`PORT`, cria o `Db` com
`createDb`, instancia o `PricingConfigRepository`, passa para `buildServer`, e chama `app.listen`.
Você implementa na seção 5.4 — aqui só descrevo a responsabilidade.

## 4. Instalar as dependências

```bash
cd ~/Dev/estimate-engine/backend
npm install fastify @fastify/cors zod
```

## 5. Seu desafio (GREEN)

### 5.1 Registrar CORS

Use o plugin: `app.register(cors, { origin: "http://localhost:5173" })`. Faça isso **antes** de
declarar as rotas. Sem isso, o navegador bloqueia as chamadas do front em dev.

### 5.2 `POST /api/quotes/calculate`

Fluxo do handler (você escreve o corpo):

1. `quoteInputSchema.safeParse(request.body)`. Se `!parsed.success` → `reply.status(400).send({ error: ... })`.
2. `const config = await store.get()`.
3. `try { return calculate(parsed.data, config) }`.
4. `catch (err)`: se `err instanceof PricingError` → `reply.status(400)...`; senão `throw err`.

Retornar um objeto de um handler Fastify já serializa como JSON com status 200 — não precisa setar
status no caminho feliz.

### 5.3 `GET` e `PUT /api/pricing-config`

- **GET** — o mais simples: retorne `store.get()`. Uma linha.
- **PUT** — `pricingConfigSchema.safeParse(request.body)`; se inválido → 400; senão
  `await store.save(parsed.data)` e retorne `parsed.data` (eco da config salva).

### 5.4 `index.ts` — o wiring de produção

Responsabilidades (você escreve):

1. Ler `process.env.DATABASE_URL`; se ausente, **falhe cedo** com erro claro (não suba sem banco).
2. Ler `process.env.PORT` (default `8080`).
3. `const db = createDb(url)` → `const repo = new PricingConfigRepository(db)` →
   `const app = buildServer(repo)`.
4. `app.listen({ port })` e logar que está ouvindo.

Note como o `index.ts` é o **único** lugar que conhece *todas* as peças ao mesmo tempo — é onde a
injeção de dependência acontece de verdade (o repo real entra no `buildServer`).

## 6. Testes (RED) — handler com `app.inject()`

`backend/src/http/server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";
import { defaultConfig } from "../pricing/config.js";
import type { ConfigStore } from "../config/repository.js";
import type { PricingConfig } from "../pricing/types.js";

class FakeStore implements ConfigStore {
  config: PricingConfig = defaultConfig();
  async get() { return this.config; }
  async save(c: PricingConfig) { this.config = c; }
}

describe("POST /api/quotes/calculate", () => {
  it("golden case retorna total 19000", async () => {
    const app = buildServer(new FakeStore());
    const res = await app.inject({
      method: "POST",
      url: "/api/quotes/calculate",
      payload: { sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0, service: "deep_clean", frequency: "one_time", addOns: [], manualDiscount: 0 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(19000);
  });

  it("input inválido retorna 400", async () => {
    const app = buildServer(new FakeStore());
    const res = await app.inject({
      method: "POST",
      url: "/api/quotes/calculate",
      payload: { sqft: -5, bedrooms: 0, bathrooms: 0, pets: 0, service: "deep_clean", frequency: "one_time" },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

Dois pontos centrais deste teste:

- **`app.inject(...)`** — Fastify tem um modo de injeção que **executa a requisição HTTP inteira em
  memória**, sem abrir socket nem subir servidor real. Você passa `method`, `url`, `payload`, e
  recebe `statusCode`, `res.json()` etc. É rápido, determinístico e não disputa portas. (Se você vem
  de Go, é o paralelo direto do `httptest` — testa o handler de ponta a ponta sem rede de verdade.)
- **`FakeStore`** — implementa a interface `ConfigStore` em memória. Como `buildServer` depende da
  *interface* (e não do repo concreto com Drizzle), o teste injeta esse dublê e roda **sem Postgres**.
  É exatamente o pagamento do desenho em camadas: o handler é testável isoladamente. (Este é código
  de **teste**, por isso o mostro inteiro — diferente dos corpos de produção.)

### Rodando os testes

```bash
cd ~/Dev/estimate-engine/backend
npx vitest run src/http/server.test.ts
```

Esperado **antes** de implementar `buildServer`: FAIL (`Cannot find module './server.js'`).
Esperado **depois**: PASS (golden case 200/19000 e input inválido 400).

E a suíte inteira do backend:

```bash
npx vitest run
```

### Smoke test manual (com Postgres no ar)

Suba o servidor e bata na rota com `curl`:

```bash
cd ~/Dev/estimate-engine/backend
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine'
npm run dev &
sleep 2
curl -s -X POST localhost:8080/api/quotes/calculate -H 'Content-Type: application/json' \
  -d '{"sqft":1000,"bedrooms":2,"bathrooms":1,"pets":0,"service":"deep_clean","frequency":"one_time","addOns":[],"manualDiscount":0}'
kill %1
```

Esperado: um JSON contendo `"total":19000`. Se vier isso, a stack inteira (HTTP → store → engine)
está de pé.

## 7. Refactor & boas práticas

- **Handler fino, sempre.** Se um handler começar a ter `if`s de regra de negócio, mova para a
  engine. O handler só valida/chama/serializa.
- **Re-lance o que não é `PricingError`.** Não transforme todo erro em 400 — só os de domínio. Bugs
  inesperados devem virar 500 e aparecer no log.
- **Schemas Zod são a fonte da forma na fronteira.** Mantenha-os alinhados aos tipos do domínio
  (mesmos campos, mesmos enums). Divergência aqui vira bug sutil.
- **`buildServer` recebe a interface, não o concreto.** Já está assim — não "otimize" passando o
  repo real, ou você perde a testabilidade.
- **CORS restrito à origem do front.** Em dev, `http://localhost:5173`. Não use `origin: true`
  (qualquer origem) sem necessidade.

## 8. Checklist de conclusão

- [ ] `schemas.ts` com `quoteInputSchema` e `pricingConfigSchema` existe.
- [ ] `buildServer(store)` registra CORS e as 3 rotas; retorna a `FastifyInstance`.
- [ ] `POST /calculate` valida com Zod (400) e mapeia `PricingError` → 400.
- [ ] `GET`/`PUT /pricing-config` leem e gravam via `store`.
- [ ] `index.ts` faz o wiring (createDb → repo → buildServer → listen) e falha cedo sem `DATABASE_URL`.
- [ ] `npx vitest run src/http/server.test.ts` passa (200/19000 e 400).
- [ ] `npx vitest run` (suíte inteira) passa.
- [ ] O `curl` do smoke test retorna `"total":19000`.

## 9. Para se aprofundar

- **Arquitetura em camadas / handler fino** — por que a lógica de negócio não vive no transporte.
- **Fastify** — ciclo de vida, plugins, `register`, e o modo `inject` para testes.
- **CORS** — preflight, `Access-Control-Allow-Origin`, por que o navegador exige.
- **Zod** — `safeParse` vs `parse`, `z.infer` para derivar tipos a partir do schema.
- **Mapeamento erro de domínio → HTTP** — error boundaries, quando 400 vs 500, e por que re-lançar o
  inesperado.

---

Próximo: **`07-frontend-calculadora.md`** — React + TanStack Query consumindo esta API.
