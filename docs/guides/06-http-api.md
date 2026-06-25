# 06 — HTTP API (Fastify, Zod, rotas por módulo e plugins de infra)

> **Como usar este guia:** continuação do curso prático. Eu **explico o porquê**, te dou as
> **assinaturas** (models), as **interfaces**, os **schemas Zod** e os **testes (TDD)** prontos — mas
> **você escreve a implementação**. A resposta existe no plano
> (`docs/plans/2026-06-22-fase-1-calculadora.md`, Task 8), mas use-o só como *gabarito* quando travar
> de verdade. Você aprende escrevendo, não lendo.

Pré-requisito: ter terminado os guias **01–05** (engine `calculate` com `PricingError`, e o
`ConfigStore`/`PricingConfigRepository`).

---

## 1. Objetivo

Expor a engine e a config por uma API HTTP **fina e em camadas**, usando **Fastify** e validação
com **Zod** — mas agora com a estrutura **por papel** que o guia 09 desenha: rotas que vivem **dentro
de cada módulo** e encanamento (CORS, error-handler, o server) em `infra/`. Nada de um `server.ts`
gigante com tudo dentro. Ao final você vai ter:

- Rotas **por feature**: `modules/quotes/routes.ts` e `modules/pricing-config/routes.ts`, cada uma
  dona das suas rotas e do seu schema Zod.
- **Plugins de infra** em `infra/http/plugins/`: `registerCors(app)` e `registerErrorHandler(app)`.
- Um `buildServer(store: ConfigStore): FastifyInstance` em `infra/http/server.ts` que **compõe**
  plugins + rotas dos módulos.
- Validação na **fronteira** com Zod (`safeParse` → 400 em erro).
- Mapeamento de **erro de domínio** (`PricingError`) → **HTTP 400** num **lugar só** (o
  error-handler), em vez de `try/catch` repetido em cada rota.
- CORS habilitado para o frontend em `:5173`.
- O `index.ts` que faz o *wiring* (createDb → repo → buildServer → listen).
- Testes de handler com `app.inject()` — HTTP testado sem subir servidor real, usando um `FakeStore`.

> Onde cada arquivo mora segue o guia 09 (estrutura por papel: `domain/` / `modules/` / `infra/`).
> Se algum caminho aqui te surpreender, releia o `09-organizacao-do-projeto.md` — este guia é a
> aplicação concreta daquela estrutura à camada HTTP.

## 2. Conceitos

### 2.1 Arquitetura em camadas: handler fino → store → engine

A regra de ouro de um handler HTTP saudável: **ele é fino**. Um handler só faz três coisas:

1. **Valida** a entrada (Zod) — rejeita lixo com 400 antes de qualquer lógica.
2. **Chama** quem sabe fazer o trabalho (o `store` para ler/gravar config; a engine `calculate`
   para o cálculo).
3. **Serializa** a resposta (JSON) e escolhe o status code.

Toda a *lógica de negócio* fica fora do handler — na engine pura (guias 03/04) e no repository (guia
05). O handler é só o "porteiro HTTP". Em camadas:

```
HTTP (módulo: routes + Zod)  →  store (ConfigStore)  →  engine (calculate, puro)
```

Por que isso importa: a engine permanece **testável sem HTTP**, o store **testável sem HTTP**, e o
handler vira tão burro que quase não precisa de teste — e o pouco que precisa, testamos com
`inject()` (seção 6). Repare na direção da seta: ela é a mesma do guia 09
(`index → infra → modules → domain`). A rota (em `modules/`) usa o domínio; nunca o contrário.

### 2.2 Por que rotas POR MÓDULO (e não um `server.ts` gigante)

No guia 09 você viu as três formas de organizar e por que escolhemos **feature-first** (Opção B,
*package by feature*): "coisas que mudam juntas ficam juntas". A camada HTTP segue a mesma regra.

Em vez de um único arquivo onde **todas** as rotas de **todas** as features se acotovelam, cada
módulo é **dono das suas rotas**:

- `modules/quotes/` tem `routes.ts` (as rotas de quotes) + `schema.ts` (o contrato Zod de quotes).
- `modules/pricing-config/` tem `routes.ts` + `schema.ts` + o `repository.ts` (do guia 05).

O `server.ts` (em `infra/http/`) não conhece os detalhes de nenhuma rota — ele só **compõe**: chama
`quotesRoutes(app, store)` e `pricingConfigRoutes(app, store)`. Isso é o que faz a Fase 2 ser "criar
a pasta `modules/estimates/` com seu `routes.ts` e plugá-la no `server.ts`", em vez de "achar onde
enfiar mais 4 handlers num arquivo de 300 linhas". Cada feature é uma fatia vertical; o server é só
o maestro.

Cada módulo exporta uma função no formato `xRoutes(app, store)` — esse é o **idioma de rotas por
módulo** do guia 09. As assinaturas (corpo é seu desafio na seção 5):

```ts
export function quotesRoutes(app: FastifyInstance, store: ConfigStore): void;
export function pricingConfigRoutes(app: FastifyInstance, store: ConfigStore): void;
```

As três rotas, distribuídas entre os dois módulos:

| Módulo | Método | Rota | Função |
|--------|--------|------|--------|
| `quotes` | `POST` | `/api/quotes/calculate` | Stateless. `QuoteInput` → `QuoteBreakdown`. Preview ao vivo. |
| `pricing-config` | `GET`  | `/api/pricing-config`   | Lê a config atual (inclui catálogo de add-ons). |
| `pricing-config` | `PUT`  | `/api/pricing-config`   | Valida e grava a config + catálogo (admin). |

### 2.3 Fastify — instância, rotas, plugins e encapsulamento

**Fastify** é o framework HTTP do backend. Conceitos que você vai usar:

- **Instância** — `Fastify({ logger: true })` cria o app. É o objeto onde você registra rotas e
  plugins, e que no fim "escuta" numa porta (`app.listen(...)`). O `buildServer` cria essa instância,
  compõe tudo e a devolve.
- **Rotas** — `app.post(path, handler)`, `app.get(...)`, `app.put(...)`. O handler recebe
  `(request, reply)` e retorna o corpo da resposta (ou usa `reply` para setar status). No nosso
  desenho, as rotas são declaradas *dentro* das funções `xRoutes(app, store)` de cada módulo.
- **Plugins via `register` e encapsulamento** — funcionalidade transversal entra como plugin. Plugin
  é a **unidade de encapsulamento** do Fastify: o que você registra (hooks, decorators,
  `setErrorHandler`) vale para aquele contexto e os filhos dele. CORS e o error-handler são
  encanamento transversal — por isso moram em `infra/http/plugins/` e são aplicados a `app` inteiro
  no `buildServer`, antes das rotas.
- **CORS** (`@fastify/cors`) — o navegador bloqueia, por padrão, requisições de uma origem
  (`http://localhost:5173`, o Vite do front) para outra (`http://localhost:8080`, a API). CORS é o
  mecanismo pelo qual a API **autoriza** explicitamente essa origem. Sem isso, o front não consegue
  chamar o back em desenvolvimento.

Mantemos os plugins como **funções pequenas** — `registerCors(app)` e `registerErrorHandler(app)` —
em vez de plugins encapsulados com `fastify-plugin`. Para o tamanho da Fase 1, isso basta e deixa o
fluxo explícito (idioma do guia 09: "injeção explícita > mágica por enquanto").

### 2.4 Validação na fronteira com Zod — as duas camadas (de novo)

No guia 04 você viu que há **duas camadas de validação**:

1. **Fronteira HTTP (Zod)** — valida *shape*, tipos, números não-negativos, `quantity >= 1` e
   pertinência aos enums. Acontece **aqui**, na rota do módulo, antes de chegar na engine. Rejeita
   com **400**.
2. **Domínio (engine)** — a engine não confia no chamador e lança `PricingError` para invariantes
   que dependem dos *dados* (ex.: add-on que não existe no catálogo).

Por que duas? A Zod protege contra *malformação* genérica (campo faltando, string onde devia ser
número). A engine protege contra *violações de regra de domínio* que a Zod não tem como conhecer
(ela não sabe quais add-ons existem na config). Defesa em profundidade — e, como dito no guia 04, a
engine pode ser chamada por outros caminhos além do HTTP (um seed, um job, a Fase 2), então ela
**não pode** depender do Zod ter rodado.

Os schemas Zod são **declarativos** (são os "models" de validação) e cada um mora no **schema do seu
módulo**, ao lado das rotas que o consomem:

`backend/src/modules/quotes/schema.ts`:

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
```

`backend/src/modules/pricing-config/schema.ts`:

```ts
import { z } from "zod";

// Enums espelham o domínio. Pequena duplicação proposital (cada módulo é dono do seu contrato).
const serviceTypeSchema = z.enum(["deep_clean", "recurring", "move_in_out"]);
const frequencySchema = z.enum(["one_time", "weekly", "bi_weekly", "monthly"]);

const addOnSchema = z.object({
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

> **Por que cada módulo tem seu schema?** Porque o schema é o **contrato HTTP daquela rota** e muda
> junto com ela (guia 09, seção 5). Os enums aparecem nos dois módulos — é uma duplicação pequena e
> proposital: cada feature é dona do seu contrato, sem acoplar um módulo ao schema do outro. Use
> `z.infer<typeof quoteInputSchema>` se quiser derivar o DTO sem repetir o tipo.

O padrão de uso no handler é **`safeParse`**: ele não lança exceção; devolve
`{ success: true, data }` ou `{ success: false, error }`. Você checa `parsed.success`; se for
`false`, responde **400** com a mensagem de erro. Se for `true`, segue com `parsed.data` (já tipado).

> **Por que `safeParse` e não `parse`?** `parse` lança em erro; `safeParse` te dá um resultado que
> você trata com um `if`. Em um handler, lidar com o erro de validação como fluxo normal (400) é
> mais limpo do que capturar exceção.

### 2.5 Mapeamento de erro de domínio → HTTP, centralizado num plugin

Depois da validação Zod, o handler de `/calculate` chama `calculate(...)`. A engine pode lançar uma
`PricingError` (ex.: `UnknownAddOnError`). Isso precisa virar **HTTP 400** — mas **onde**?

A tentação é embrulhar cada `calculate(...)` num `try/catch` dentro da rota. O problema: isso se
**repete** em toda rota que toca o domínio, e cada cópia pode divergir (uma esquece de re-lançar o
erro inesperado, outra usa outro status). É o tipo de duplicação que o guia 09 manda centralizar.

A solução idiomática do Fastify é **`app.setErrorHandler`**: um único handler de erro, registrado uma
vez, que pega **qualquer** erro lançado por **qualquer** rota. Nós o colocamos num plugin de infra
(`infra/http/plugins/error-handler.ts`), e a regra é simples:

- Se `error instanceof PricingError` → responda **400** com `error.message`.
- Qualquer outro erro (bug inesperado) → logue e responda **500**.

Como `PricingError` é a base comum de toda a família de erros do domínio (guia 04), **uma** checagem
`instanceof PricingError` cobre os cinco subtipos — e qualquer erro de domínio futuro vira 400
automaticamente, sem tocar em rota nenhuma.

**A vantagem em uma frase:** a rota fica livre para apenas *lançar* (ou deixar a engine lançar) o
`PricingError`, e o tratamento HTTP vive num lugar só, consistente. Rota mais limpa, comportamento
uniforme, zero `try/catch` espalhado. As assinaturas dos plugins:

```ts
export function registerCors(app: FastifyInstance): void;
export function registerErrorHandler(app: FastifyInstance): void;
```

## 3. Models (o que você vai escrever)

### 3.1 A interface `ConfigStore` (do guia 05 — o contrato consumido aqui)

```ts
export interface ConfigStore {
  get(): Promise<PricingConfig>;
  save(config: PricingConfig): Promise<void>;
}
```

Ela vive em `modules/pricing-config/repository.ts` (guia 05). Tanto as rotas quanto o `buildServer`
dependem **dessa interface** — **não** do `PricingConfigRepository` concreto. É o que torna os testes
de handler possíveis sem banco (você injeta um `FakeStore`).

### 3.2 A assinatura de `buildServer` (SEM corpo — é o seu desafio)

`buildServer` vive em `backend/src/infra/http/server.ts` e **compõe** a aplicação: cria a instância,
aplica os plugins de infra e registra as rotas de cada módulo.

```ts
import { type FastifyInstance } from "fastify";
// imports dos plugins (infra) e das rotas (modules) ...

export function buildServer(store: ConfigStore): FastifyInstance;
```

Responsabilidades (você escreve o corpo na seção 5.4):

- Criar a instância `Fastify({ logger: true })`.
- Aplicar `registerCors(app)` e `registerErrorHandler(app)` (encanamento, antes das rotas).
- Registrar as rotas dos módulos: `quotesRoutes(app, store)` e `pricingConfigRoutes(app, store)`.
- Retornar a `FastifyInstance`.

Repare: `buildServer` recebe um `ConfigStore` (a *interface*, não o repo concreto) e o **repassa** a
cada módulo de rotas. Isso é o que permite, nos testes, passar um `FakeStore`. O `buildServer` é o
maestro — ele conhece quais plugins e quais módulos existem, mas não os detalhes de nenhum handler.

### 3.3 O `index.ts` (SEM corpo — o wiring é seu desafio)

`backend/src/index.ts` faz o *wiring* de produção: lê `DATABASE_URL`/`PORT`, cria o `Db` com
`createDb` (de `infra/db/client.ts`), instancia o `PricingConfigRepository` (de
`modules/pricing-config/repository.ts`), passa para `buildServer`, e chama `app.listen`. Você
implementa na seção 5.5 — aqui só descrevo a responsabilidade.

## 4. Instalar as dependências

```bash
cd ~/Dev/estimate-engine/backend
npm install fastify @fastify/cors zod
```

## 5. Seu desafio (GREEN)

> A estrutura de arquivos a criar (todos sob `backend/src/`):
> `modules/quotes/schema.ts`, `modules/quotes/routes.ts`,
> `modules/pricing-config/schema.ts`, `modules/pricing-config/routes.ts`,
> `infra/http/plugins/cors.ts`, `infra/http/plugins/error-handler.ts`,
> `infra/http/server.ts`, `index.ts`. Os dois `schema.ts` estão prontos na seção 2.4 — copie-os.
> O resto é seu.

### 5.1 As rotas do módulo `quotes`

Em `modules/quotes/routes.ts`, exporte `quotesRoutes(app, store)`. Dentro dela, declare
`app.post("/api/quotes/calculate", ...)`. Fluxo do handler (você escreve o corpo):

1. `quoteInputSchema.safeParse(request.body)`. Se `!parsed.success` →
   `reply.status(400).send({ error: parsed.error.message })`.
2. `const config = await store.get()`.
3. `return calculate(parsed.data, config)`.

Note o que **não** tem aqui: **nenhum `try/catch`**. Se `calculate` lançar um `PricingError`, deixe-o
**propagar** — o `setErrorHandler` global (seção 5.3) o transforma em 400. A rota só valida shape,
chama e devolve. Retornar um objeto de um handler Fastify já serializa como JSON com status 200 — não
precisa setar status no caminho feliz.

Imports que você vai precisar: `calculate` de `../../domain/pricing/calculate.js`, `quoteInputSchema`
de `./schema.js`, e o tipo `ConfigStore` de `../pricing-config/repository.js`.

### 5.2 As rotas do módulo `pricing-config`

Em `modules/pricing-config/routes.ts`, exporte `pricingConfigRoutes(app, store)` com duas rotas:

- **GET** `/api/pricing-config` — o mais simples: retorne `store.get()`. Uma linha.
- **PUT** `/api/pricing-config` — `pricingConfigSchema.safeParse(request.body)`; se inválido → 400;
  senão `await store.save(parsed.data)` e retorne `parsed.data` (eco da config salva).

Imports: `pricingConfigSchema` de `./schema.js` e o tipo `ConfigStore` de `./repository.js` (mesmo
módulo).

### 5.3 Os plugins de infra (CORS + error-handler)

`infra/http/plugins/cors.ts` — exporte `registerCors(app)`. Dentro, registre o plugin:
`app.register(cors, { origin: "http://localhost:5173" })` (import: `cors` de `@fastify/cors`). Isso
autoriza a origem do Vite; sem ele o navegador bloqueia as chamadas do front em dev.

`infra/http/plugins/error-handler.ts` — exporte `registerErrorHandler(app)`. Dentro, chame
`app.setErrorHandler((error, request, reply) => { ... })`. No corpo (você escreve):

- Se `error instanceof PricingError` → `reply.status(400).send({ error: error.message })`.
- Caso contrário → logue (`app.log.error(error)`) e `reply.status(500).send({ error: "internal server error" })`.

Import: `PricingError` de `../../../domain/pricing/errors.js` (conte os `../`: de
`infra/http/plugins/` até `domain/pricing/` são três níveis acima).

### 5.4 O `server.ts` — compor plugins + módulos

Em `infra/http/server.ts`, escreva `buildServer(store)` (assinatura na seção 3.2). O corpo é
**composição pura**, na ordem: criar a instância → aplicar os dois plugins de infra → registrar as
rotas dos dois módulos → retornar `app`. Lembre que os plugins (encanamento transversal) vêm **antes**
das rotas. Imports: `Fastify` de `fastify`; `registerCors`/`registerErrorHandler` de `./plugins/...`;
`quotesRoutes` de `../../modules/quotes/routes.js`; `pricingConfigRoutes` de
`../../modules/pricing-config/routes.js`; o tipo `ConfigStore` de
`../../modules/pricing-config/repository.js`.

> **Dica:** se você se pegar escrevendo lógica de validação ou de cálculo dentro do `server.ts`,
> parou — isso pertence à rota do módulo ou à engine. O `server.ts` só **liga os fios**.

### 5.5 `index.ts` — o wiring de produção

Responsabilidades (você escreve):

1. Ler `process.env.DATABASE_URL`; se ausente, **falhe cedo** com erro claro (não suba sem banco).
2. Ler `process.env.PORT` (default `8080`).
3. `const db = createDb(url)` → `const repo = new PricingConfigRepository(db)` →
   `const app = buildServer(repo)`.
4. `app.listen({ port })` e logar que está ouvindo.

Imports: `buildServer` de `./infra/http/server.js`, `createDb` de `./infra/db/client.js`,
`PricingConfigRepository` de `./modules/pricing-config/repository.js`.

Note como o `index.ts` é o **único** lugar que conhece *todas* as peças ao mesmo tempo — é onde a
injeção de dependência acontece de verdade (o repo real entra no `buildServer`). É o topo da seta de
dependência do guia 09: `index → infra → modules → domain`.

## 6. Testes (RED) — handler com `app.inject()`

`backend/src/infra/http/server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";
import { defaultConfig } from "../../domain/pricing/config.js";
import type { ConfigStore } from "../../modules/pricing-config/repository.js";
import type { PricingConfig } from "../../domain/pricing/types.js";

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

Repare nos imports do teste: ele mora em `infra/http/`, então alcança o domínio com `../../domain/...`
e a interface `ConfigStore` com `../../modules/pricing-config/repository.js`. É a estrutura por papel
em ação — o teste do server (infra) importa o contrato do módulo e os tipos do domínio.

Dois pontos centrais deste teste:

- **`app.inject(...)`** — Fastify tem um modo de injeção que **executa a requisição HTTP inteira em
  memória**, sem abrir socket nem subir servidor real. Você passa `method`, `url`, `payload`, e
  recebe `statusCode`, `res.json()` etc. É rápido, determinístico e não disputa portas. (Se você vem
  de Go, é o paralelo direto do `httptest` — testa o handler de ponta a ponta sem rede de verdade.)
  Aqui ele exercita o caminho completo: plugins → rota de `quotes` → `calculate`, e a volta do erro
  de validação como 400.
- **`FakeStore`** — implementa a interface `ConfigStore` em memória. Como `buildServer` (e, dentro
  dele, as rotas) dependem da *interface* (e não do repo concreto com Drizzle), o teste injeta esse
  dublê e roda **sem Postgres**. É exatamente o pagamento do desenho em camadas: o HTTP é testável
  isoladamente. (Este é código de **teste**, por isso o mostro inteiro — diferente dos corpos de
  produção.)

### Rodando os testes

```bash
cd ~/Dev/estimate-engine/backend
npx vitest run src/infra/http/server.test.ts
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

Esperado: um JSON contendo `"total":19000`. Se vier isso, a stack inteira (HTTP → módulo → store →
engine) está de pé.

## 7. Refactor & boas práticas

- **Handler fino, sempre.** Se um handler começar a ter `if`s de regra de negócio, mova para a
  engine. O handler só valida/chama/serializa.
- **Sem `try/catch` na rota.** Deixe o `PricingError` propagar e trate no `setErrorHandler`. Não
  reintroduza um `try/catch` por rota — é a duplicação que o plugin existe para eliminar.
- **Não transforme todo erro em 400.** No error-handler, só `PricingError` vira 400; o resto vira 500
  e aparece no log. Um bug inesperado não pode virar silenciosamente um 400.
- **Cada módulo é dono do seu schema e das suas rotas.** Mantenha o schema Zod ao lado das rotas que
  o consomem (`modules/<feature>/schema.ts`). Alinhe os campos/enums aos tipos do domínio.
- **Plugins de infra ficam em `infra/http/plugins/`.** CORS, error-handler e (futuramente) auth são
  encanamento transversal — não os enfie num módulo de feature.
- **`buildServer` recebe a interface, não o concreto.** Já está assim — não "otimize" passando o
  repo real, ou você perde a testabilidade do `inject` + `FakeStore`.
- **CORS restrito à origem do front.** Em dev, `http://localhost:5173`. Não use `origin: true`
  (qualquer origem) sem necessidade.

## 8. Checklist de conclusão

- [ ] `modules/quotes/schema.ts` (com `quoteInputSchema`) e `modules/pricing-config/schema.ts` (com
      `pricingConfigSchema`) existem.
- [ ] `modules/quotes/routes.ts` exporta `quotesRoutes(app, store)` e registra
      `POST /api/quotes/calculate` (Zod → 400; sem `try/catch`, deixa o `PricingError` propagar).
- [ ] `modules/pricing-config/routes.ts` exporta `pricingConfigRoutes(app, store)` com `GET`/`PUT
      /api/pricing-config` lendo/gravando via `store`.
- [ ] `infra/http/plugins/cors.ts` exporta `registerCors(app)` (origem `http://localhost:5173`).
- [ ] `infra/http/plugins/error-handler.ts` exporta `registerErrorHandler(app)` com
      `setErrorHandler` mapeando `PricingError → 400` e o resto → 500.
- [ ] `infra/http/server.ts` exporta `buildServer(store)` que aplica os plugins e registra as rotas
      dos módulos; retorna a `FastifyInstance`.
- [ ] `index.ts` faz o wiring (createDb → repo → buildServer → listen) e falha cedo sem `DATABASE_URL`.
- [ ] `npx vitest run src/infra/http/server.test.ts` passa (200/19000 e 400).
- [ ] `npx vitest run` (suíte inteira) passa.
- [ ] O `curl` do smoke test retorna `"total":19000`.

## 9. Para se aprofundar

- **Package by feature, not by layer** — por que rotas por módulo escalam melhor que um `server.ts`
  gigante (conecta com o guia 09).
- **Arquitetura em camadas / handler fino** — por que a lógica de negócio não vive no transporte.
- **Fastify** — ciclo de vida, plugins, `register`, encapsulamento, `setErrorHandler` e o modo
  `inject` para testes.
- **CORS** — preflight, `Access-Control-Allow-Origin`, por que o navegador exige.
- **Zod** — `safeParse` vs `parse`, `z.infer` para derivar tipos a partir do schema.
- **Mapeamento erro de domínio → HTTP centralizado** — error boundaries, quando 400 vs 500, e por que
  re-lançar (ou não capturar) o inesperado.

---

Próximo: **`07-frontend-calculadora.md`** — React + TanStack Query consumindo esta API.
