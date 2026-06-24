# 07 — Frontend: a Calculadora (preview ao vivo)

> **Como usar este guia:** continua o curso prático. Eu te dou o **setup**, os **models**
> (tipos TS), **um teste real** (`formatCents`) e te ensino os **conceitos** (TanStack Query,
> debounce). Mas a **implementação dos componentes você escreve**. O plano
> (`docs/plans/2026-06-22-fase-1-calculadora.md`, Tasks 9 e 10) é o *gabarito* — só abra quando
> travar de verdade. Você aprende escrevendo o `.tsx`, não copiando.

---

## 1. Objetivo

Ao terminar este módulo você vai ter:

- Um app **React 19 + Vite + TypeScript + Tailwind v4** rodando, com **proxy** de `/api` para o
  backend Node (Fastify) em `:8080`.
- O **Vitest** configurado e um teste verde do util de dinheiro (`formatCents`).
- Os **tipos TS** do domínio espelhando os tipos do backend (Node/TypeScript) em
  `src/pricing/types.ts`.
- O cliente **axios** e o **TanStack Query** (`QueryClientProvider` + `useQuery`).
- Um hook **`useDebounce`** para não disparar uma request por tecla.
- A tela **`CalculatorPage`** com **breakdown ao vivo**: você digita à esquerda, o painel à direita
  recalcula chamando `POST /api/quotes/calculate`.

O contexto de produto está no spec (`docs/specs/2026-06-22-estimate-engine-calculadora-design.md`,
seção 6.8). O backend já está pronto pelos guias 01–06 — aqui só **consumimos** a API.

## 2. Conceitos

### 2.1 O frontend nunca reimplementa a fórmula

Regra do projeto (guia 00, seção 5): **o backend é a fonte da verdade do cálculo**. O front não
soma `basePrice + sqft*perSqft + ...`. Ele monta um `QuoteInput`, manda para `POST
/api/quotes/calculate` e **renderiza o `QuoteBreakdown`** que volta. Se a fórmula mudar, muda só no
backend (Node). O front continua igual.

### 2.2 Money no frontend: a API manda cents, o front divide por 100

O backend transporta dinheiro como **inteiro em cents** (`19000` = $190.00) — nunca float, para não
acumular erro de ponto flutuante. No front, dinheiro chega como `number` (cents). Para **exibir**,
dividimos por 100 **na hora de formatar** e usamos `Intl.NumberFormat` para colocar o `$` e as duas
casas. Importante: a divisão por 100 é só para *display*. Não guardamos dólares em estado, não
fazemos conta com eles — qualquer cálculo é do backend.

`Intl.NumberFormat` é a API nativa do navegador para formatar números por *locale*. Com `style:
"currency"` e `currency: "USD"` ela cuida do símbolo, separador e casas decimais.

### 2.3 TanStack Query: cache de estado do servidor

`useQuery` resolve o problema de "buscar dados do servidor e manter sincronizado" sem você escrever
`useEffect` + `useState` + tratamento de loading/erro na mão. Os conceitos:

- **`QueryClientProvider`** — envolve o app e guarda o cache de todas as queries.
- **`queryKey`** — um array que **identifica** a query no cache. Se a key muda, o Query **refaz** o
  fetch. Essa é a peça que vamos usar para o cálculo ao vivo.
- **`queryFn`** — a função `async` que efetivamente busca os dados (aqui, a chamada axios).

A forma geral, para você reconhecer no código:

```ts
const result = useQuery({
  queryKey: ["pricing-config"],
  queryFn: async () => (await api.get("/pricing-config")).data,
});
// result.data, result.isLoading, result.error
```

### 2.4 Debounce: por que não chamar `/calculate` a cada tecla

Se a calculadora chamasse a API a cada caractere digitado em "Sqft", um número de 4 dígitos
dispararia 4 requests — a maioria descartável. **Debounce** significa: *espere o usuário parar de
digitar por X ms antes de agir*. Implementa-se com `setTimeout` no `useEffect` e `clearTimeout` no
cleanup: cada nova tecla cancela o timer anterior e reinicia a contagem. Só quando ele "descansa"
300ms o valor "debounced" atualiza — e é esse valor que entra na `queryKey` do cálculo.

## 3. Setup (comandos e config — pode seguir à risca)

Isto é *setup/config*, então o guia mostra na íntegra. Rode a partir da raiz do repositório.

### 3.1 Scaffold do Vite + dependências

```bash
cd ~/Dev/estimate-engine
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @tanstack/react-query axios
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install tailwindcss @tailwindcss/vite
```

### 3.2 `vite.config.ts` — proxy + Tailwind + Vitest

Note o `/// <reference types="vitest/config" />` e o import de `vitest/config` (não de `vite`):
isso habilita o bloco `test` com tipagem. O `proxy` faz o navegador chamar `/api/...` no dev server
do Vite (`:5173`), que **encaminha** para o backend Node (Fastify) em `:8080` — assim não há
problema de CORS no dev e o cliente axios pode usar `baseURL: "/api"`.

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": "http://localhost:8080" },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

### 3.3 Tailwind v4 e script de teste

No Tailwind v4 você **não** precisa de `tailwind.config.js` para começar nem das diretivas antigas
(`@tailwind base; ...`). Basta uma linha no topo de `frontend/src/index.css`:

```css
@import "tailwindcss";
```

E adicione o script de teste em `frontend/package.json`, dentro de `"scripts"`:

```json
"test": "vitest"
```

## 4. Models (tipos que você vai usar — mostre na íntegra)

Estes tipos **espelham os tipos do backend (Node/TypeScript) em `src/pricing/types.ts`** (guia 02).
Como o backend também é TypeScript, eles são **literalmente os mesmos tipos** — os nomes de campo já
são `camelCase` e a API serializa em JSON exatamente assim, sem nenhuma camada de tradução. (Numa
fase futura dá pra extrair esses tipos para um pacote compartilhado entre back e front; na Fase 1
duplicamos.) Crie `frontend/src/types.ts` com exatamente isto:

```ts
export type ServiceType = "deep_clean" | "recurring" | "move_in_out";
export type Frequency = "one_time" | "weekly" | "bi_weekly" | "monthly";

export interface AddOn {
  id: string;
  name: string;
  price: number; // cents
}

export interface SelectedAddOn {
  addOnId: string;
  quantity: number;
}

export interface PricingConfig {
  basePrice: number;
  perSqft: number;
  perBedroom: number;
  perBathroom: number;
  perPet: number;
  serviceMultipliers: Record<ServiceType, number>;
  frequencyDiscounts: Record<Frequency, number>;
  minimumPrice: number;
  addOns: AddOn[];
}

export interface QuoteInput {
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  pets: number;
  service: ServiceType;
  frequency: Frequency;
  addOns: SelectedAddOn[];
  manualDiscount: number;
}

export interface AddOnLine {
  addOnId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface QuoteBreakdown {
  base: number;
  sqftCharge: number;
  bedroomsCharge: number;
  bathroomsCharge: number;
  petsCharge: number;
  subtotal: number;
  serviceMultiplier: number;
  afterMultiplier: number;
  frequencyDiscountPct: number;
  frequencyDiscountAmount: number;
  addOns: AddOnLine[];
  addOnsTotal: number;
  manualDiscount: number;
  total: number;
}
```

> **Por que todos os money fields são `number`?** Porque a API manda cents como inteiro. `number`
> em TS comporta esses inteiros sem problema. A formatação para dólar é responsabilidade do
> `formatCents`, não do tipo.

### O cliente axios

Crie `frontend/src/lib/api.ts`. É só uma instância com `baseURL` apontando para `/api` (que o proxy
encaminha):

```ts
import axios from "axios";

export const api = axios.create({ baseURL: "/api" });
```

## 5. Testes (RED) — o util `formatCents`

No frontend, o teste **forte e automatizado** é o do `formatCents` (lógica pura, fácil de testar). A
verificação dos componentes é **manual** (seção 7) — eles dependem de backend + Postgres no ar e de
interação visual.

Crie `frontend/src/lib/money.test.ts` com este teste pronto:

```ts
import { describe, it, expect } from "vitest";
import { formatCents } from "./money";

describe("formatCents", () => {
  it("formata cents como dólares", () => {
    expect(formatCents(19000)).toBe("$190.00");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(34200)).toBe("$342.00");
    expect(formatCents(550)).toBe("$5.50");
  });
});
```

Rode e veja **falhar** (o módulo ainda não existe):

```bash
cd ~/Dev/estimate-engine/frontend && npx vitest run src/lib/money.test.ts
```

Esperado: FAIL — `Cannot find module './money'`.

## 6. Seu desafio (GREEN)

### 6.1 Implemente `formatCents` (1–2 linhas)

Crie `frontend/src/lib/money.ts` exportando `formatCents(cents: number): string`.

**Dica:** use `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })` e chame
`.format(...)` passando `cents / 100`. A divisão por 100 é o único lugar onde os cents viram
dólares. Rode de novo até ficar **PASS**:

```bash
cd ~/Dev/estimate-engine/frontend && npx vitest run src/lib/money.test.ts
```

### 6.2 Provider do React Query (`main.tsx`)

Em `frontend/src/main.tsx` você precisa: criar um `const queryClient = new QueryClient()` e
**envolver** o `<App />` com `<QueryClientProvider client={queryClient}>`. Mantenha o `<StrictMode>`
e o `import "./index.css"` que o scaffold já criou. Sem esse provider, nenhum `useQuery` funciona.

### 6.3 Hook `useDebounce` (você escreve)

Crie `frontend/src/lib/useDebounce.ts` exportando `useDebounce<T>(value: T, delayMs: number): T`.

**Anatomia:**
- Guarda um estado interno `debounced` inicializado com `value`.
- Um `useEffect` com dependências `[value, delayMs]`: dentro, `setTimeout` que faz
  `setDebounced(value)` após `delayMs`; **retorne** uma função de cleanup que faz `clearTimeout`.
- Retorna `debounced`.

A mágica está no cleanup: a cada novo `value` o React roda o cleanup do efeito anterior (cancelando
o timer) antes de criar o novo. Resultado: só dispara quando o valor "assenta".

### 6.4 `BreakdownPanel` — descreva, depois escreva

Componente de **apresentação puro**. Recebe um único prop: `b: QuoteBreakdown`. Não tem estado, não
faz fetch.

**Anatomia:**
- Um sub-componente interno `Row` que recebe `label` e `value` (ambos string) e renderiza uma linha
  com `label` à esquerda e `value` à direita (use `flex justify-between`).
- O painel renderiza uma `Row` para cada item do breakdown: Base, Sqft, Bedrooms, Bathrooms, Pets,
  depois um divisor, Subtotal, a linha do multiplicador (label tipo `Multiplier ×${b.serviceMultiplier}`),
  a linha de desconto (label com `${(b.frequencyDiscountPct * 100).toFixed(0)}%`, valor prefixado
  com `-`).
- Para os add-ons: `b.addOns.map(...)` gerando uma `Row` por linha (`key={a.addOnId}`, label
  `${a.name} ×${a.quantity}`, valor `formatCents(a.lineTotal)`).
- Mostre "Manual discount" **só se** `b.manualDiscount > 0`.
- No fim, um divisor e o **Total** em destaque (fonte maior/negrito), com `formatCents(b.total)`.

**Regra de ouro:** todo valor monetário passa por `formatCents`. Nunca imprima `b.total` cru.

### 6.5 `CalculatorPage` — a peça central (descreva, depois escreva)

Esta é a tela. Junta estado local, duas queries e o debounce.

**Estado:**
- Um único `useState<QuoteInput>` chamado, p.ex., `input`, com defaults sensatos
  (`sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0, service: "deep_clean", frequency: "one_time",
  addOns: [], manualDiscount: 0`).
- `const debounced = useDebounce(input, 300)`.

**Duas queries:**
1. **config** — `useQuery<PricingConfig>` com `queryKey: ["pricing-config"]` e `queryFn` que faz
   `api.get("/pricing-config")`. Você só usa `config.data?.addOns` para **listar as checkboxes** de
   add-ons disponíveis.
2. **quote** — `useQuery<QuoteBreakdown>` com `queryKey: ["calculate", debounced]` e `queryFn` que
   faz `api.post("/quotes/calculate", debounced)`.

> **O detalhe que faz tudo funcionar:** `debounced` está **dentro da `queryKey`** da segunda query.
> Quando o usuário digita, `input` muda na hora (UI responsiva), mas `debounced` só muda 300ms
> depois. Como o TanStack Query refaz o fetch sempre que a `queryKey` muda, o cálculo dispara
> exatamente uma vez por "pausa de digitação". É o casamento debounce + queryKey.

**Handlers:**
- Um helper para inputs numéricos: dado um campo `k: keyof QuoteInput`, devolve um `onChange` que
  faz `setInput(s => ({ ...s, [k]: Number(e.target.value) }))`. Lembre: `Number(...)` porque o
  `value` de um `<input>` é sempre string.
- `toggleAddOn(id)`: se o add-on já está em `input.addOns`, remove (filter); senão adiciona
  `{ addOnId: id, quantity: 1 }`. Sempre criando um **novo array** (imutabilidade — nunca
  `push` direto no estado).

Exemplo do padrão de input controlado (para você reconhecer):

```tsx
<input
  type="number"
  value={input.sqft}
  onChange={(e) => setInput((s) => ({ ...s, sqft: Number(e.target.value) }))}
/>
```

**Render:**
- Layout em duas colunas (grid). Coluna esquerda: inputs numéricos (sqft/bedrooms/bathrooms/pets),
  dois `<select>` (service e frequency — itere sobre arrays de constantes), e a lista de checkboxes
  de add-ons (cada checkbox `checked` se houver match em `input.addOns`, `onChange` chama
  `toggleAddOn(a.id)`).
- Coluna direita: se `quote.data` existe, renderize `<BreakdownPanel b={quote.data} />`; senão um
  placeholder "Calculando…".

### 6.6 Monte em `App.tsx`

Por enquanto, `App` só precisa renderizar `<CalculatorPage />` dentro de um wrapper de tela cheia
(ex.: `min-h-screen bg-zinc-950`). A navegação por abas vem no guia 08.

## 7. Verificação manual (com backend + Postgres no ar)

Não há teste automatizado de componente aqui — a verificação é **observar a tela funcionando**.

Suba tudo (três peças: Postgres, backend Node, dev server):

```bash
# Postgres (se ainda não estiver rodando — ver guia 00, seção 7)
docker start ee-pg

# terminal 1 — backend
cd ~/Dev/estimate-engine/backend \
  && export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine' \
  && npm run dev

# terminal 2 — frontend
cd ~/Dev/estimate-engine/frontend && npm run dev
```

Abra `http://localhost:5173` e confira:

1. Inputs **1000 / 2 / 1 / 0**, **Deep Clean**, **One-time** → o painel mostra **Total $190.00**
   (o golden case Helena).
2. Marque a checkbox **"Inside Fridge"** → o total sobe para **$220.00** (190 + 30 do add-on).

Se o painel ficar preso em "Calculando…", abra o DevTools → Network: veja se `/api/quotes/calculate`
está retornando 200. Erro de conexão geralmente é backend fora do ar ou `DATABASE_URL` faltando.

## 8. Checklist de conclusão

- [ ] `npx vitest run src/lib/money.test.ts` passa (`formatCents` verde).
- [ ] `npm run dev` sobe sem erros e o Tailwind aplica estilos.
- [ ] `QueryClientProvider` envolve o app; nenhum erro de "No QueryClient set".
- [ ] Digitar nos inputs **não** dispara uma request por tecla (debounce funcionando — confira no
      Network).
- [ ] Golden case mostra **$190.00**; marcar "Inside Fridge" mostra **$220.00**.
- [ ] Todo valor monetário na tela passa por `formatCents` (nenhum número cru).

## Para se aprofundar

- **TanStack Query** — `queryKey`, cache, `staleTime` e refetch. Entenda *por que* a key dirige o
  refetch; é o conceito que mais paga no resto do app.
- **`Intl.NumberFormat`** — locales, `minimumFractionDigits`, outras moedas.
- **Debounce vs throttle** — quando usar cada um. Aqui debounce é o certo (esperar o usuário parar).
- **Controlled components** em React — por que `value` + `onChange` e por que `Number(...)`.

---

Pronto? Vá para **`08-frontend-config.md`** para a tela de configuração e o CRUD do catálogo de
add-ons.
