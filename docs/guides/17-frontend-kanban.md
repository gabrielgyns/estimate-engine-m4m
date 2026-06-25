# Módulo 17 — Frontend: Kanban e a estimate vinculada ao lead

> **Como usar este guia:** eu **explico o porquê**, te dou os **models** e os **testes (RED)**.
> **Você escreve a implementação.** Gabarito: `docs/plans/2026-06-25-fase-3-leads-pipeline.md`, Tasks 6–8.
>
> **Convenção:** React 19 + Vite + Tailwind + TanStack Query + react-router (Fases 1–2). Aqui entra o
> **`@dnd-kit/core`**. Tipos: `bunx tsc --noEmit`; build: `bun run build`.

---

## 1. Objetivo

- Um **Kanban** (`/pipeline`) com **drag-and-drop** (`dnd-kit`): arrastar um lead muda seu estágio.
- A **tela de lead** (`/leads/:id`) com seus dados, suas estimates e o botão "Nova estimate".
- O **form de novo lead** e a criação de estimate **vinculada** ao lead (a calculadora lê `leadId`).

## 2. Conceitos

### 2.1 `dnd-kit`: as três peças

`@dnd-kit/core` tem três peças que se encaixam:

- **`<DndContext onDragEnd={...}>`** — envolve o board e te avisa quando um arraste termina.
- **`useDraggable({ id })`** — torna um elemento arrastável (o `LeadCard`). Devolve `listeners`,
  `attributes`, `setNodeRef` e um `transform` (a posição enquanto arrasta).
- **`useDroppable({ id })`** — torna um elemento uma "zona de soltura" (cada **coluna** = um estágio).

No `onDragEnd`, você recebe `active` (o card arrastado) e `over` (a coluna onde soltou). Daí: o `id`
do card é o `leadId`, e o `id` da coluna é o `stage` de destino. Você chama `moveStage(leadId, stage)`.

### 2.2 Otimismo? Não — `invalidateQueries`

Ao soltar o card, chamamos a mutation `moveStage` e, no `onSuccess`, `invalidateQueries(["leads"])` —
o board refetcha e mostra o card na nova coluna. (Dá para fazer *optimistic update* para o card "pular"
na hora, antes do servidor responder; é um próximo passo opcional — começamos pelo simples e correto.)

### 2.3 Filtrar por coluna no cliente

A query `listLeads()` traz **todos** os leads (summaries). O board renderiza cinco colunas e, em cada
uma, mostra `leads.filter(l => l.stage === coluna)`. O `stage` de cada lead decide em que coluna ele
aparece — a UI é uma **função do estado** (releia o módulo 13, §2.4). Mudou o stage no servidor →
refetch → o card aparece na coluna nova.

### 2.4 A estimate agora nasce de um lead

Na Fase 2 a calculadora tinha um bloco `customer` solto. Agora o contato vem do **lead**, então a
calculadora **lê o `leadId` da URL** (`/?leadId=...`, vindo do botão "Nova estimate para este lead").
O bloco de customer **sai**. Se a calculadora for aberta **sem** `leadId` (direto em `/`), o botão de
salvar fica desabilitado — você cria estimate **a partir de um lead**, não solta. Isso reflete no front
a mesma regra que o backend já impõe (`leadId` obrigatório).

### 2.5 Ler query params: `useSearchParams`

`useSearchParams()` do react-router lê a query string. `params.get("leadId")` devolve o id (ou `null`).
É assim que a tela de detalhe do lead "passa" o lead para a calculadora sem estado global: um link
`/?leadId=${id}`.

## 3. Models

```ts
// frontend/src/types/lead.ts
export type LeadStage = "new_lead" | "contacted" | "estimate_sent" | "won" | "lost";
export const LEAD_STAGES: LeadStage[] = ["new_lead", "contacted", "estimate_sent", "won", "lost"];
export const STAGE_LABELS: Record<LeadStage, string> = {
  new_lead: "New", contacted: "Contacted", estimate_sent: "Estimate sent", won: "Won", lost: "Lost",
};
export interface LeadContact { name: string; email: string; phone: string; address: string }
export interface Lead { id: string; contact: LeadContact; source: string | null; notes: string | null; stage: LeadStage; createdAt: string; updatedAt: string }
export interface LeadSummary { id: string; name: string; stage: LeadStage; createdAt: string }
```

```ts
// frontend/src/lib/leads.ts — client (corpos: chamadas axios; ver plano Task 6)
export function createLead(dto): Promise<Lead>;            // POST /leads
export function listLeads(): Promise<LeadSummary[]>;       // GET /leads
export function getLead(id): Promise<Lead>;                // GET /leads/:id
export function updateLead(id, dto): Promise<Lead>;        // PUT /leads/:id
export function moveStage(id, stage): Promise<Lead>;       // PATCH /leads/:id/stage
export function listLeadEstimates(id): Promise<EstimateSummary[]>; // GET /leads/:id/estimates
```

```ts
// frontend/src/lib/estimates.ts — createEstimate muda de assinatura
export function createEstimate(dto: { leadId: string; input: QuoteInput }): Promise<Estimate>;
```

Páginas/componentes a criar (JSX seu; ver plano Tasks 7–8):

- `components/LeadCard.tsx` — card arrastável (`useDraggable`).
- `pages/PipelinePage.tsx` — `<DndContext>` + colunas `useDroppable`; `onDragEnd` → `moveStage`.
- `pages/NewLeadPage.tsx` — form de contato → `createLead` → navega pro detalhe.
- `pages/LeadDetailPage.tsx` — dados do lead + `listLeadEstimates` + link "Nova estimate" (`/?leadId=`).
- ajuste em `pages/CalculatorPage.tsx` — lê `leadId` via `useSearchParams`; remove o bloco customer.

## 4. Testes (RED)

O front desta fase é majoritariamente integração visual (DnD), validada por `tsc`/`build` e **smoke
test e2e manual**. Não há uma unidade pura nova obrigatória aqui — diferente do `formatEstimateNumber`
da Fase 2. (Se quiser praticar testes de componente, veja a seção 8.)

O "RED" prático é a **checagem de tipos** logo após mudar a assinatura de `createEstimate`:

```bash
cd frontend && bunx tsc --noEmit
```

Esperado: **erros** apontando os lugares que ainda chamam `createEstimate({ customer, input })` ou que
referenciam páginas inexistentes — sua lista de tarefas até o verde.

## 5. Seu desafio (GREEN)

1. `bun add @dnd-kit/core`.
2. **Tipos** (`types/lead.ts`) e **client** (`lib/leads.ts`); ajuste `createEstimate` para `{ leadId, input }`.
3. **Rotas** em `App.tsx`: `/pipeline`, `/leads/new`, `/leads/:id` (dentro do `AppShell`); link
   "Pipeline" no nav.
4. **Kanban**: `LeadCard` (`useDraggable`) + `PipelinePage` (`DndContext` + colunas `useDroppable`).
   No `onDragEnd`, pegue `active.id` (leadId) e `over.id` (stage) e chame a mutation `moveStage`.
5. **Detalhe + novo lead**: `LeadDetailPage` (dados + estimates + link `/?leadId=`), `NewLeadPage`.
6. **Calculadora**: leia `leadId` com `useSearchParams`; remova o bloco customer; desabilite o salvar
   sem `leadId`.

**Dicas:**

- Cada coluna é um `useDroppable({ id: stage })`; o `id` **é** o estágio — assim `over.id` já é o destino.
- Valide `LEAD_STAGES.includes(over.id)` antes de chamar `moveStage` (ignore drops fora das colunas).
- No `LeadCard`, o `<Link>` interno precisa de `onClick={(e) => e.stopPropagation()}` para clicar sem
  disparar o arraste.

```bash
cd frontend && bunx tsc --noEmit && bun run build
```

Esperado: sem erros; build conclui.

**Smoke test e2e (manual):** crie um lead em `/leads/new` → no detalhe, "Nova estimate para este lead"
→ calcule e salve → a estimate aparece na lista do lead → envie a estimate → no `/pipeline`, o lead foi
para **estimate_sent** → aceite na página pública → o lead foi para **won**.

## 6. Refactor & boas práticas

- **UI = função do estado.** Não guarde "em que coluna o card está" num estado local; derive de
  `lead.stage`. Uma fonte da verdade (o servidor), refletida após o refetch.
- **O front espelha a regra do back.** `leadId` obrigatório no backend → botão desabilitado sem lead no
  front. Coerência entre as camadas evita telas que deixam o usuário fazer algo que a API recusa.
- **Acessibilidade do DnD.** `dnd-kit` traz suporte a teclado/`aria` via `attributes`/`listeners` —
  espalhe-os no nó arrastável (não reinvente o arraste com eventos crus de mouse).

```bash
cd .. && git add frontend/src
git commit -m "feat(frontend): Kanban pipeline, lead detail and lead-linked estimates"
```

## 7. Checklist de conclusão

- [ ] `/pipeline` mostra 5 colunas; arrastar um card muda o estágio e **persiste** (recarregou, ficou).
- [ ] `/leads/new` cria lead; `/leads/:id` mostra dados + estimates do lead.
- [ ] "Nova estimate para este lead" abre a calculadora com `leadId`; salvar cria a estimate vinculada.
- [ ] Calculadora sem `leadId` não deixa salvar (espelha o backend).
- [ ] Enviar/aceitar uma estimate move o lead no board (auto-avanço da Fase 3).
- [ ] `bunx tsc --noEmit` e `bun run build` sem erros.

## 8. Para se aprofundar

- **`dnd-kit`:** `DragOverlay` (preview do card), sensores (mouse/touch/teclado), `@dnd-kit/sortable`
  para reordenar dentro da coluna.
- **Optimistic updates** no TanStack Query: mover o card na hora, com rollback se a API falhar.
- **Testes de componente:** React Testing Library para o fluxo de criação de lead; simular DnD é mais
  complexo (vale focar em lógica e deixar o arraste para o e2e).
- **Query params como estado de UI:** quando usar a URL (compartilhável, navegável) vs estado local.

---

🎉 **Fim da Fase 3.** Você montou um funil: leads entram, viram estimates, e o board reflete o avanço
automaticamente. Próxima fase: **Convert → Customer** (o "won" cria um `Customer`, a ponte com o m4m,
formalizando o seam de eventos) — quando abrir a Fase 4, ela ganha seu próprio spec → plano → guias.
