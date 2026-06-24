# Estimate Engine — Design de Produto + Spec da Fase 1 (Calculadora)

> Data: 2026-06-22 (stack revisada para Node em 2026-06-24)
> Status: aprovado para escrita do plano de implementação da Fase 1
> Idioma: prosa em português (Brasil); modelos, código, nomes de campos e termos técnicos em inglês.

---

## 1. Visão geral

Aplicação de estudo full-stack: um **lead-to-quote tool** para o nicho de *house cleaning*.
É uma reconstrução "definitiva" de um protótipo já validado (o *Estimate Engine* rodando em
`estimates.maid4maid.com`), agora feita em **Node + TypeScript + React** com o objetivo de:

1. Reaprender/entender **backend** e arquitetura de verdade.
2. Praticar o **fluxo full-stack** ponta a ponta (form → API → DB → UI).
3. Produzir algo cujo núcleo **pode alimentar o m4m no futuro** (a conversão de lead em
   `Customer` é a ponte de integração).

O núcleo do produto são **três** coisas; todo o resto é suporte:

1. **A calculadora de preços** — engine configurável, correta e reutilizável (o coração).
2. **Leads + pipeline** — levam o prospect de primeiro contato → estimate → won/lost.
3. **Conversão "Won" → `Customer`** — o `Customer` é a ponte para o m4m.

Recursos do protótipo que viram *suporte* (fases posteriores): follow-ups, página pública de
aceite, auth, backup.

## 2. Objetivos de aprendizado

- Arquitetura em camadas: `http (Fastify) → service/repository → módulo de domínio`.
- Modelagem de domínio e *deep modules* (a calculadora é o exemplo canônico).
- Money handling correto (inteiros em cents, nunca decimais quebrados).
- TDD com **Vitest**.
- Persistência com Postgres + **Drizzle ORM** (schema tipado, migrations, JSONB).
- HTTP idiomático com **Fastify**.
- Validação em duas camadas: **Zod** na fronteira HTTP + invariantes de domínio na engine.
- Frontend com React + TanStack Query consumindo a API (round-trip front↔back), com **tipos
  TypeScript compartilháveis** entre back e front.

## 3. Stack e arquitetura

- **Runtime/linguagem:** Node 20+ com **TypeScript** (ESM).
- **Framework HTTP:** **Fastify** (+ `@fastify/cors`).
- **Validação:** **Zod** (schemas na fronteira HTTP).
- **Banco:** Postgres 15+.
- **ORM/persistência:** **Drizzle ORM** (+ `drizzle-kit` para migrations, driver `pg`).
- **Testes:** **Vitest** (back e front).
- **Frontend:** React 19, Vite, TypeScript, Tailwind v4, Radix/shadcn, TanStack Query,
  react-router → porta-se direto para o m4m.
- **Padrão de camadas no backend:**
  - `http` (Fastify routes, Zod, serialização) →
  - `service`/`repository` (acesso a dados via Drizzle) →
  - a **engine de preços é um módulo PURO** (`src/pricing`), sem dependência de HTTP nem DB.

### Layout de repositório (proposto)

Repositório próprio (separado do m4m), em `~/Dev/estimate-engine/`, com `backend/` e `frontend/`.
A integração com o m4m acontece depois, via o contrato de `Customer`. Os tipos do domínio são
TypeScript e podem, numa fase futura, virar um pacote compartilhado entre back e front.

## 4. Modelo de domínio (visão geral — detalhe por fase)

| Entidade        | Papel                                                        | Fase |
|-----------------|-------------------------------------------------------------|------|
| `PricingConfig` | Parâmetros do cálculo + catálogo de add-ons (JSONB)         | 1    |
| `QuoteBreakdown`| Resultado de cálculo (itemizado). Stateless na Fase 1.      | 1    |
| `Estimate`      | Quote persistida + cliente + status + snapshot de add-ons   | 2    |
| `Lead`          | Prospect no funil                                           | 3    |
| `PipelineStage` | Estágio do funil (new_lead, estimate_sent, ...)            | 3    |
| `Customer`      | Lead convertido (ponte m4m)                                 | 4    |
| `User`          | Auth / admin                                                | 5    |
| `FollowUp`      | Cadência FU1..FU5                                           | 5    |
| `AuditLog`      | Histórico de mudanças                                       | 5    |

## 5. Roadmap por fases

Cada fase tem seu próprio spec → plano → implementação. Termina-se uma antes de abrir a próxima.

| Fase | Slice | Foco de aprendizado |
|------|-------|---------------------|
| **1. Calculadora** | Engine + config + add-ons + tela de cálculo | Lógica pura, TDD, money, módulo profundo |
| **2. Estimates** | Criar estimate (usa engine) → persistir → list/detail → página pública accept/decline | CRUD + rota pública + create→read |
| **3. Leads + Pipeline** | Lead + Kanban (drag de estágios) + link com estimates | Board UI, transições de estado, relações |
| **4. Convert → Customer** | "Won" cria `Customer` (contrato/ponte m4m) | Eventos de domínio, seam de integração |
| **5. Suporte** | Auth, follow-ups, tela de config, audit log | App completo |

---

## 6. Fase 1 — Calculadora (spec detalhada)

### 6.1 Princípio central

A engine de preços é um **deep module**: função pura `input + config → breakdown`. Não conhece
HTTP nem banco. Isso a torna trivial de testar e portável para o Laravel do m4m depois.

### 6.2 Fórmula (validada contra o protótipo)

```
subtotal        = basePrice
                + sqft       * perSqft
                + bedrooms   * perBedroom
                + bathrooms  * perBathroom
                + pets       * perPet

afterMultiplier = subtotal * serviceMultiplier[service]

freqDiscount    = afterMultiplier * frequencyDiscountPct[frequency]

addOnsTotal     = Σ (addon.price * quantity)          // flat: não multiplicado, não descontado

total           = afterMultiplier - freqDiscount + addOnsTotal - manualDiscount
total           = max(total, minimumPrice)
```

**Golden case (Helena):** Deep Clean, One-time, 1000 sqft, 2 quartos, 1 banheiro, 0 pets, sem
add-ons → `80 + 60 + 30 + 20 + 0 = 190` → ×1 → −0% → **$190.00** (19000 cents) ✅

### 6.3 Decisões de domínio registradas

1. **Multiplicador** incide sobre o **subtotal inteiro** (inclui pets).
2. **Desconto de frequência** incide sobre o **`afterMultiplier`** (valor cheio do serviço).
3. **Add-ons** entram como **valor fixo**, somados *após* multiplicador e desconto. *Revisável.*
4. **Add-ons são configuráveis pelo usuário**: catálogo gerenciável (add/edit/delete), com itens
   pré-criados. Armazenado como **JSONB** na `PricingConfig`.
5. **Snapshot:** os add-ons escolhidos numa estimate são **congelados como JSON na estimate**
   (Fase 2). Mudar o catálogo depois não altera estimates antigas.

### 6.4 Money handling

Dinheiro é **inteiro em cents** (`type Money = number`, sempre inteiro). Em JS, inteiros são
seguros até 2^53, muito acima de qualquer valor que veremos — então `number` em cents é seguro.
Nunca usamos decimais quebrados para dinheiro. Float só aparece no `serviceMultiplier` e no
`frequencyDiscount`; após cada multiplicação por float, arredonda-se **na hora** de volta para
cents inteiros via `roundHalfUp` (`Math.round`). A API transporta dinheiro em cents.

### 6.5 Interface do módulo (TypeScript)

```ts
export type Money = number; // integer cents

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

// Pura: lança PricingError (ver 6.6) para invariantes de domínio violados.
export function calculate(input: QuoteInput, config: PricingConfig): QuoteBreakdown;
```

O `QuoteBreakdown` é **itemizado** (linha a linha), para alimentar tanto a UI quanto a
proposta/estimate depois.

### 6.6 Validação (duas camadas)

- **Fronteira HTTP (Zod):** valida *shape*, tipos, números não-negativos, `quantity >= 1` e a
  pertinência aos enums `ServiceType`/`Frequency`. Rejeita com **400** antes de chegar na engine.
- **Domínio (engine):** a engine é um módulo puro que **não confia no chamador**. Lança erros
  específicos (todos estendendo `PricingError`) para invariantes que dependem dos *dados*:
  - `NegativeInputError`
  - `UnknownServiceError`
  - `UnknownFrequencyError`
  - `UnknownAddOnError` (add-on selecionado não existe no catálogo da config)
  - `InvalidQuantityError`

  O handler HTTP mapeia qualquer `PricingError` para **400**.

### 6.7 API (Fase 1)

| Método | Rota | Função |
|--------|------|--------|
| `POST` | `/api/quotes/calculate` | Stateless. `QuoteInput` → `QuoteBreakdown`. Preview ao vivo. |
| `GET`  | `/api/pricing-config`   | Config atual (inclui catálogo de add-ons). |
| `PUT`  | `/api/pricing-config`   | Atualiza config + catálogo (admin). |

A `PricingConfig` mora numa tabela (linha única na Fase 1; vira *per-tenant* se houver multi-tenant
no futuro). **O backend é a fonte da verdade do cálculo** — o front sempre chama `/calculate`.

### 6.8 Frontend (Fase 1)

- **Tela "Calculadora / Nova Estimate":** inputs à esquerda; **breakdown ao vivo à direita**
  (chamada *debounced* a `/calculate` via TanStack Query); seleção de add-ons com quantidade.
- **Tela "Config → Pricing":** edita `PricingConfig` (base rates, multiplicadores, descontos,
  preço mínimo) e **gerencia o catálogo de add-ons** (add/edit/delete + preços).

### 6.9 Testes (TDD, Vitest)

Casos da engine:

- Golden case Helena (`total === 19000`).
- Pets > 0 (entra no subtotal e é multiplicado).
- `move_in_out` (1.8×).
- Cada desconto de frequência (weekly/bi_weekly/monthly).
- Add-ons: zero, um, múltiplos, com quantidade > 1; add-on inexistente → erro.
- `minimumPrice` como piso.
- `manualDiscount` maior que o total → cai no piso (não fica negativo).
- Inputs negativos / service / frequency desconhecidos → erro (`PricingError`).
- Arredondamento (valores que geram fração de cent).

### 6.10 Critérios de aceite da Fase 1

- [ ] `calculate` cobre todos os casos de 6.9 com testes verdes (Vitest).
- [ ] `POST /api/quotes/calculate` retorna o breakdown itemizado correto para o golden case.
- [ ] `GET`/`PUT /api/pricing-config` leem e gravam config + catálogo de add-ons (JSONB via Drizzle).
- [ ] Tela da calculadora mostra breakdown ao vivo e seleção de add-ons.
- [ ] Tela de config edita rates, multiplicadores, descontos, mínimo e CRUD de add-ons.
- [ ] Dinheiro tratado como cents inteiros; nenhum decimal quebrado em valor monetário.

## 7. Decisões em aberto

- Nome do produto/repositório (default de trabalho: *Estimate Engine*).
- Multi-tenant: fora do escopo do núcleo; reavaliar após a Fase 4.
- Contrato exato de `Customer` ↔ m4m: detalhar na Fase 4.
- Pacote de tipos compartilhado entre back e front: melhoria futura (Fase 1 duplica os tipos).

## 8. Próximo passo

O plano de implementação da Fase 1 está em `docs/plans/2026-06-22-fase-1-calculadora.md`
(stack Node/Fastify/Drizzle). Os guias de estudo em `docs/guides/` ensinam a implementá-lo.
