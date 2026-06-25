# Módulo 10 — Estimate: domínio e máquina de estado

> **Como usar este guia:** eu **explico o porquê**, te dou os **models** (assinaturas de tipo e
> função) e os **testes (RED)** prontos. **Você escreve a implementação.** A resposta existe no
> plano (`docs/plans/2026-06-25-fase-2-estimates.md`, Task 1), mas use-o só como *gabarito* quando
> travar de verdade.
>
> **Convenção do projeto (vale para a Fase 2 inteira):** o backend roda em **Bun**, o `tsconfig`
> usa `moduleResolution: bundler` e o código mora na **raiz `src/`** (não em `backend/`). Por isso
> os imports relativos são **sem extensão** (ex.: `import { calculate } from "../pricing/calculate"`)
> e os testes rodam com `bunx vitest run <path>`. Isso difere dos guias da Fase 1, que usavam
> `backend/` + `.js`; siga a convenção real daqui pra frente.

---

## 1. Objetivo

Ao terminar este módulo, você vai ter:

- O **domínio `estimate`**: os tipos que descrevem uma estimate persistida.
- Uma **máquina de estado** pura (`draft → sent → {accepted | declined}`) que valida transições.
- Os **erros de domínio** (`EstimateError`, `EstimateStatusError`, `EstimateNotFoundError`) que as
  camadas de cima vão mapear para HTTP.

Tudo isso é **puro** (zero HTTP, zero DB) — vive em `src/domain/estimate/` e é trivial de testar.

## 2. Conceitos

### 2.1 De cálculo efêmero a documento persistido

Na Fase 1, a calculadora era *stateless*: `QuoteInput → QuoteBreakdown` e pronto, nada ficava
gravado. Uma **estimate** é o oposto: um **documento com identidade e ciclo de vida**. Ela nasce,
é enviada para um cliente, e termina aceita ou recusada. Para isso ela ganha:

- **Identidade**: um `id` (uuid interno) e um `number` legível (`EST-0007`).
- **Dono**: os dados de contato do cliente (`customer`).
- **Conteúdo congelado**: o `input` e o `breakdown` calculados (snapshot).
- **Estado**: em que ponto do ciclo ela está (`status`).

### 2.2 Snapshot: por que congelar `input` **e** `breakdown`

A `PricingConfig` muda com o tempo (o dono do negócio reajusta preços). Se uma estimate só
guardasse o `input` e recalculasse na hora de exibir, **o preço mostrado ao cliente mudaria
sozinho** quando a config fosse editada — inaceitável: o que foi enviado tem que valer.

A solução é **snapshot**: gravamos o `QuoteBreakdown` inteiro (itemizado) no momento da criação.
Ler uma estimate é **ler JSON**, nunca recalcular. Como o breakdown já carrega as linhas de
add-on (com nome e preço unitário), o snapshot dos add-ons sai **de graça** — sem precisar de
tabela ou lógica extra.

### 2.3 Contato embutido (denormalização proposital)

Os dados do cliente (`name`, `email`, `phone`, `address`) ficam **dentro da própria estimate**,
como um objeto JSON, não numa tabela `Customer` separada. Por quê? Porque nesta fase o `Customer`
"de verdade" (a ponte com o m4m) ainda não existe — ele nasce na Fase 4. Criar a tabela agora
seria **especular** sobre um relacionamento que ainda não temos (YAGNI). Embutir é mais simples,
e ainda funciona como snapshot: "para quem esta estimate foi feita, naquele momento".

> Quando o `Lead` (Fase 3) e o `Customer` (Fase 4) chegarem, a estimate ganha um FK **opcional**
> apontando para eles — sem quebrar nada do que está aqui.

### 2.4 Máquina de estado: o que é e por que isolar

Um `status` não muda de qualquer jeito para qualquer outro. As regras do negócio são:

```
draft  ── send ──▶  sent
sent   ── accept ─▶  accepted
sent   ── decline ▶  declined
```

E **só isso**. Aceitar uma `draft` (que o cliente nem viu) é um bug. Reenviar uma `accepted`
também. Uma **máquina de estado** é só uma estrutura que diz, para cada estado, **quais
transições são permitidas** — e rejeita o resto.

Por que isolar isso numa função pura no domínio, em vez de espalhar `if`s pelas rotas? Porque é
**uma regra de negócio**, e regra de negócio é o coração do domínio: testável sem servidor, sem
banco, e com **uma única fonte da verdade**. Se amanhã surgir um estado novo, você muda um lugar.

### 2.5 Erros de domínio mapeados a HTTP

Seguimos o padrão da Fase 1 (`PricingError`): o domínio lança erros **específicos**, e uma camada
HTTP os traduz para status codes. Aqui:

| Erro | Significado | HTTP (módulo 12) |
|------|-------------|------------------|
| `EstimateStatusError` | transição/edição inválida para o status atual | **409 Conflict** |
| `EstimateNotFoundError` | `id`/`token` não existe | **404 Not Found** |

Repare na escolha de **409** (e não 400) para transição inválida: o request está bem-formado, mas
**conflita com o estado atual** do recurso. É o status semanticamente correto — e um bom assunto
de estudo.

## 3. Models

> Estes arquivos moram em `src/domain/estimate/`. **Tipos** podem ser escritos por inteiro (são
> definições). A **função** vem só com a assinatura — o corpo é seu. Os **erros** vêm com a forma;
> você implementa os construtores.

```ts
// src/domain/estimate/types.ts
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
  id: string;            // uuid interno — nunca exposto na rota pública
  number: number;        // sequencial legível (exibido como "EST-0007")
  publicToken: string;   // credencial da página pública
  customer: CustomerInfo;
  input: QuoteInput;          // snapshot da entrada
  breakdown: QuoteBreakdown;  // snapshot do cálculo (congelado)
  status: EstimateStatus;
  createdAt: string;     // ISO 8601
  updatedAt: string;
  sentAt: string | null;
  decidedAt: string | null;
}

export interface EstimateSummary {  // para a lista (não traz o breakdown inteiro)
  id: string;
  number: number;
  customerName: string;
  total: Money;
  status: EstimateStatus;
  createdAt: string;
}

export interface PublicEstimateView { // o que a rota pública expõe (sem id/input/config)
  number: number;
  customer: CustomerInfo;
  breakdown: QuoteBreakdown;
  status: EstimateStatus;
}
```

```ts
// src/domain/estimate/errors.ts
// EstimateError é a base; subclasses sinalizam o caso específico para o error-handler HTTP.
export class EstimateError extends Error {}
export class EstimateStatusError extends EstimateError {
  // recebe (from, to) e monta uma mensagem; lembre de setar this.name
  constructor(from: string, to: string);
}
export class EstimateNotFoundError extends EstimateError {
  constructor();
}
```

```ts
// src/domain/estimate/status.ts
import type { EstimateStatus } from "./types";

// Para cada status, a lista de status para os quais ele PODE transicionar.
// (Estados terminais — accepted/declined — têm lista vazia.)
export const ALLOWED_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]>;

// Lança EstimateStatusError se (from -> to) não for uma transição permitida.
export function assertTransition(from: EstimateStatus, to: EstimateStatus): void;
```

## 4. Testes (RED)

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

Rode e **confirme que falha** (RED):

```bash
bunx vitest run src/domain/estimate/status.test.ts
```

Esperado: **FAIL** com `Cannot find module './status'` (ou `./errors`).

## 5. Seu desafio (GREEN)

1. Crie `types.ts` com os tipos acima (são definições — pode escrever como mostrado).
2. Crie `errors.ts`: implemente os três erros. Lembre de `super(...)` com uma mensagem útil e de
   setar `this.name` em cada subclasse (ajuda no log e na depuração).
3. Crie `status.ts`:
   - Defina `ALLOWED_TRANSITIONS` com **exatamente** as transições da seção 2.4.
   - Implemente `assertTransition` para lançar `EstimateStatusError(from, to)` quando `to` **não**
     estiver na lista permitida de `from`.

**Dicas (sem entregar o corpo):**

- `ALLOWED_TRANSITIONS` é só um objeto: cada chave é um status, cada valor é um array de destinos.
- `assertTransition` é curtíssimo: consulte a lista do `from` e veja se `to` está nela. Um `Array`
  tem um método que responde "isto está aqui?" com booleano.
- Não invente estados nem transições que os testes não pedem. YAGNI.

```bash
bunx vitest run src/domain/estimate/status.test.ts
```

Esperado: **PASS**.

## 6. Refactor & boas práticas

- **Uma fonte da verdade.** Toda regra "de que estado posso ir para qual" deve estar **só** em
  `ALLOWED_TRANSITIONS`. Nenhum `if (status === "draft")` espalhado por aí — quem precisar valida
  via `assertTransition`.
- **Erros com identidade.** `this.name` correto faz o log dizer `EstimateStatusError` em vez de um
  genérico `Error`. Pequeno, mas paga na hora de depurar.
- **Domínio puro.** Nada aqui importa Fastify, Drizzle ou `process.env`. Se você sentiu vontade de
  importar algo de `infra/` ou `modules/`, parou: a seta de dependência aponta para **dentro**.

Commite quando estiver verde:

```bash
git add src/domain/estimate
git commit -m "feat(estimate): domain types, errors and status machine"
```

## 7. Checklist de conclusão

- [ ] `src/domain/estimate/types.ts` com `EstimateStatus`, `CustomerInfo`, `Estimate`, `EstimateSummary`, `PublicEstimateView`.
- [ ] `errors.ts` com `EstimateError` (base) + `EstimateStatusError` + `EstimateNotFoundError`, cada um com `this.name`.
- [ ] `ALLOWED_TRANSITIONS` reflete **só** `draft→sent`, `sent→accepted`, `sent→declined`.
- [ ] `status.test.ts` rodou **vermelho** antes de você implementar, e agora está **verde**.
- [ ] Nenhum arquivo do domínio importa de `modules/` ou `infra/`.

## 8. Para se aprofundar

- **Máquinas de estado finitas (FSM):** o conceito por trás disso; bibliotecas como `xstate`
  formalizam estados/transições (não precisamos delas aqui — a versão "tabela + função" basta).
- **Snapshot / event-sourcing:** por que sistemas financeiros gravam o estado calculado em vez de
  recalcular; o trade-off entre "fonte da verdade derivada" e "valor congelado".
- **Status HTTP 409 vs 400 vs 422:** quando o request é válido mas conflita com o estado do recurso.
- **Denormalização proposital:** quando duplicar/embutir dado é a escolha certa (snapshots, leitura).

---

Pronto? Vá para **`11-persistencia-estimates.md`** — schema Drizzle, JSONB e o repository.
