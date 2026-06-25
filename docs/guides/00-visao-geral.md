# Guia de Estudo — Estimate Engine (Fase 1: Calculadora)

> **Como usar estes guias:** este é um curso prático. Cada módulo **explica o porquê**, te dá os
> **models** (assinaturas de tipos) e os **testes (TDD)** prontos — mas **você escreve a
> implementação**. A resposta existe no plano (`docs/plans/2026-06-22-fase-1-calculadora.md`),
> mas use-o só como *gabarito* quando travar de verdade. Você aprende escrevendo, não lendo.

---

## 1. O que você vai construir

Um **lead-to-quote tool** para *house cleaning*: uma calculadora de preços configurável,
exposta por uma API em **Node + TypeScript (Fastify)**, com um frontend em **React** que calcula
ao vivo e permite gerenciar a configuração de preços (incluindo um catálogo de add-ons).

Esta Fase 1 entrega **o coração do produto**: a engine de cálculo. As fases seguintes
(estimates, pipeline de leads, conversão em customer) virão depois, cada uma com seu próprio guia.

Referência de produto e decisões: `docs/specs/2026-06-22-estimate-engine-calculadora-design.md`.

## 2. Objetivos de aprendizado

Ao terminar a Fase 1, você vai ter praticado:

- **Arquitetura em camadas** no backend: `http (Fastify) → repository → módulo de domínio`.
- **Deep modules**: isolar a lógica de negócio (a engine) atrás de uma interface mínima.
- **Money handling correto**: dinheiro como inteiro em *cents*, nunca decimal quebrado.
- **TDD** (Test-Driven Development) com **Vitest**: o ciclo *red → green → refactor*.
- **Persistência** com Postgres + **Drizzle ORM**, usando **JSONB** e o **repository pattern**.
- **HTTP** idiomático com **Fastify** + validação na fronteira com **Zod**.
- **Frontend** com React + TanStack Query consumindo a API (round-trip front↔back), com **tipos
  TypeScript compartilháveis** entre back e front.

## 3. A arquitetura em uma imagem

```
┌─────────────┐     HTTP/JSON      ┌──────────────────────────────────────────────┐
│   React     │  ───────────────▶  │            Backend Node + TypeScript           │
│  (Vite)     │                    │                                                │
│             │   POST /quotes/    │   http (Fastify routes + Zod)                  │
│ Calculadora │   calculate        │        │                                       │
│  + Config   │  ◀───────────────  │        ▼                                       │
└─────────────┘   QuoteBreakdown   │   pricing  ← módulo PURO (sem HTTP/DB)          │
                                   │     calculate(input, config) → breakdown        │
                                   │        ▲                                       │
                                   │        │ config                                │
                                   │   repository (Drizzle) ──────── Postgres        │
                                   │                                  (JSONB)        │
                                   └──────────────────────────────────────────────┘
```

**Por que o módulo `pricing` é puro?** Porque ele não sabe o que é HTTP nem banco de dados.
É só `entrada + configuração → resultado`. Isso o torna:
- **Trivial de testar** — sem subir servidor nem banco, só chamar a função.
- **Fácil de raciocinar** — você segura ele inteiro na cabeça.
- **Portável** — amanhã dá pra portar essa mesma função para o Laravel do m4m.

Essa é a ideia central de *deep module*: muita funcionalidade atrás de uma interface pequena.

## 4. O ciclo TDD (você vai repetir isso o tempo todo)

```
   ┌──────────────────────────────────────────────────────────┐
   │  1. RED    — escreva um teste que descreve o comportamento │
   │              desejado. Rode. Ele FALHA (ainda não existe). │
   │                                                            │
   │  2. GREEN  — escreva o MÍNIMO de código para o teste passar.│
   │              Sem firula. Só fazer ficar verde.             │
   │                                                            │
   │  3. REFACTOR — agora que está verde, melhore o código sem  │
   │               quebrar o teste. Rode de novo. Continua verde.│
   └──────────────────────────────────────────────────────────┘
```

**Por que escrever o teste primeiro?** Porque te força a definir *o que* o código deve fazer
antes de *como*. O teste vira a especificação executável. Nestes guias, **eu te dou o teste
(RED)** e **você faz o GREEN**.

### Como rodar testes com Vitest

```bash
cd ~/Dev/estimate-engine/backend
npx vitest run src/domain/pricing/money.test.ts   # roda um arquivo
npx vitest run src/domain/pricing/                 # roda um diretório
npm test                                    # roda tudo (vitest run)
npx vitest                                  # modo watch (re-roda ao salvar)
```

## 5. Regras do projeto (valem para todos os módulos)

- **Idioma:** explicações em português; **código, tipos, nomes de campos e termos técnicos em inglês**.
- **Dinheiro é sempre inteiro em cents** (`type Money = number`, ex.: `19000` = $190.00). Em JS,
  inteiros são seguros até 2^53 — muito acima do que veremos. `float` só aparece no
  *multiplicador de serviço* e no *percentual de desconto*, sempre arredondando de volta para cents.
- **A API transporta dinheiro em cents** (inteiro). O frontend formata dividindo por 100.
- **O backend é a fonte da verdade do cálculo.** O frontend nunca reimplementa a fórmula —
  ele chama `POST /quotes/calculate`.
- **Backend em ESM** (`"type": "module"`). Com `moduleResolution: NodeNext`, os imports relativos
  no código de produção levam extensão `.js` (ex.: `import { roundHalfUp } from "./money.js"`),
  mesmo o arquivo sendo `.ts`. Isso é normal e esperado em ESM/TypeScript moderno.

## 6. A fórmula de preço (a regra de negócio central)

```
subtotal        = basePrice
                + sqft       * perSqft
                + bedrooms   * perBedroom
                + bathrooms  * perBathroom
                + pets       * perPet

afterMultiplier = subtotal * serviceMultiplier[service]      (arredonda p/ cents)

freqDiscount    = afterMultiplier * frequencyDiscount[frequency]   (arredonda p/ cents)

addOnsTotal     = Σ (addon.price * quantity)                 (valor fixo, não escala)

total           = afterMultiplier - freqDiscount + addOnsTotal - manualDiscount
total           = max(total, minimumPrice)
```

**Golden case (decore este número):** Deep Clean, One-time, 1000 sqft, 2 quartos, 1 banheiro,
0 pets, sem add-ons → **19000 cents = $190.00**. Esse caso aparece como teste em vários módulos;
se ele quebrar, algo na fórmula está errado.

## 7. Pré-requisitos de ambiente

Você vai precisar instalar/ter:

- **Node 20+** e npm — `node -v`
- **Postgres 15+** — o jeito mais simples é via Docker:

```bash
docker run --name ee-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=estimate_engine \
  -p 5432:5432 -d postgres:15
```

Connection string usada nos guias:
`postgres://postgres:postgres@localhost:5432/estimate_engine`

## 8. Glossário (vocabulário do domínio e da stack)

| Termo | Significado |
|-------|-------------|
| `ServiceType` | Tipo de serviço: `deep_clean`, `recurring`, `move_in_out` |
| `Frequency` | Frequência: `one_time`, `weekly`, `bi_weekly`, `monthly` |
| `PricingConfig` | Os parâmetros do cálculo + catálogo de add-ons (persistido como JSONB) |
| `QuoteInput` | A entrada do cálculo (dados do imóvel + serviço + add-ons selecionados) |
| `QuoteBreakdown` | O resultado itemizado (cada linha do preço + total) |
| `AddOn` | Item do catálogo configurável (ex.: "Inside Fridge"), com preço por unidade |
| `Money` | `number` inteiro em cents |
| *deep module* | Módulo com muita lógica atrás de uma interface pequena |
| *repository pattern* | Camada que isola o acesso a dados do resto da aplicação |
| **Fastify** | Framework HTTP do backend |
| **Drizzle ORM** | Camada de acesso ao Postgres (schema tipado + migrations) |
| **Zod** | Validação de schema na fronteira HTTP |
| **Vitest** | Test runner (back e front) |

## 9. Índice dos módulos

Faça **na ordem** — cada um depende do anterior.

| # | Guia | Foco |
|---|------|------|
| 0 | `00-visao-geral.md` | Você está aqui |
| 1 | `01-money-e-tdd.md` | Tipo `Money`, arredondamento e fundamentos de TDD |
| 2 | `02-modelo-de-dominio.md` | Os tipos do domínio + `defaultConfig` |
| 3 | `03-engine-de-calculo.md` | A função `calculate`: subtotal → multiplicador → desconto → add-ons |
| 4 | `04-validacao.md` | Erros de domínio (`PricingError`) e validação |
| 5 | `05-persistencia-postgres.md` | Postgres, Drizzle, JSONB e o repository |
| 6 | `06-http-api.md` | Fastify, Zod, rotas e camadas |
| 7 | `07-frontend-calculadora.md` | React + TanStack Query, cálculo ao vivo |
| 8 | `08-frontend-config.md` | Tela de config + CRUD do catálogo de add-ons |
| 9 | `09-organizacao-do-projeto.md` | Estrutura de pastas: domain / modules / infra (conceito) |

## 10. Estrutura de cada guia

Todos os módulos seguem o mesmo formato:

1. **Objetivo** — o que você vai aprender e construir.
2. **Conceitos** — o *porquê*, explicado com calma.
3. **Models** — as assinaturas de tipos/funções (em inglês) que você vai implementar.
4. **Testes (RED)** — os testes prontos para colar e rodar no vermelho.
5. **Seu desafio (GREEN)** — o que implementar, com dicas, **sem entregar a resposta**.
6. **Refactor & boas práticas** — como deixar melhor.
7. **Checklist de conclusão** — como saber que terminou.
8. **Para se aprofundar** — conceitos e leituras.

---

Pronto? Vá para **`01-money-e-tdd.md`**.
