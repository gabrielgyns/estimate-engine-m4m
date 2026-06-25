# Fase 1 — Calculadora — Implementation Plan (Node)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o coração do Estimate Engine — uma engine de preços pura e testada (TDD), exposta por uma API Fastify, com telas React para calcular ao vivo e gerenciar a configuração (rates, multiplicadores, descontos e catálogo de add-ons).

**Architecture:** Backend Node + TypeScript organizado por papel: `src/domain` (regras puras, sem framework), `src/modules` (features = fatias verticais: rotas + zod + repository), `src/infra` (db, http, env). A engine de preços (`src/domain/pricing`) não conhece HTTP nem DB. Dinheiro é `number` em cents inteiros. Validação em duas camadas: Zod na fronteira HTTP + `PricingError` na engine, mapeado para 400 por um error-handler central. Frontend React (Vite) consome `POST /api/quotes/calculate` (preview ao vivo) e `GET/PUT /api/pricing-config`.

**Tech Stack:** Node 20+, TypeScript (ESM), Fastify, `@fastify/cors`, Zod, Drizzle ORM + drizzle-kit + `pg`, Postgres 15+, Vitest, `tsx`; React 19, Vite, Tailwind v4, TanStack Query, axios.

## Global Constraints

- Prosa em português (Brasil); código, nomes de campos, identificadores e termos técnicos em inglês.
- **Estrutura por papel** (ver `docs/guides/09-organizacao-do-projeto.md`):
  - `src/domain/` — regras de negócio puras (zero framework). Não importa `modules`/`infra`.
  - `src/modules/<feature>/` — fatias verticais (rotas Fastify + schemas Zod + repository).
  - `src/infra/` — encanamento (db, http server + plugins, env).
  - Regra de dependência: `index → infra → modules → domain` (seta sempre pra dentro).
- Dinheiro **sempre** como `number` inteiro em cents; nunca decimais quebrados. Float só no `serviceMultiplier`/`frequencyDiscount`, com `roundHalfUp` imediato de volta para cents.
- A API transporta dinheiro como **inteiro em cents** (ex.: `19000` = $190.00). O frontend formata dividindo por 100.
- O backend é a **fonte da verdade do cálculo**; o frontend nunca reimplementa a fórmula.
- Backend em **ESM** (`"type": "module"`). Imports relativos com extensão `.js` (resolução NodeNext).
- Decisões de domínio (do spec): multiplicador incide sobre subtotal inteiro (com pets); desconto de frequência incide sobre `afterMultiplier`; add-ons são valor fixo somado após multiplicador e desconto; add-ons configuráveis (catálogo) em JSONB.
- Golden case (Helena): Deep Clean, One-time, 1000 sqft, 2 quartos, 1 banheiro, 0 pets, sem add-ons → **19000 cents** ($190.00).
- Spec de referência: `docs/specs/2026-06-22-estimate-engine-calculadora-design.md`.

---

### Task 1: Scaffold do backend + tipo Money + roundHalfUp (TDD)

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/domain/pricing/money.ts`
- Test: `backend/src/domain/pricing/money.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: `type Money = number` (cents); `roundHalfUp(value: number): Money`.

- [ ] **Step 1: Inicializar repo e projeto Node**

```bash
cd ~/Dev/estimate-engine
git init
printf "node_modules/\ndist/\n.env\n" > .gitignore
mkdir -p backend/src/domain/pricing
cd backend
npm init -y
npm pkg set type="module"
npm install -D typescript tsx vitest @types/node
```

- [ ] **Step 2: tsconfig**

`backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

Adicionar scripts em `backend/package.json` (campo `"scripts"`):

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Escrever o teste que falha**

`backend/src/domain/pricing/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { roundHalfUp } from "./money.js";

describe("roundHalfUp", () => {
  it("arredonda cents (half up) para o inteiro mais próximo", () => {
    expect(roundHalfUp(19000)).toBe(19000);
    expect(roundHalfUp(150.4)).toBe(150);
    expect(roundHalfUp(150.5)).toBe(151);
    expect(roundHalfUp(0)).toBe(0);
    expect(roundHalfUp(34199.5)).toBe(34200);
  });
});
```

- [ ] **Step 4: Rodar o teste e verificar que falha**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/money.test.ts`
Expected: FAIL (`Cannot find module './money.js'`).

- [ ] **Step 5: Implementação mínima**

`backend/src/domain/pricing/money.ts`:

```ts
// Money é um valor monetário em cents (inteiro). Nunca use decimais quebrados para dinheiro.
export type Money = number;

// roundHalfUp arredonda um valor em cents (possivelmente fracionário) para o cent inteiro
// mais próximo. Math.round faz "half away from zero" — para valores positivos = half up.
export function roundHalfUp(value: number): Money {
  return Math.round(value);
}
```

- [ ] **Step 6: Rodar o teste e verificar que passa**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/money.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/Dev/estimate-engine
git add .gitignore backend/package.json backend/tsconfig.json backend/package-lock.json backend/src/domain/pricing/money.ts backend/src/domain/pricing/money.test.ts
git commit -m "feat(pricing): scaffold backend, Money type and roundHalfUp"
```

---

### Task 2: Tipos do domínio + defaultConfig

**Files:**
- Create: `backend/src/domain/pricing/types.ts`
- Create: `backend/src/domain/pricing/config.ts`
- Test: `backend/src/domain/pricing/config.test.ts`

**Interfaces:**
- Consumes: `Money`.
- Produces: `ServiceType`, `Frequency`, `AddOn`, `SelectedAddOn`, `PricingConfig`, `QuoteInput`, `AddOnLine`, `QuoteBreakdown`; `defaultConfig(): PricingConfig`.

- [ ] **Step 1: Escrever o teste que falha**

`backend/src/domain/pricing/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "./config.js";

describe("defaultConfig", () => {
  it("traz os valores-semente do protótipo", () => {
    const cfg = defaultConfig();
    expect(cfg.basePrice).toBe(8000);
    expect(cfg.perSqft).toBe(6);
    expect(cfg.serviceMultipliers.move_in_out).toBe(1.8);
    expect(cfg.frequencyDiscounts.weekly).toBe(0.2);
    expect(cfg.addOns.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/config.test.ts`
Expected: FAIL (`Cannot find module './config.js'`).

- [ ] **Step 3: Implementar os tipos**

`backend/src/domain/pricing/types.ts`:

```ts
import type { Money } from "./money.js";

export type ServiceType = "deep_clean" | "recurring" | "move_in_out";
export type Frequency = "one_time" | "weekly" | "bi_weekly" | "monthly";

export interface AddOn {
  id: string;
  name: string;
  price: Money; // por unidade
}

export interface SelectedAddOn {
  addOnId: string;
  quantity: number;
}

export interface PricingConfig {
  basePrice: Money;
  perSqft: Money;
  perBedroom: Money;
  perBathroom: Money;
  perPet: Money;
  serviceMultipliers: Record<ServiceType, number>;
  frequencyDiscounts: Record<Frequency, number>;
  minimumPrice: Money;
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
  manualDiscount: Money;
}

export interface AddOnLine {
  addOnId: string;
  name: string;
  unitPrice: Money;
  quantity: number;
  lineTotal: Money;
}

export interface QuoteBreakdown {
  base: Money;
  sqftCharge: Money;
  bedroomsCharge: Money;
  bathroomsCharge: Money;
  petsCharge: Money;
  subtotal: Money;
  serviceMultiplier: number;
  afterMultiplier: Money;
  frequencyDiscountPct: number;
  frequencyDiscountAmount: Money;
  addOns: AddOnLine[];
  addOnsTotal: Money;
  manualDiscount: Money;
  total: Money;
}
```

- [ ] **Step 4: Implementar defaultConfig**

`backend/src/domain/pricing/config.ts`:

```ts
import type { PricingConfig } from "./types.js";

// Config-semente usada quando ainda não há config no banco. Valores do protótipo Estimate Engine.
export function defaultConfig(): PricingConfig {
  return {
    basePrice: 8000, // $80.00
    perSqft: 6, // $0.06
    perBedroom: 1500, // $15.00
    perBathroom: 2000, // $20.00
    perPet: 500, // $5.00
    serviceMultipliers: {
      deep_clean: 1.0,
      recurring: 1.0,
      move_in_out: 1.8,
    },
    frequencyDiscounts: {
      one_time: 0.0,
      weekly: 0.2,
      bi_weekly: 0.1,
      monthly: 0.05,
    },
    minimumPrice: 0,
    addOns: [
      { id: "inside_fridge", name: "Inside Fridge", price: 3000 },
      { id: "inside_oven", name: "Inside Oven", price: 2500 },
      { id: "interior_windows", name: "Interior Windows", price: 500 },
    ],
  };
}
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/Dev/estimate-engine
git add backend/src/domain/pricing/types.ts backend/src/domain/pricing/config.ts backend/src/domain/pricing/config.test.ts
git commit -m "feat(pricing): add domain types and defaultConfig"
```

---

### Task 3: Engine — subtotal (base + sqft + quartos + banheiros + pets)

**Files:**
- Create: `backend/src/domain/pricing/calculate.ts`
- Test: `backend/src/domain/pricing/calculate.test.ts`

**Interfaces:**
- Consumes: tipos da Task 2, `roundHalfUp`.
- Produces: `calculate(input: QuoteInput, config: PricingConfig): QuoteBreakdown` — nesta task preenche apenas os campos de subtotal.

- [ ] **Step 1: Escrever o teste que falha**

`backend/src/domain/pricing/calculate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calculate } from "./calculate.js";
import { defaultConfig } from "./config.js";
import type { QuoteInput } from "./types.js";

const baseInput: QuoteInput = {
  sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0,
  service: "deep_clean", frequency: "one_time",
  addOns: [], manualDiscount: 0,
};

describe("calculate — subtotal", () => {
  it("soma base + sqft + quartos + banheiros + pets", () => {
    const b = calculate(baseInput, defaultConfig());
    expect(b.base).toBe(8000);
    expect(b.sqftCharge).toBe(6000);
    expect(b.bedroomsCharge).toBe(3000);
    expect(b.bathroomsCharge).toBe(2000);
    expect(b.petsCharge).toBe(0);
    expect(b.subtotal).toBe(19000);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/calculate.test.ts`
Expected: FAIL (`Cannot find module './calculate.js'`).

- [ ] **Step 3: Implementação mínima (apenas subtotal)**

`backend/src/domain/pricing/calculate.ts`:

```ts
import { roundHalfUp } from "./money.js";
import type { PricingConfig, QuoteBreakdown, QuoteInput } from "./types.js";

// calculate é a engine pura de preços: input + config -> breakdown itemizado.
export function calculate(input: QuoteInput, config: PricingConfig): QuoteBreakdown {
  const base = config.basePrice;
  const sqftCharge = input.sqft * config.perSqft;
  const bedroomsCharge = input.bedrooms * config.perBedroom;
  const bathroomsCharge = input.bathrooms * config.perBathroom;
  const petsCharge = input.pets * config.perPet;
  const subtotal = base + sqftCharge + bedroomsCharge + bathroomsCharge + petsCharge;

  return {
    base, sqftCharge, bedroomsCharge, bathroomsCharge, petsCharge, subtotal,
    serviceMultiplier: 0, afterMultiplier: 0,
    frequencyDiscountPct: 0, frequencyDiscountAmount: 0,
    addOns: [], addOnsTotal: 0, manualDiscount: 0, total: 0,
  };
}
```

> Nota: `roundHalfUp` está importado mas ainda não usado — será usado na Task 4.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/calculate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Dev/estimate-engine
git add backend/src/domain/pricing/calculate.ts backend/src/domain/pricing/calculate.test.ts
git commit -m "feat(pricing): compute itemized subtotal"
```

---

### Task 4: Engine — multiplicador, desconto de frequência e golden case

**Files:**
- Modify: `backend/src/domain/pricing/calculate.ts`
- Modify: `backend/src/domain/pricing/calculate.test.ts`

**Interfaces:**
- Produces: `calculate` preenche `serviceMultiplier`, `afterMultiplier`, `frequencyDiscountPct`, `frequencyDiscountAmount` e `total` (sem add-ons ainda).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `backend/src/domain/pricing/calculate.test.ts`:

```ts
describe("calculate — multiplicador e desconto", () => {
  it("golden case Helena = 19000 ($190.00)", () => {
    const b = calculate(baseInput, defaultConfig());
    expect(b.total).toBe(19000);
  });

  it("aplica multiplicador move_in_out (1.8x)", () => {
    const b = calculate({ ...baseInput, service: "move_in_out" }, defaultConfig());
    expect(b.afterMultiplier).toBe(34200); // 19000 * 1.8
    expect(b.total).toBe(34200);
  });

  it("aplica desconto weekly (20%)", () => {
    const b = calculate({ ...baseInput, service: "recurring", frequency: "weekly" }, defaultConfig());
    expect(b.frequencyDiscountAmount).toBe(3800); // 19000 * 0.2
    expect(b.total).toBe(15200);
  });

  it("pets entram no subtotal e são multiplicados", () => {
    const b = calculate({ ...baseInput, pets: 2, service: "move_in_out" }, defaultConfig());
    expect(b.subtotal).toBe(20000); // 19000 + 2*500
    expect(b.afterMultiplier).toBe(36000); // 20000 * 1.8
  });
});
```

- [ ] **Step 2: Rodar e verificar que falham**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/calculate.test.ts`
Expected: FAIL (`total`/`afterMultiplier` = 0).

- [ ] **Step 3: Estender calculate**

Em `backend/src/domain/pricing/calculate.ts`, substituir o `return { ... }` por:

```ts
  const serviceMultiplier = config.serviceMultipliers[input.service];
  const afterMultiplier = roundHalfUp(subtotal * serviceMultiplier);

  const frequencyDiscountPct = config.frequencyDiscounts[input.frequency];
  const frequencyDiscountAmount = roundHalfUp(afterMultiplier * frequencyDiscountPct);

  const total = afterMultiplier - frequencyDiscountAmount;

  return {
    base, sqftCharge, bedroomsCharge, bathroomsCharge, petsCharge, subtotal,
    serviceMultiplier, afterMultiplier,
    frequencyDiscountPct, frequencyDiscountAmount,
    addOns: [], addOnsTotal: 0, manualDiscount: 0, total,
  };
```

- [ ] **Step 4: Rodar e verificar que passam**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/calculate.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
cd ~/Dev/estimate-engine
git add backend/src/domain/pricing/calculate.ts backend/src/domain/pricing/calculate.test.ts
git commit -m "feat(pricing): apply service multiplier and frequency discount"
```

---

### Task 5: Engine — add-ons, desconto manual e piso mínimo

**Files:**
- Modify: `backend/src/domain/pricing/calculate.ts`
- Modify: `backend/src/domain/pricing/calculate.test.ts`

**Interfaces:**
- Produces: `calculate` completo — preenche `addOns`, `addOnsTotal`, `manualDiscount` e aplica `Math.max(total, minimumPrice)`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `backend/src/domain/pricing/calculate.test.ts`:

```ts
describe("calculate — add-ons, desconto manual e piso", () => {
  it("soma add-ons (flat) com quantidade", () => {
    const b = calculate({
      ...baseInput,
      addOns: [
        { addOnId: "inside_fridge", quantity: 1 },    // 3000
        { addOnId: "interior_windows", quantity: 3 },  // 3 * 500 = 1500
      ],
    }, defaultConfig());
    expect(b.addOnsTotal).toBe(4500);
    expect(b.addOns).toHaveLength(2);
    expect(b.addOns[1].lineTotal).toBe(1500);
    expect(b.total).toBe(23500); // 19000 - 0 + 4500
  });

  it("aplica piso mínimo quando desconto manual zera o total", () => {
    const cfg = { ...defaultConfig(), minimumPrice: 10000 };
    const b = calculate({ ...baseInput, manualDiscount: 50000 }, cfg);
    expect(b.total).toBe(10000);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falham**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/calculate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Completar calculate**

Em `backend/src/domain/pricing/calculate.ts`, substituir o trecho que calcula `total` e o `return` por:

```ts
  const index = new Map(config.addOns.map((a) => [a.id, a]));
  const addOns = input.addOns.map((sel) => {
    const a = index.get(sel.addOnId)!;
    return {
      addOnId: a.id,
      name: a.name,
      unitPrice: a.price,
      quantity: sel.quantity,
      lineTotal: a.price * sel.quantity,
    };
  });
  const addOnsTotal = addOns.reduce((sum, line) => sum + line.lineTotal, 0);

  const manualDiscount = input.manualDiscount;
  const rawTotal = afterMultiplier - frequencyDiscountAmount + addOnsTotal - manualDiscount;
  const total = Math.max(rawTotal, config.minimumPrice);

  return {
    base, sqftCharge, bedroomsCharge, bathroomsCharge, petsCharge, subtotal,
    serviceMultiplier, afterMultiplier,
    frequencyDiscountPct, frequencyDiscountAmount,
    addOns, addOnsTotal, manualDiscount, total,
  };
```

Remova o `return` antigo (da Task 4) para não duplicar.

- [ ] **Step 4: Rodar a suíte e verificar que passa**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
cd ~/Dev/estimate-engine
git add backend/src/domain/pricing/calculate.ts backend/src/domain/pricing/calculate.test.ts
git commit -m "feat(pricing): add add-ons, manual discount and minimum floor"
```

---

### Task 6: Engine — erros de domínio + validação

**Files:**
- Create: `backend/src/domain/pricing/errors.ts`
- Modify: `backend/src/domain/pricing/calculate.ts`
- Modify: `backend/src/domain/pricing/calculate.test.ts`

**Interfaces:**
- Produces: `PricingError` (base) + `NegativeInputError`, `UnknownServiceError`, `UnknownFrequencyError`, `UnknownAddOnError`, `InvalidQuantityError`; `calculate` lança o erro apropriado antes de calcular.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `backend/src/domain/pricing/calculate.test.ts` (e os imports no topo):

```ts
import {
  NegativeInputError, UnknownServiceError, UnknownFrequencyError,
  UnknownAddOnError, InvalidQuantityError,
} from "./errors.js";

describe("calculate — validação de domínio", () => {
  it("rejeita sqft negativo", () => {
    expect(() => calculate({ ...baseInput, sqft: -1 }, defaultConfig())).toThrow(NegativeInputError);
  });
  it("rejeita service desconhecido", () => {
    expect(() => calculate({ ...baseInput, service: "bogus" as never }, defaultConfig())).toThrow(UnknownServiceError);
  });
  it("rejeita frequency desconhecida", () => {
    expect(() => calculate({ ...baseInput, frequency: "bogus" as never }, defaultConfig())).toThrow(UnknownFrequencyError);
  });
  it("rejeita add-on inexistente no catálogo", () => {
    expect(() => calculate({ ...baseInput, addOns: [{ addOnId: "nope", quantity: 1 }] }, defaultConfig())).toThrow(UnknownAddOnError);
  });
  it("rejeita quantidade < 1", () => {
    expect(() => calculate({ ...baseInput, addOns: [{ addOnId: "inside_oven", quantity: 0 }] }, defaultConfig())).toThrow(InvalidQuantityError);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falham**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/calculate.test.ts`
Expected: FAIL (`Cannot find module './errors.js'`).

- [ ] **Step 3: Definir os erros**

`backend/src/domain/pricing/errors.ts`:

```ts
// Erro base do domínio de preços. O error-handler HTTP mapeia qualquer PricingError para 400.
export class PricingError extends Error {}

export class NegativeInputError extends PricingError {
  constructor() { super("input numérico negativo"); this.name = "NegativeInputError"; }
}
export class UnknownServiceError extends PricingError {
  constructor() { super("service type desconhecido"); this.name = "UnknownServiceError"; }
}
export class UnknownFrequencyError extends PricingError {
  constructor() { super("frequency desconhecida"); this.name = "UnknownFrequencyError"; }
}
export class UnknownAddOnError extends PricingError {
  constructor() { super("add-on selecionado não existe no catálogo"); this.name = "UnknownAddOnError"; }
}
export class InvalidQuantityError extends PricingError {
  constructor() { super("quantidade de add-on deve ser >= 1"); this.name = "InvalidQuantityError"; }
}
```

- [ ] **Step 4: Validar no início de calculate**

Em `backend/src/domain/pricing/calculate.ts`, adicionar os imports e inserir as checagens como primeiras linhas de `calculate` (antes de `const base = ...`):

```ts
import {
  NegativeInputError, UnknownServiceError, UnknownFrequencyError,
  UnknownAddOnError, InvalidQuantityError,
} from "./errors.js";
```

```ts
  if (input.sqft < 0 || input.bedrooms < 0 || input.bathrooms < 0 || input.pets < 0 || input.manualDiscount < 0) {
    throw new NegativeInputError();
  }
  if (!(input.service in config.serviceMultipliers)) {
    throw new UnknownServiceError();
  }
  if (!(input.frequency in config.frequencyDiscounts)) {
    throw new UnknownFrequencyError();
  }
  const catalogIds = new Set(config.addOns.map((a) => a.id));
  for (const sel of input.addOns) {
    if (!catalogIds.has(sel.addOnId)) throw new UnknownAddOnError();
    if (sel.quantity < 1) throw new InvalidQuantityError();
  }
```

- [ ] **Step 5: Rodar a suíte e verificar que passa**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/domain/pricing/`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
cd ~/Dev/estimate-engine
git add backend/src/domain/pricing/errors.ts backend/src/domain/pricing/calculate.ts backend/src/domain/pricing/calculate.test.ts
git commit -m "feat(pricing): domain errors and input validation"
```

---

### Task 7: Infra de dados — Drizzle schema, client e repository do módulo pricing-config

**Files:**
- Create: `backend/src/infra/db/schema.ts`
- Create: `backend/src/infra/db/client.ts`
- Create: `backend/drizzle.config.ts`
- Create: `backend/src/modules/pricing-config/repository.ts`
- Test: `backend/src/modules/pricing-config/repository.test.ts`
- Create: `backend/.env.example`

**Interfaces:**
- Consumes: `PricingConfig`, `defaultConfig` (do `domain/pricing`).
- Produces: `createDb(connectionString): Db`; `ConfigStore` (interface) com `get(): Promise<PricingConfig>` e `save(config): Promise<void>`; classe `PricingConfigRepository implements ConfigStore`. `get` semeia `defaultConfig` se a tabela estiver vazia.

> **Nota de execução:** requer Postgres local:
> `docker run --name ee-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=estimate_engine -p 5432:5432 -d postgres:15`
> `DATABASE_URL`: `postgres://postgres:postgres@localhost:5432/estimate_engine`

- [ ] **Step 1: Instalar dependências**

```bash
cd ~/Dev/estimate-engine/backend
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

`backend/.env.example`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/estimate_engine
PORT=8080
```

- [ ] **Step 2: Schema Drizzle**

`backend/src/infra/db/schema.ts`:

```ts
import { pgTable, smallint, jsonb, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { PricingConfig } from "../../domain/pricing/types.js";

export const pricingConfig = pgTable(
  "pricing_config",
  {
    id: smallint("id").primaryKey().default(1),
    data: jsonb("data").$type<PricingConfig>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("pricing_config_singleton", sql`${t.id} = 1`)],
);
```

- [ ] **Step 3: Client + drizzle.config**

`backend/src/infra/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool);
}

export type Db = ReturnType<typeof createDb>;
```

`backend/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/infra/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Adicionar scripts em `backend/package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

- [ ] **Step 4: Gerar e aplicar a migration**

Run:
```bash
cd ~/Dev/estimate-engine/backend
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine'
npx drizzle-kit generate
npx drizzle-kit migrate
```
Expected: cria um arquivo SQL em `drizzle/` e aplica (tabela `pricing_config` criada).

- [ ] **Step 5: Escrever o teste que falha (integração)**

`backend/src/modules/pricing-config/repository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../../infra/db/client.js";
import { pricingConfig } from "../../infra/db/schema.js";
import { PricingConfigRepository } from "./repository.js";
import { defaultConfig } from "../../domain/pricing/config.js";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("PricingConfigRepository", () => {
  const db = createDb(url!);
  const repo = new PricingConfigRepository(db);

  beforeEach(async () => {
    await db.delete(pricingConfig);
  });

  it("semeia defaultConfig quando a tabela está vazia", async () => {
    const cfg = await repo.get();
    expect(cfg.basePrice).toBe(defaultConfig().basePrice);
  });

  it("salva e relê a config", async () => {
    const cfg = { ...defaultConfig(), basePrice: 9999 };
    await repo.save(cfg);
    const got = await repo.get();
    expect(got.basePrice).toBe(9999);
  });
});
```

- [ ] **Step 6: Rodar e verificar que falha**

Run: `cd ~/Dev/estimate-engine/backend && export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine' && npx vitest run src/modules/pricing-config/repository.test.ts`
Expected: FAIL (`Cannot find module './repository.js'`).

- [ ] **Step 7: Implementar o repository**

`backend/src/modules/pricing-config/repository.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import { pricingConfig } from "../../infra/db/schema.js";
import { defaultConfig } from "../../domain/pricing/config.js";
import type { PricingConfig } from "../../domain/pricing/types.js";

export interface ConfigStore {
  get(): Promise<PricingConfig>;
  save(config: PricingConfig): Promise<void>;
}

export class PricingConfigRepository implements ConfigStore {
  constructor(private db: Db) {}

  async get(): Promise<PricingConfig> {
    const rows = await this.db.select().from(pricingConfig).where(eq(pricingConfig.id, 1));
    if (rows.length === 0) {
      const def = defaultConfig();
      await this.save(def);
      return def;
    }
    return rows[0].data;
  }

  async save(config: PricingConfig): Promise<void> {
    await this.db
      .insert(pricingConfig)
      .values({ id: 1, data: config })
      .onConflictDoUpdate({
        target: pricingConfig.id,
        set: { data: config, updatedAt: new Date() },
      });
  }
}
```

- [ ] **Step 8: Rodar e verificar que passa**

Run: `cd ~/Dev/estimate-engine/backend && export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine' && npx vitest run src/modules/pricing-config/repository.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd ~/Dev/estimate-engine
git add backend/src/infra/db backend/src/modules/pricing-config/repository.ts backend/src/modules/pricing-config/repository.test.ts backend/drizzle.config.ts backend/drizzle backend/.env.example backend/package.json backend/package-lock.json
git commit -m "feat(pricing-config): Drizzle schema, client and repository"
```

---

### Task 8: HTTP — módulos (rotas + zod), plugins de infra e wiring

**Files:**
- Create: `backend/src/modules/quotes/schema.ts`
- Create: `backend/src/modules/quotes/routes.ts`
- Create: `backend/src/modules/pricing-config/schema.ts`
- Create: `backend/src/modules/pricing-config/routes.ts`
- Create: `backend/src/infra/http/plugins/cors.ts`
- Create: `backend/src/infra/http/plugins/error-handler.ts`
- Create: `backend/src/infra/http/server.ts`
- Create: `backend/src/index.ts`
- Test: `backend/src/infra/http/server.test.ts`

**Interfaces:**
- Consumes: `calculate`, `PricingError`, `ConfigStore`.
- Produces: `buildServer(store: ConfigStore): FastifyInstance`. Rotas registradas pelos módulos: `POST /api/quotes/calculate`, `GET /api/pricing-config`, `PUT /api/pricing-config`. Erros de domínio (`PricingError`) viram 400 via `setErrorHandler`.

- [ ] **Step 1: Instalar dependências**

```bash
cd ~/Dev/estimate-engine/backend
npm install fastify @fastify/cors zod
```

- [ ] **Step 2: Escrever o teste que falha**

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

- [ ] **Step 3: Rodar e verificar que falha**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/infra/http/server.test.ts`
Expected: FAIL (`Cannot find module './server.js'`).

- [ ] **Step 4: Schemas Zod dos módulos**

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

- [ ] **Step 5: Rotas dos módulos (Fastify)**

`backend/src/modules/quotes/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { calculate } from "../../domain/pricing/calculate.js";
import { quoteInputSchema } from "./schema.js";
import type { ConfigStore } from "../pricing-config/repository.js";

export function quotesRoutes(app: FastifyInstance, store: ConfigStore) {
  app.post("/api/quotes/calculate", async (request, reply) => {
    const parsed = quoteInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.message });
    }
    const config = await store.get();
    // Se calculate lançar PricingError, o error-handler global devolve 400.
    return calculate(parsed.data, config);
  });
}
```

`backend/src/modules/pricing-config/routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { pricingConfigSchema } from "./schema.js";
import type { ConfigStore } from "./repository.js";

export function pricingConfigRoutes(app: FastifyInstance, store: ConfigStore) {
  app.get("/api/pricing-config", async () => store.get());

  app.put("/api/pricing-config", async (request, reply) => {
    const parsed = pricingConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.message });
    }
    await store.save(parsed.data);
    return parsed.data;
  });
}
```

- [ ] **Step 6: Plugins de infra (cors + error-handler)**

`backend/src/infra/http/plugins/cors.ts`:

```ts
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";

export function registerCors(app: FastifyInstance) {
  app.register(cors, { origin: "http://localhost:5173" });
}
```

`backend/src/infra/http/plugins/error-handler.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { PricingError } from "../../../domain/pricing/errors.js";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PricingError) {
      return reply.status(400).send({ error: error.message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "internal server error" });
  });
}
```

- [ ] **Step 7: Server (compõe plugins + módulos)**

`backend/src/infra/http/server.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { registerCors } from "./plugins/cors.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { quotesRoutes } from "../../modules/quotes/routes.js";
import { pricingConfigRoutes } from "../../modules/pricing-config/routes.js";
import type { ConfigStore } from "../../modules/pricing-config/repository.js";

export function buildServer(store: ConfigStore): FastifyInstance {
  const app = Fastify({ logger: true });

  registerCors(app);
  registerErrorHandler(app);

  quotesRoutes(app, store);
  pricingConfigRoutes(app, store);

  return app;
}
```

- [ ] **Step 8: Rodar e verificar que passa**

Run: `cd ~/Dev/estimate-engine/backend && npx vitest run src/infra/http/server.test.ts`
Expected: PASS.

- [ ] **Step 9: Entry point (wiring)**

`backend/src/index.ts`:

```ts
import { buildServer } from "./infra/http/server.js";
import { createDb } from "./infra/db/client.js";
import { PricingConfigRepository } from "./modules/pricing-config/repository.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");
const port = Number(process.env.PORT ?? 8080);

const db = createDb(url);
const repo = new PricingConfigRepository(db);
const app = buildServer(repo);

app.listen({ port }).then(() => {
  app.log.info(`API ouvindo em :${port}`);
});
```

- [ ] **Step 10: Smoke test manual**

Run:
```bash
cd ~/Dev/estimate-engine/backend
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine'
npm run dev &
sleep 2
curl -s -X POST localhost:8080/api/quotes/calculate -H 'Content-Type: application/json' \
  -d '{"sqft":1000,"bedrooms":2,"bathrooms":1,"pets":0,"service":"deep_clean","frequency":"one_time","addOns":[],"manualDiscount":0}'
kill %1
```
Expected: JSON com `"total":19000`.

- [ ] **Step 11: Commit**

```bash
cd ~/Dev/estimate-engine
git add backend/src/modules backend/src/infra/http backend/src/index.ts backend/package.json backend/package-lock.json
git commit -m "feat(api): module routes, http plugins and server wiring"
```

---

### Task 9: Frontend — scaffold + util de formatação (TDD) + cliente de API

**Files:**
- Create: `frontend/` (scaffold Vite)
- Create: `frontend/src/lib/money.ts`
- Test: `frontend/src/lib/money.test.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/types.ts`
- Modify: `frontend/vite.config.ts`

**Interfaces:**
- Produces: `formatCents(cents: number): string`; `api` (axios, baseURL `/api`); tipos TS espelhando os do backend (`src/domain/pricing/types.ts`).

- [ ] **Step 1: Scaffold Vite + deps**

```bash
cd ~/Dev/estimate-engine
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @tanstack/react-query axios
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Configurar Vite (proxy + tailwind + vitest)**

`frontend/vite.config.ts`:

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

Adicionar no topo de `frontend/src/index.css`: `@import "tailwindcss";`
Adicionar script em `frontend/package.json` → `"scripts"`: `"test": "vitest"`.

- [ ] **Step 3: Escrever o teste que falha**

`frontend/src/lib/money.test.ts`:

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

- [ ] **Step 4: Rodar e verificar que falha**

Run: `cd ~/Dev/estimate-engine/frontend && npx vitest run src/lib/money.test.ts`
Expected: FAIL (`Cannot find module './money'`).

- [ ] **Step 5: Implementar util + cliente + tipos**

`frontend/src/lib/money.ts`:

```ts
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
```

`frontend/src/lib/api.ts`:

```ts
import axios from "axios";

export const api = axios.create({ baseURL: "/api" });
```

`frontend/src/types.ts` (espelham os tipos do backend `src/domain/pricing/types.ts`):

```ts
export type ServiceType = "deep_clean" | "recurring" | "move_in_out";
export type Frequency = "one_time" | "weekly" | "bi_weekly" | "monthly";

export interface AddOn { id: string; name: string; price: number }
export interface SelectedAddOn { addOnId: string; quantity: number }

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

- [ ] **Step 6: Rodar e verificar que passa**

Run: `cd ~/Dev/estimate-engine/frontend && npx vitest run src/lib/money.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/Dev/estimate-engine
git add frontend
git commit -m "feat(frontend): scaffold Vite app, money util, api client and types"
```

---

### Task 10: Frontend — tela Calculadora (preview ao vivo)

**Files:**
- Create: `frontend/src/lib/useDebounce.ts`
- Create: `frontend/src/pages/CalculatorPage.tsx`
- Create: `frontend/src/components/BreakdownPanel.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `api`, `formatCents`, tipos da Task 9, `GET /api/pricing-config`, `POST /api/quotes/calculate`.

- [ ] **Step 1: Provider do React Query**

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Hook de debounce**

`frontend/src/lib/useDebounce.ts`:

```ts
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] **Step 3: Painel de breakdown**

`frontend/src/components/BreakdownPanel.tsx`:

```tsx
import type { QuoteBreakdown } from "../types";
import { formatCents } from "../lib/money";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-100">{value}</span>
    </div>
  );
}

export function BreakdownPanel({ b }: { b: QuoteBreakdown }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <Row label="Base" value={formatCents(b.base)} />
      <Row label="Sqft" value={formatCents(b.sqftCharge)} />
      <Row label="Bedrooms" value={formatCents(b.bedroomsCharge)} />
      <Row label="Bathrooms" value={formatCents(b.bathroomsCharge)} />
      <Row label="Pets" value={formatCents(b.petsCharge)} />
      <div className="my-2 border-t border-zinc-800" />
      <Row label="Subtotal" value={formatCents(b.subtotal)} />
      <Row label={`Multiplier ×${b.serviceMultiplier}`} value={formatCents(b.afterMultiplier)} />
      <Row label={`Discount ${(b.frequencyDiscountPct * 100).toFixed(0)}%`} value={`-${formatCents(b.frequencyDiscountAmount)}`} />
      {b.addOns.map((a) => (
        <Row key={a.addOnId} label={`${a.name} ×${a.quantity}`} value={formatCents(a.lineTotal)} />
      ))}
      {b.manualDiscount > 0 && <Row label="Manual discount" value={`-${formatCents(b.manualDiscount)}`} />}
      <div className="my-2 border-t border-zinc-800" />
      <div className="flex justify-between pt-1">
        <span className="font-semibold text-zinc-100">Total</span>
        <span className="text-2xl font-bold text-zinc-50">{formatCents(b.total)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Tela da calculadora**

`frontend/src/pages/CalculatorPage.tsx`:

```tsx
import { useState } from "react";
import type { ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useDebounce } from "../lib/useDebounce";
import type { PricingConfig, QuoteBreakdown, QuoteInput, ServiceType, Frequency } from "../types";
import { BreakdownPanel } from "../components/BreakdownPanel";

const SERVICES: ServiceType[] = ["deep_clean", "recurring", "move_in_out"];
const FREQUENCIES: Frequency[] = ["one_time", "weekly", "bi_weekly", "monthly"];

export function CalculatorPage() {
  const [input, setInput] = useState<QuoteInput>({
    sqft: 1000, bedrooms: 2, bathrooms: 1, pets: 0,
    service: "deep_clean", frequency: "one_time",
    addOns: [], manualDiscount: 0,
  });
  const debounced = useDebounce(input, 300);

  const config = useQuery<PricingConfig>({
    queryKey: ["pricing-config"],
    queryFn: async () => (await api.get("/pricing-config")).data,
  });

  const quote = useQuery<QuoteBreakdown>({
    queryKey: ["calculate", debounced],
    queryFn: async () => (await api.post("/quotes/calculate", debounced)).data,
  });

  const num = (k: keyof QuoteInput) => (e: ChangeEvent<HTMLInputElement>) =>
    setInput((s) => ({ ...s, [k]: Number(e.target.value) }));

  function toggleAddOn(id: string) {
    setInput((s) => {
      const exists = s.addOns.find((a) => a.addOnId === id);
      return exists
        ? { ...s, addOns: s.addOns.filter((a) => a.addOnId !== id) }
        : { ...s, addOns: [...s.addOns, { addOnId: id, quantity: 1 }] };
    });
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-8 md:grid-cols-2">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-zinc-100">Calculadora</h1>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-zinc-400">Sqft
            <input type="number" value={input.sqft} onChange={num("sqft")} className="mt-1 w-full rounded bg-zinc-800 p-2 text-zinc-100" />
          </label>
          <label className="text-sm text-zinc-400">Bedrooms
            <input type="number" value={input.bedrooms} onChange={num("bedrooms")} className="mt-1 w-full rounded bg-zinc-800 p-2 text-zinc-100" />
          </label>
          <label className="text-sm text-zinc-400">Bathrooms
            <input type="number" value={input.bathrooms} onChange={num("bathrooms")} className="mt-1 w-full rounded bg-zinc-800 p-2 text-zinc-100" />
          </label>
          <label className="text-sm text-zinc-400">Pets
            <input type="number" value={input.pets} onChange={num("pets")} className="mt-1 w-full rounded bg-zinc-800 p-2 text-zinc-100" />
          </label>
        </div>

        <label className="block text-sm text-zinc-400">Service
          <select value={input.service} onChange={(e) => setInput((s) => ({ ...s, service: e.target.value as ServiceType }))} className="mt-1 w-full rounded bg-zinc-800 p-2 text-zinc-100">
            {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block text-sm text-zinc-400">Frequency
          <select value={input.frequency} onChange={(e) => setInput((s) => ({ ...s, frequency: e.target.value as Frequency }))} className="mt-1 w-full rounded bg-zinc-800 p-2 text-zinc-100">
            {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>

        <div>
          <p className="mb-2 text-sm text-zinc-400">Add-ons</p>
          <div className="space-y-1">
            {config.data?.addOns.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm text-zinc-200">
                <input type="checkbox" checked={!!input.addOns.find((s) => s.addOnId === a.id)} onChange={() => toggleAddOn(a.id)} />
                {a.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        {quote.data ? <BreakdownPanel b={quote.data} /> : <p className="text-zinc-500">Calculando…</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Montar em App**

`frontend/src/App.tsx`:

```tsx
import { CalculatorPage } from "./pages/CalculatorPage";

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <CalculatorPage />
    </div>
  );
}
```

- [ ] **Step 6: Verificar manualmente (com backend e Postgres no ar)**

Run:
```bash
# terminal 1
cd ~/Dev/estimate-engine/backend && export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine' && npm run dev
# terminal 2
cd ~/Dev/estimate-engine/frontend && npm run dev
```
Abrir `http://localhost:5173`. Esperado: inputs 1000/2/1/0, Deep Clean, One-time → **Total $190.00**; marcar "Inside Fridge" → **$220.00**.

- [ ] **Step 7: Commit**

```bash
cd ~/Dev/estimate-engine
git add frontend/src
git commit -m "feat(frontend): live calculator screen with breakdown panel"
```

---

### Task 11: Frontend — tela de Config (rates, multiplicadores, descontos, catálogo de add-ons)

**Files:**
- Create: `frontend/src/pages/ConfigPage.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `api`, tipos, `GET`/`PUT /api/pricing-config`, `useQueryClient`.
- Produces: `ConfigPage` com edição de rates/mínimo e CRUD do catálogo de add-ons.

- [ ] **Step 1: Tela de config**

`frontend/src/pages/ConfigPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { PricingConfig, AddOn } from "../types";

export function ConfigPage() {
  const qc = useQueryClient();
  const { data } = useQuery<PricingConfig>({
    queryKey: ["pricing-config"],
    queryFn: async () => (await api.get("/pricing-config")).data,
  });
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  useEffect(() => { if (data) setCfg(data); }, [data]);

  const save = useMutation({
    mutationFn: async (next: PricingConfig) => (await api.put("/pricing-config", next)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-config"] }),
  });

  if (!cfg) return <p className="p-8 text-zinc-500">Carregando…</p>;

  const moneyField = (label: string, key: keyof PricingConfig) => (
    <label className="block text-sm text-zinc-400">{label} (cents)
      <input
        type="number"
        value={cfg[key] as number}
        onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })}
        className="mt-1 w-full rounded bg-zinc-800 p-2 text-zinc-100"
      />
    </label>
  );

  function updateAddOn(i: number, patch: Partial<AddOn>) {
    const addOns = cfg!.addOns.map((a, idx) => (idx === i ? { ...a, ...patch } : a));
    setCfg({ ...cfg!, addOns });
  }
  function deleteAddOn(i: number) {
    setCfg({ ...cfg!, addOns: cfg!.addOns.filter((_, idx) => idx !== i) });
  }
  function addAddOn() {
    const id = `addon_${Date.now()}`;
    setCfg({ ...cfg!, addOns: [...cfg!.addOns, { id, name: "Novo add-on", price: 0 }] });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-xl font-semibold text-zinc-100">Configurações</h1>

      <section className="grid grid-cols-2 gap-3">
        {moneyField("Base price", "basePrice")}
        {moneyField("Per sqft", "perSqft")}
        {moneyField("Per bedroom", "perBedroom")}
        {moneyField("Per bathroom", "perBathroom")}
        {moneyField("Per pet", "perPet")}
        {moneyField("Minimum price", "minimumPrice")}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase text-zinc-400">Add-ons</h2>
          <button onClick={addAddOn} className="rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-100">+ Add-on</button>
        </div>
        <div className="space-y-2">
          {cfg.addOns.map((a, i) => (
            <div key={a.id} className="flex items-center gap-2">
              <input value={a.name} onChange={(e) => updateAddOn(i, { name: e.target.value })} className="flex-1 rounded bg-zinc-800 p-2 text-sm text-zinc-100" />
              <input type="number" value={a.price} onChange={(e) => updateAddOn(i, { price: Number(e.target.value) })} className="w-28 rounded bg-zinc-800 p-2 text-sm text-zinc-100" />
              <button onClick={() => deleteAddOn(i)} className="rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">Del</button>
            </div>
          ))}
        </div>
      </section>

      <button onClick={() => save.mutate(cfg)} disabled={save.isPending} className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
        {save.isPending ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Navegação simples entre Calculadora e Config**

`frontend/src/App.tsx`:

```tsx
import { useState } from "react";
import { CalculatorPage } from "./pages/CalculatorPage";
import { ConfigPage } from "./pages/ConfigPage";

export default function App() {
  const [tab, setTab] = useState<"calc" | "config">("calc");
  return (
    <div className="min-h-screen bg-zinc-950">
      <nav className="flex gap-4 border-b border-zinc-800 px-8 py-3">
        <button onClick={() => setTab("calc")} className={tab === "calc" ? "text-zinc-100" : "text-zinc-500"}>Calculadora</button>
        <button onClick={() => setTab("config")} className={tab === "config" ? "text-zinc-100" : "text-zinc-500"}>Config</button>
      </nav>
      {tab === "calc" ? <CalculatorPage /> : <ConfigPage />}
    </div>
  );
}
```

- [ ] **Step 3: Verificar manualmente**

Com backend + frontend no ar: ir em **Config**, mudar "Base price" para `9000`, deletar um add-on, criar outro com preço `1000`, **Salvar**. Voltar à **Calculadora**: o novo catálogo aparece e o total reflete a nova base. Recarregar a página (F5) confirma que persistiu no Postgres (JSONB).

- [ ] **Step 4: Commit**

```bash
cd ~/Dev/estimate-engine
git add frontend/src
git commit -m "feat(frontend): config screen with pricing fields and add-on catalog CRUD"
```

---

## Critérios de aceite da Fase 1 (checklist final)

- [ ] `npm test` no backend passa inteiro (domain, repository, http).
- [ ] Golden case Helena retorna `19000` na engine, no endpoint e na UI.
- [ ] `GET`/`PUT /api/pricing-config` persistem config + catálogo de add-ons (JSONB) no Postgres via Drizzle.
- [ ] Calculadora mostra breakdown ao vivo e seleção de add-ons.
- [ ] Config edita rates/mínimo e faz CRUD de add-ons.
- [ ] Estrutura segue `domain` / `modules` / `infra` (ver guia 09).
- [ ] Nenhum decimal quebrado em valor monetário (apenas multiplicador/percentual, com `roundHalfUp`).

## Próxima fase

Fase 2 (Estimates: persistir quote + cliente + página pública accept/decline) entra como `src/modules/estimates/` — sem reestruturar o que já existe.
