# Módulo 13 — Frontend: estimates e react-router

> **Como usar este guia:** eu **explico o porquê**, te dou os **models** e os **testes (RED)**.
> **Você escreve a implementação.** Gabarito: `docs/plans/2026-06-25-fase-2-estimates.md`, Tasks 9–11.
>
> **Convenção:** o frontend é React 19 + Vite + Tailwind v4 + TanStack Query (Fase 1). Aqui entra o
> **react-router**. Testes com `bunx vitest run`; checagem de tipos com `bunx tsc --noEmit`.

---

## 1. Objetivo

- Adicionar **react-router** e estruturar as telas: nova estimate (reusa a calculadora), lista,
  detalhe (com Send + link público) e a **página pública** isolada de accept/decline.
- Um **client de API** tipado para as rotas da Fase 2.
- Praticar **mutations** do TanStack Query (`useMutation` + `invalidateQueries`).

## 2. Conceitos

### 2.1 react-router: rotas e layout aninhado

O `react-router` mapeia **URL → componente**. Duas ideias centrais:

- **Rotas aninhadas + `<Outlet/>`**: uma rota "pai" desenha o *layout* (nav do app) e um `<Outlet/>`
  onde a rota "filha" renderiza. As telas internas (`/`, `/estimates`, `/estimates/:id`) ficam dentro
  de um `AppShell` com navegação.
- **Rota fora do layout**: a **página pública** (`/e/:token`) fica **fora** do `AppShell` de
  propósito — o cliente não deve ver a navegação interna do admin. É só a estimate e os botões.

`useParams()` lê os parâmetros da URL (`:id`, `:token`); `useNavigate()` redireciona após uma ação
(ex.: criou a estimate → vai para o detalhe).

### 2.2 Por que o front nunca recalcula preço

Continuamos com a regra de ouro: **o backend é a fonte da verdade**. O front manda `input` +
`customer` para `POST /api/estimates`, e o backend devolve a estimate com o `breakdown` pronto. Para
**exibir**, o front só lê `breakdown` (reusando o `BreakdownPanel` e o `formatCents` da Fase 1). Em
nenhum lugar o front soma preço — ele formata o que recebe.

### 2.3 Mutations com TanStack Query

`useQuery` é para **ler** (GET). Para **escrever** (POST/PUT) usamos `useMutation`. O padrão:

```
const m = useMutation({ mutationFn: () => sendEstimate(id),
                        onSuccess: () => qc.invalidateQueries({ queryKey: ["estimate", id] }) });
m.mutate();
```

`invalidateQueries` marca os dados em cache como velhos → o `useQuery` correspondente **refetcha**
sozinho. É assim que a tela reflete a mudança (ex.: status vira `sent`) sem você gerenciar estado na mão.

### 2.4 UI dirigida por estado

A tela muda conforme o `status`:

- **Detalhe admin:** `draft` mostra o botão **Enviar**; `sent`/`accepted`/`declined` mostram o
  **link público** e o status.
- **Página pública:** `sent` mostra **Aceitar/Recusar**; `accepted`/`declined` mostram a confirmação.

O `status` da estimate é o que decide o que renderizar. Pense na UI como uma **função do estado**.

### 2.5 O `number` legível

O backend manda `number` (inteiro). O front formata para `EST-0007` com `formatEstimateNumber` —
uma função pura, fácil de testar (é o nosso TDD aqui). O `id` (uuid) fica nas URLs admin; o `number`
é só para humanos lerem.

## 3. Models

```ts
// frontend/src/lib/estimateNumber.ts
export function formatEstimateNumber(n: number): string; // 7 -> "EST-0007"
```

```ts
// frontend/src/types/estimate.ts — espelham o backend (mesmos campos)
export type EstimateStatus = "draft" | "sent" | "accepted" | "declined";
export interface CustomerInfo { name: string; email: string; phone: string; address: string }
export interface Estimate { /* id, number, publicToken, customer, input, breakdown, status, timestamps */ }
export interface EstimateSummary { id: string; number: number; customerName: string; total: number; status: EstimateStatus; createdAt: string }
export interface PublicEstimateView { number: number; customer: CustomerInfo; breakdown: QuoteBreakdown; status: EstimateStatus }
```

```ts
// frontend/src/lib/estimates.ts — client de API (corpos: chamadas axios; ver plano Task 9)
export function createEstimate(dto): Promise<Estimate>;        // POST /estimates
export function listEstimates(): Promise<EstimateSummary[]>;   // GET /estimates
export function getEstimate(id): Promise<Estimate>;            // GET /estimates/:id
export function updateEstimate(id, dto): Promise<Estimate>;    // PUT /estimates/:id
export function sendEstimate(id): Promise<Estimate>;           // POST /estimates/:id/send
export function getPublicEstimate(token): Promise<PublicEstimateView>; // GET /public/estimates/:token
export function acceptPublic(token): Promise<PublicEstimateView>;      // POST .../accept
export function declinePublic(token): Promise<PublicEstimateView>;     // POST .../decline
```

Páginas a criar (componentes React — JSX é seu; ver plano Tasks 10–11):

- `pages/EstimatesListPage.tsx` — `useQuery(listEstimates)`; linka cada item para `/estimates/:id`.
- `pages/EstimateDetailPage.tsx` — `getEstimate(id)`; botão **Enviar** (`useMutation(sendEstimate)`)
  em `draft`; campo com o **link público** quando não-`draft`.
- `pages/PublicEstimatePage.tsx` — `getPublicEstimate(token)`; botões **Aceitar/Recusar** em `sent`.
- Ajuste em `pages/CalculatorPage.tsx` — bloco de `customer` + botão "Salvar como rascunho"
  (`useMutation(createEstimate)` → `navigate('/estimates/:id')`).

## 4. Testes (RED)

A unidade puramente testável aqui é o formatador. `frontend/src/lib/estimateNumber.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatEstimateNumber } from "./estimateNumber";

describe("formatEstimateNumber", () => {
  it("formata como EST-#### com zero-padding", () => {
    expect(formatEstimateNumber(7)).toBe("EST-0007");
    expect(formatEstimateNumber(1234)).toBe("EST-1234");
    expect(formatEstimateNumber(99999)).toBe("EST-99999");
  });
});
```

Rode e **confirme que falha**:

```bash
cd frontend && bunx vitest run src/lib/estimateNumber.test.ts
```

Esperado: **FAIL** (`Cannot find module './estimateNumber'`).

> As páginas (componentes) não têm teste unitário neste módulo — validamos com `tsc --noEmit`,
> `bun run build` e um **smoke test e2e manual** (seção 5). Testar componentes com
> Testing Library é um próximo passo opcional (seção 8).

## 5. Seu desafio (GREEN)

1. `bun add react-router-dom` (dentro de `frontend/`).
2. **`formatEstimateNumber`** — uma linha (`String(n).padStart(4, "0")`), deixe o teste verde.
3. **Tipos** (`types/estimate.ts`) e **client** (`lib/estimates.ts`) espelhando o backend e as rotas.
4. **Router**: envolva `App` com `<BrowserRouter>` (em `main.tsx`, dentro do `QueryClientProvider`);
   defina as `Routes` em `App.tsx`, com a pública (`/e/:token`) **fora** do `AppShell` (que usa
   `<Outlet/>`).
5. **Páginas**: lista, detalhe (Send + link público), pública (accept/decline), e o bloco de
   `customer` + "Salvar como rascunho" na calculadora. Reuse `BreakdownPanel` e `formatCents`.

**Dicas:**

- O link público é `${window.location.origin}/e/${estimate.publicToken}`.
- Para o detalhe e a pública, troque o que renderiza com base em `status` (seção 2.4).
- Depois de `createEstimate`, use `navigate(\`/estimates/${e.id}\`)`.
- Em mutations que mudam a estimate, `invalidateQueries({ queryKey: [...] })` no `onSuccess` para a
  tela atualizar.

Valide:

```bash
cd frontend && bunx vitest run && bunx tsc --noEmit && bun run build
```

Esperado: testes **verdes**, sem erros de tipo, build conclui.

**Smoke test e2e (manual):** com backend (`bun dev`) e front no ar — crie uma estimate em `/`,
envie em `/estimates/:id`, copie o link, abra `/e/:token` numa aba anônima, aceite. Confira que o
status vira `accepted` (admin e público).

## 6. Refactor & boas práticas

- **Tipos espelhados, não importados.** O front duplica os tipos do backend de propósito (são
  projetos separados). Mantê-los em sincronia é responsabilidade sua; um pacote compartilhado é
  melhoria futura (não agora — YAGNI).
- **O front formata, não calcula.** Nenhuma soma de dinheiro no front. Se você se pegou somando
  `breakdown.*`, está reimplementando o backend — pare.
- **Página pública sem chrome.** Confirme que `/e/:token` **não** mostra a nav do app. É um detalhe
  de produto que importa: o cliente final não é admin.
- **Estados de carregamento/erro.** Trate `isLoading` e `isError` nas queries — uma tela em branco
  ou um crash no `q.data` indefinido é um bug comum.

```bash
cd ..
git add frontend/src
git commit -m "feat(frontend): router, estimates pages and public page"
```

## 7. Checklist de conclusão

- [ ] `formatEstimateNumber` passou pelo ciclo (vermelho → verde).
- [ ] `react-router` instalado; `BrowserRouter` em `main.tsx`; `Routes` em `App.tsx`.
- [ ] `/e/:token` renderiza **fora** do `AppShell` (sem nav do app).
- [ ] Criar (calculadora) → listar → detalhar → **Enviar** → **Aceitar/Recusar** na página pública funciona ponta a ponta.
- [ ] O front **lê** `breakdown` (via `BreakdownPanel`/`formatCents`) e nunca recalcula preço.
- [ ] `bunx tsc --noEmit` e `bun run build` sem erros.

## 8. Para se aprofundar

- **react-router:** rotas aninhadas, `Outlet`, `useParams`, `useNavigate`, layout routes, `loader`s
  (data router) — uma evolução do que fizemos aqui.
- **TanStack Query:** `useMutation`, `invalidateQueries`, optimistic updates, `queryKey` design.
- **Testes de componente:** React Testing Library + `@testing-library/user-event` para simular o
  fluxo de accept/decline sem backend (mockando o client).
- **Compartilhar tipos back↔front:** um pacote `shared` (monorepo) ou geração de tipos a partir do
  backend (ex.: a partir dos schemas Zod) — elimina a duplicação manual.

---

🎉 **Fim da Fase 2.** Você saiu de um cálculo efêmero para um documento persistido, com ciclo de
vida e uma página pública. Próxima fase: **Leads + Pipeline** (Kanban, transições de estágio,
relação com estimates) — quando você abrir a Fase 3, ela ganha seu próprio spec → plano → guias.
