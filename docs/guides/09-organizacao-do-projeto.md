# 09 — Organização do projeto (estrutura de pastas e jeito de pensar)

> Guia **conceitual** (não é um passo de build). Lê-se a qualquer momento — de preferência cedo,
> porque a estrutura que você escolhe agora decide se adicionar a Fase 3 vai ser "criar uma pasta"
> ou "caçar arquivos em 4 lugares".

## 1. Objetivo

Entender **como organizar um backend Fastify (TS + Drizzle + Zod)** sem over-engineering, de um
jeito que sirva à Fase 1 **e** escale até o CRM completo (estimates, leads, customers). No fim,
você saberá *onde cada arquivo mora* e *por quê*.

## 2. Conceitos — as 3 formas de organizar

### A) Por camada técnica (layer-first)
Agrupa por *tipo de coisa*: `routes/`, `services/`, `repositories/`, `schemas/`.
**Pensa:** "tudo que é rota fica junto". É o que a maioria dos tutoriais mostra.
**Problema:** uma feature (ex.: *leads*) fica **espalhada** em 4 pastas. Conforme cresce, vira
caça ao tesouro. Bom só para apps minúsculos que nunca crescem.

### B) Por feature / fatia vertical (feature-first) ✅
Agrupa por *domínio*: `modules/leads/` contém tudo de leads (rota + zod + repository).
**Pensa:** "coisas que mudam juntas ficam juntas". Adicionar uma fase = criar uma pasta.
**Melhor encaixe** para um produto que cresce por subsistemas (o seu caso).

### C) Hexagonal / Clean Architecture completo
Ports, adapters, use-cases, entities, DI container…
**Pensa:** "isole o domínio de tudo atrás de interfaces". Para o nosso tamanho: **over-engineering**.
Roubamos só **uma** ideia dela (domínio puro no centro) e largamos o resto da cerimônia.

## 3. A estrutura que usamos — feature-first com núcleo puro, agrupada por papel

O `src/` no topo tem **3 baldes com papéis óbvios**, em vez de uma sopa de pastas flat:

```
backend/
  src/
    domain/                 ← REGRAS DE NEGÓCIO puras (zero framework)
      pricing/
        money.ts
        types.ts
        config.ts           (defaultConfig — semente)
        calculate.ts
        errors.ts
        *.test.ts

    modules/                ← FEATURES (fatias verticais = adapters HTTP)
      quotes/
        routes.ts           (POST /quotes/calculate → usa domain/pricing)
        schema.ts           (zod do request)
      pricing-config/
        repository.ts       (Drizzle: get/save + interface ConfigStore)
        routes.ts           (GET/PUT /pricing-config)
        schema.ts           (zod)
      # Fase 2+: estimates/  leads/  customers/  ← cada fase entra aqui inteira

    infra/                  ← ENCANAMENTO técnico
      db/
        client.ts           (pool + drizzle)
        schema.ts           (tabelas Drizzle)
      http/
        server.ts           (buildServer: compõe plugins + módulos)
        plugins/
          cors.ts
          error-handler.ts  (PricingError → 400, num lugar só)

    index.ts                ← entry point (wiring: db → repo → server → listen)

    # shared/   → nasce só quando aparecer um helper genérico DE VERDADE.
    #             NÃO crie "utils/" vazio agora.
```

**Por que agrupar por papel resolve o desconforto comum:** o núcleo de negócio (`domain/`) tem
endereço fixo e nobre — nunca fica perdido ao lado de `utils`/`lib`. Cada pasta do topo responde
"que tipo de cidadão é isto": regra de negócio, feature, ou encanamento.

## 4. A regra mais importante: direção da dependência

Uma seta só, **sempre para dentro**:

```
index  →  infra  →  modules  →  domain
                     modules  →  infra/db
```

- **`domain/` não importa NADA** de `modules`/`infra`. É o que o torna testável sem subir
  servidor/banco e portável para o Laravel do m4m depois.
- **`modules/` usam `domain` e `infra/db`**, mas não conhecem o servidor HTTP — a rota recebe
  dados já validados e chama o domínio.
- **`infra/` + `index.ts` fazem o wiring** — conhecem todo mundo, ligam os fios.

**Teste mental:** se você se pegar escrevendo `import ... from "fastify"` dentro de `domain/`,
**parou** — quebrou a regra. O domínio não sabe que existe HTTP.

## 5. Onde cada peça mora (e por quê)

| Peça | Onde | Por quê |
|------|------|--------|
| **Engine / regras** | `domain/pricing/` | Coração do negócio, sem framework. |
| **Tipos de domínio** | `domain/pricing/types.ts` | O domínio é dono da linguagem. (São os tipos que o front espelha.) |
| **Zod schemas** | `modules/<feature>/schema.ts` | São o contrato HTTP da rota; mudam junto com ela. Use `z.infer<typeof schema>` para derivar o DTO sem repetir tipo. |
| **Repository (Drizzle)** | `modules/<feature>/repository.ts` | O acesso a dados daquela feature. |
| **Tabelas Drizzle** | `infra/db/schema.ts` | `drizzle-kit` aponta para um lugar. Quando crescer: `infra/db/schema/leads.ts` + re-export. |
| **Mapear erro → HTTP** | `infra/http/plugins/error-handler.ts` | Centraliza `PricingError → 400` num `setErrorHandler`, em vez de `try/catch` em toda rota. |
| **Env** | lido no `index.ts` (Fase 1); vira `infra/env.ts` quando crescer | Falha cedo e claro se faltar `DATABASE_URL`. |

## 6. Idiomas do Fastify que valem (sem exagero)

- **Plugins para coisas transversais** (cors, error-handler, futuramente auth). Plugin é a unidade
  de encapsulamento do Fastify. No nosso caso, funções pequenas `registerCors(app)` /
  `registerErrorHandler(app)` já bastam.
- **Rotas por módulo**: cada `modules/<feature>/routes.ts` exporta `xRoutes(app, store)` e o
  `server.ts` chama todas. Mantém a feature dona das suas rotas.
- **`setErrorHandler`**: deixe a rota *lançar* o `PricingError` e trate num lugar só. Rota mais
  limpa, comportamento consistente.
- **Injeção explícita > mágica (por enquanto)**: passamos o `store` por argumento
  (`buildServer(store)`), em vez de `app.decorate('db', ...)` ou `@fastify/autoload`. Para
  aprender, o explícito mostra o fluxo. Adote decorators/autoload só quando o número de rotas doer.

## 7. Guardrails anti-over-engineering (o que NÃO fazer agora)

- ❌ **Service layer quando a rota é trivial.** `POST /quotes/calculate` só chama `calculate()`.
  Não crie um `QuotesService` que só repassa. Crie *service* quando houver orquestração real
  (Fase 2: "criar estimate" = calcular + persistir + agendar follow-ups → aí sim).
- ❌ **Interface para tudo.** Temos `ConfigStore` (interface) — e isso **se justifica** porque dá
  o `FakeStore` nos testes. Não crie interface para cada repo "por princípio". *Regra dos três:*
  só abstraia quando o padrão repetir 3×.
- ❌ **`BaseRepository<T>` genérico, DI container, monorepo, pacote de tipos compartilhado.**
  Solução para problema que você ainda não tem.
- ❌ **`shared/` ou `utils/` vazio "para o futuro".** Crie quando tiver conteúdo genuíno.
- ❌ **Barrels (`index.ts` re-exportando tudo) em excesso** — atrapalham tree-shaking e criam ciclos.
- ✅ **Flat até doer.** Quebre em subpasta quando a pasta incomodar — não antes.

## 8. Como isso escala para as próximas fases

Nada do que existe é reestruturado. Cada fase é **uma pasta nova** em `modules/`:

| Fase | O que entra | Onde |
|------|-------------|------|
| 2 — Estimates | persistir quote + cliente + página pública | `modules/estimates/` (+ tabela em `infra/db/schema.ts`) |
| 3 — Leads + Pipeline | lead + kanban + transições | `modules/leads/` |
| 4 — Convert → Customer | "Won" cria Customer (ponte m4m) | `modules/customers/` + um evento de domínio em `domain/` |
| 5 — Suporte | auth, follow-ups, audit | `modules/auth/`, `modules/follow-ups/`, plugin em `infra/http/plugins/` |

Quando uma feature ganhar lógica de orquestração de verdade, aí ela ganha um `service.ts` ao lado
do `routes.ts` e `repository.ts` — naturalmente, quando a dor aparecer.

## Checklist mental (use ao criar qualquer arquivo)

- [ ] É regra de negócio pura? → `domain/`. (Não importa framework.)
- [ ] É uma feature (rota/zod/repo)? → `modules/<feature>/`.
- [ ] É encanamento técnico (db, http, env)? → `infra/`.
- [ ] A dependência aponta só para dentro (`infra → modules → domain`)?
- [ ] Estou criando uma abstração para um problema que **já tenho**? Se não, pare.

## Para se aprofundar

- *A Philosophy of Software Design* (John Ousterhout) — deep modules, interfaces pequenas.
- Fastify docs: *Plugins*, *Encapsulation*, *Error Handling* (`setErrorHandler`).
- Drizzle docs: *Schema*, *Migrations* (`drizzle-kit`).
- "Package by feature, not by layer" — busque o conceito; é o coração da Opção B.
