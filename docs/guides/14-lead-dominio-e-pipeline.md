# Módulo 14 — Lead: domínio e o pipeline

> **Como usar este guia:** eu **explico o porquê**, te dou os **models** e os **testes (RED)**.
> **Você escreve a implementação.** Gabarito: `docs/plans/2026-06-25-fase-3-leads-pipeline.md`, Task 1.
>
> **Convenção (Fase 3):** Bun, imports **sem extensão**, raiz `src/`. Testes: `bunx vitest run <path>`.

---

## 1. Objetivo

- O **domínio `lead`**: os tipos do prospect e os **estágios** do funil.
- Os helpers puros de estágio, com destaque para **`nextStage`** — a regra do *seam de eventos* que
  liga a estimate ao lead.
- O erro `LeadNotFoundError`.

## 2. Conceitos

### 2.1 O Lead como porta de entrada

Até a Fase 2, a estimate nascia solta. Agora o **Lead** (o prospect) é cadastrado primeiro, e as
estimates nascem **dentro** dele (1 lead → N estimates). O Lead é o que o **pipeline** (Kanban)
organiza: cada lead está num **estágio** do funil, e o usuário arrasta cards entre colunas.

### 2.2 Estágios fixos (e por que não uma máquina estrita)

Os estágios são um **enum fixo**: `new_lead → contacted → estimate_sent → won → lost` (won/lost
terminais). Diferente da estimate (que tem uma máquina de estado **estrita**), o Kanban é **drag
livre**: um vendedor arrasta um card para qualquer coluna, inclusive "pra trás". Forçar transições
restritas aqui iria contra a natureza de um board. Então **não** há `assertTransition` para leads —
o drag pode ir de qualquer estágio para qualquer estágio (validamos só que o destino é um estágio
**válido**, via Zod, no módulo 16).

### 2.3 O seam de eventos: `nextStage`

Mesmo com drag livre, queremos que o board reflita o que acontece com as estimates **sem trabalho
manual**: ao **enviar** uma estimate, o lead deveria ir para `estimate_sent`; ao **aceitar**, para
`won`; ao **recusar**, para `lost`. Isso é um **evento de domínio**: algo aconteceu numa entidade
(estimate) e outra entidade (lead) reage.

Nesta fase fazemos a versão **leve e explícita**: uma função pura **`nextStage(current, event)`**
que diz para qual estágio o lead vai dado o evento — e o `estimate service` (módulo 15) a chama.
Sem event bus, sem mágica; só uma função testável. (A formalização — handlers/eventos de verdade —
é o tema da Fase 4, na conversão `won → Customer`.)

### 2.4 A guarda do `won` (uma regra de negócio sutil)

Um lead pode ter **várias** estimates. Imagine: você manda duas, o cliente **aceita** a primeira
(lead → `won`) e depois **recusa** a segunda. Se o auto-avanço fosse "burro", o decline rebaixaria
o lead de `won` para `lost` — **errado**: o negócio já foi ganho.

Por isso `nextStage` tem uma **guarda**: se o lead já está em `won`, ele **permanece** em `won`,
ignore o evento. O drag manual continua podendo sobrescrever (se você realmente quiser reabrir). Essa
regrinha é pura e fácil de testar — e é exatamente o tipo de detalhe que separa um CRM correto de um
cheio de bugs silenciosos.

### 2.5 Por que isso é domínio puro

`nextStage`, `stageForEstimateEvent`, `isTerminal` não tocam HTTP nem banco. São funções de
`(estado, evento) → estado`. Resultado: você testa todas as combinações (incluindo a guarda do won)
em milissegundos, e a regra mora num lugar só.

## 3. Models

```ts
// src/domain/lead/types.ts
export type LeadStage = "new_lead" | "contacted" | "estimate_sent" | "won" | "lost";

// Contato em campos PLANOS: o lead é dado vivo/consultável (busca por email, filtro por nome),
// então vira colunas no banco — não jsonb. (jsonb fica para snapshot, como o customer da estimate.)
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  source: string | null; // ex.: "website", "referral" — opcional
  notes: string | null;
  stage: LeadStage;
  createdAt: string;
  updatedAt: string;
}

export interface LeadSummary { // card do Kanban
  id: string;
  name: string;
  stage: LeadStage;
  createdAt: string;
}
```

```ts
// src/domain/lead/errors.ts
export class LeadError extends Error {}
export class LeadNotFoundError extends LeadError {
  constructor(); // mensagem + this.name
}
```

```ts
// src/domain/lead/stage.ts — assinaturas (corpos seus)
import type { LeadStage } from "./types";

export const LEAD_STAGES: LeadStage[]; // ordem das colunas
export type EstimateEvent = "sent" | "accepted" | "declined";

export function stageForEstimateEvent(event: EstimateEvent): LeadStage; // sent->estimate_sent, accepted->won, declined->lost
export function isTerminal(stage: LeadStage): boolean; // won | lost
export function nextStage(current: LeadStage, event: EstimateEvent): LeadStage; // auto-avanço COM a guarda do won
```

## 4. Testes (RED)

`src/domain/lead/stage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTerminal, nextStage, stageForEstimateEvent } from "./stage";

describe("stageForEstimateEvent", () => {
  it("mapeia evento -> estágio", () => {
    expect(stageForEstimateEvent("sent")).toBe("estimate_sent");
    expect(stageForEstimateEvent("accepted")).toBe("won");
    expect(stageForEstimateEvent("declined")).toBe("lost");
  });
});

describe("isTerminal", () => {
  it("won/lost são terminais", () => {
    expect(isTerminal("won")).toBe(true);
    expect(isTerminal("lost")).toBe(true);
    expect(isTerminal("new_lead")).toBe(false);
  });
});

describe("nextStage", () => {
  it("avança normalmente", () => {
    expect(nextStage("new_lead", "sent")).toBe("estimate_sent");
    expect(nextStage("estimate_sent", "accepted")).toBe("won");
  });
  it("NÃO rebaixa um lead já em won", () => {
    expect(nextStage("won", "declined")).toBe("won");
    expect(nextStage("won", "sent")).toBe("won");
  });
});
```

Rode e **confirme que falha**:

```bash
bunx vitest run src/domain/lead/stage.test.ts
```

Esperado: **FAIL** (`Cannot find module './stage'`).

## 5. Seu desafio (GREEN)

1. `types.ts` e `errors.ts` (o erro com `this.name`).
2. `stage.ts`:
   - `LEAD_STAGES` na ordem da seção 2.2.
   - `stageForEstimateEvent`: os três mapeamentos.
   - `isTerminal`: `won` ou `lost`.
   - `nextStage`: **primeiro** a guarda (`current === "won"` → devolve `"won"`), **senão**
     delegue a `stageForEstimateEvent(event)`.

**Dicas:**

- `nextStage` é curtíssimo: uma checagem da guarda + uma chamada. Não duplique o mapa de eventos —
  reuse `stageForEstimateEvent`. DRY.
- Não crie `assertTransition` para leads — o board é drag livre (releia 2.2).

```bash
bunx vitest run src/domain/lead/stage.test.ts
```

Esperado: **PASS**.

## 6. Refactor & boas práticas

- **Uma fonte da verdade do auto-avanço.** Toda a regra "evento → estágio" mora em
  `stageForEstimateEvent` + `nextStage`. O service (módulo 15) não decide nada — só chama.
- **A guarda é regra de negócio, não detalhe técnico.** Documente o *porquê* (não des-ganhar um lead)
  com um comentário curto.
- **Domínio puro.** Nada de `import` de `infra`/`modules` aqui.

```bash
git add src/domain/lead
git commit -m "feat(lead): domain types, errors and stage helpers (nextStage)"
```

## 7. Checklist de conclusão

- [ ] `LeadStage`, `Lead` (campos de contato planos), `LeadSummary` definidos.
- [ ] `LeadNotFoundError` com `this.name`.
- [ ] `LEAD_STAGES`, `stageForEstimateEvent`, `isTerminal`, `nextStage` implementados.
- [ ] `nextStage("won", "declined") === "won"` passa (a guarda).
- [ ] Nada no domínio importa de `modules/`/`infra/`.

## 8. Para se aprofundar

- **Eventos de domínio (Domain Events):** o padrão por trás do seam; como sistemas grandes
  desacoplam "algo aconteceu" de "quem reage".
- **Kanban vs máquina de estado estrita:** quando permitir movimentação livre e quando restringir.
- **Funções puras de transição:** `(state, event) => state` é a essência de reducers (Redux),
  state machines e event-sourcing.

---

Pronto? Vá para **`15-persistencia-e-seam-de-eventos.md`** — schema, migration e o auto-avanço no service.
