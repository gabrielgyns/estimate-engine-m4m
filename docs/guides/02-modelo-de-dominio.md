# Módulo 2 — Modelo de domínio + `defaultConfig`

> **Como usar este guia:** eu explico o *porquê* e te dou os **models completos** (são definições
> de tipos — `type` e `interface` —, não implementação, então você pode usá-los como estão). O
> **teste (RED)** também vem pronto. A **única coisa que você implementa** é o corpo de
> `defaultConfig`. A resposta existe no plano (`docs/plans/...`, Task 2), mas tente sem ele primeiro.

---

## 1. Objetivo

Ao terminar este módulo, você vai ter:

- Os **tipos do domínio** da engine de preços em TypeScript: `ServiceType`, `Frequency`, `AddOn`,
  `SelectedAddOn`, `PricingConfig`, `QuoteInput`, `AddOnLine` e `QuoteBreakdown`.
- A função `defaultConfig(): PricingConfig` — a **config-semente** com os valores do protótipo.
- Entendido por que modelamos o domínio com **union types nomeados** em vez de strings cruas, e
  por que o `QuoteBreakdown` é **itemizado**.

## 2. Conceitos

### 2.1 O que é "modelar um domínio"

Modelar um domínio é dar **nomes e formas** (tipos) aos conceitos do problema, de modo que o
código fale a linguagem do negócio. No nosso caso o negócio é *house cleaning*: existem **tipos
de serviço**, **frequências**, **add-ons** (extras), uma **configuração de preços** e o
**resultado** de um cálculo. Quando esses conceitos viram tipos explícitos, o compilador passa a
trabalhar a seu favor: ele recusa estados impossíveis antes de o código rodar.

Os tipos do domínio são o **vocabulário compartilhado** do projeto. Toda a engine, a API e o
frontend conversam usando estes nomes.

### 2.2 Por que union types nomeados em vez de strings cruas

Compare:

```ts
service: string                                    // ruim
service: "deep_clean" | "recurring" | "move_in_out"  // bom (union type nomeado)
```

Com `string`, qualquer texto compila — `"deepclean"`, `"DEEP_CLEAN"`, `"banana"`. O erro só
aparece em runtime (ou nunca). Com o **union type** `ServiceType`, o TypeScript:

- **Recusa valores inválidos na compilação** — `service: "banana"` não compila.
- **Autocompleta** os valores válidos no editor.
- **Garante exaustividade** — quando você indexa `serviceMultipliers[service]`, o compilador sabe
  que toda chave possível existe.

É a diferença entre "documentar por convenção" e "tornar impossível errar". Por isso definimos
`ServiceType` e `Frequency` como unions nomeados, e os reusamos em todo lugar (inclusive como
chaves de `Record` em `PricingConfig`).

### 2.3 Por que add-ons viram um catálogo configurável

Add-ons (ex.: "Inside Fridge", "Inside Oven") **não** são constantes do código — são dados que o
dono do negócio gerencia (add/edit/delete + preço). Por isso eles moram **dentro da
`PricingConfig`** como uma lista (`AddOn[]`), que mais tarde é persistida como **JSONB** no
Postgres. O cálculo recebe os add-ons *escolhidos* (`SelectedAddOn`, que é só `addOnId` +
`quantity`) e procura o preço no catálogo da config. Assim:

- O catálogo é editável sem deploy.
- A escolha do cliente referencia o catálogo por `id` (e a engine valida que o id existe).

### 2.4 Por que o `QuoteBreakdown` é itemizado

O resultado do cálculo **não** é só o total. É um **breakdown itemizado**: cada linha do preço
(base, sqft, quartos, banheiros, pets, subtotal, multiplicador, desconto, cada add-on, desconto
manual e total). Por quê?

- **A UI mostra o detalhamento ao vivo** — o cliente vê de onde vem cada dólar.
- **A estimate/proposta** (Fase 2) precisa do detalhamento para o documento.
- **Depuração e confiança** — quando o total parece errado, o breakdown mostra exatamente qual
  linha está fora.

Um resultado "gordo" e explícito custa pouco e paga muito. Preferimos devolver tudo mastigado a
forçar o consumidor a recalcular.

### 2.5 Tipos compartilháveis com o frontend

Estes tipos são **TypeScript puro**, sem dependência de HTTP nem de banco. Isso significa que o
frontend pode usar (ou espelhar) exatamente os mesmos tipos para tipar as respostas da API. Na
Fase 1 o frontend duplica os tipos (`frontend/src/types.ts`); numa fase futura eles podem virar um
**pacote compartilhado** entre back e front. Modelar o domínio uma vez e reaproveitar é um dos
grandes ganhos de um stack full-TypeScript.

### 2.6 O que é uma "config-semente" (`defaultConfig`)

`defaultConfig()` devolve uma `PricingConfig` com os **valores iniciais** validados contra o
protótipo. Ela serve para dois propósitos:

1. **Testes** — a engine é testada contra esses valores conhecidos (o golden case depende deles).
2. **Seed do banco** (Fase 5/módulo de persistência) — quando a tabela de config está vazia, o
   repository grava `defaultConfig()` como ponto de partida.

É uma função simples (sem I/O): só retorna um objeto literal. Mas é a **fonte da verdade dos
números** do domínio, então os valores precisam estar exatos.

## 3. Models

Estes tipos são **definições** — copie-os como estão. (A implementação que você vai escrever é só
o corpo de `defaultConfig`, na seção 5.)

> Como todo o domínio, estes arquivos moram em `src/domain/pricing/` — o núcleo puro do backend.
> Veja o guia `09-organizacao-do-projeto.md` para a estrutura `domain/ · modules/ · infra/`.

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

### 3.1 Campo a campo — por que cada um existe

**`ServiceType`** — o tipo de serviço (`deep_clean`, `recurring`, `move_in_out`). Determina o
multiplicador aplicado.

**`Frequency`** — a frequência (`one_time`, `weekly`, `bi_weekly`, `monthly`). Determina o
percentual de desconto.

**`AddOn`** — um item do catálogo configurável. `id` (referência estável), `name` (rótulo na UI),
`price` (`Money`, por unidade).

**`SelectedAddOn`** — a *escolha* do cliente: só `addOnId` + `quantity`. Não carrega preço — o
preço vem do catálogo na hora do cálculo (a config é a fonte da verdade).

**`PricingConfig`** — os parâmetros do cálculo:
- `basePrice`, `perSqft`, `perBedroom`, `perBathroom`, `perPet` — as tarifas (todas `Money`, em
  cents).
- `serviceMultipliers: Record<ServiceType, number>` — fator por serviço (float; `1.0` = sem
  ajuste). Usar `Record<ServiceType, …>` força ter uma entrada para **cada** serviço.
- `frequencyDiscounts: Record<Frequency, number>` — percentual por frequência (float entre 0 e 1).
- `minimumPrice` — o **piso**: o total nunca fica abaixo dele.
- `addOns: AddOn[]` — o catálogo configurável (vira JSONB no banco).

**`QuoteInput`** — a entrada do cálculo: dados do imóvel (`sqft`, `bedrooms`, `bathrooms`,
`pets`), `service`, `frequency`, os add-ons escolhidos e o `manualDiscount` (desconto manual em
cents).

**`AddOnLine`** — uma linha de add-on **já calculada** no breakdown: além de `addOnId`, `name`,
`unitPrice` e `quantity`, traz o `lineTotal` (preço × quantidade). A UI usa isso direto.

**`QuoteBreakdown`** — o resultado **itemizado** (ver 2.4). Cada campo é uma linha do detalhamento
mais os totais intermediários (`subtotal`, `afterMultiplier`, `frequencyDiscountAmount`,
`addOnsTotal`) e o `total` final.

`backend/src/domain/pricing/config.ts` (a função que **você** implementa — aqui só a assinatura):

```ts
import type { PricingConfig } from "./types.js";

// defaultConfig: config-semente usada quando ainda não há config no banco.
// Valores do protótipo Estimate Engine.
export function defaultConfig(): PricingConfig;
```

## 4. Testes (RED)

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

Rode e **confirme que falha** (RED):

```bash
cd ~/Dev/estimate-engine/backend
npx vitest run src/domain/pricing/config.test.ts
```

Esperado: **FAIL** (`Cannot find module './config.js'`).

## 5. Seu desafio (GREEN)

1. Crie `backend/src/domain/pricing/types.ts` com os tipos da seção 3 (são definições — pode copiar).
2. Crie `backend/src/domain/pricing/config.ts` e implemente o **corpo** de `defaultConfig()`: ela deve
   retornar uma `PricingConfig` montada com os valores abaixo.

**Tabela de valores esperados (a fonte da verdade dos números):**

| Campo | Valor | Em dólares |
|-------|-------|-----------|
| `basePrice` | `8000` | $80.00 |
| `perSqft` | `6` | $0.06 |
| `perBedroom` | `1500` | $15.00 |
| `perBathroom` | `2000` | $20.00 |
| `perPet` | `500` | $5.00 |
| `minimumPrice` | `0` | $0.00 |
| `serviceMultipliers.deep_clean` | `1.0` | — |
| `serviceMultipliers.recurring` | `1.0` | — |
| `serviceMultipliers.move_in_out` | `1.8` | — |
| `frequencyDiscounts.one_time` | `0.0` | — |
| `frequencyDiscounts.weekly` | `0.2` | — |
| `frequencyDiscounts.bi_weekly` | `0.1` | — |
| `frequencyDiscounts.monthly` | `0.05` | — |

**Add-ons pré-criados** (catálogo inicial — três itens):

| `id` | `name` | `price` | Em dólares |
|------|--------|---------|-----------|
| `inside_fridge` | `Inside Fridge` | `3000` | $30.00 |
| `inside_oven` | `Inside Oven` | `2500` | $25.00 |
| `interior_windows` | `Interior Windows` | `500` | $5.00 |

**Dicas (sem entregar o corpo):**

- `defaultConfig` não faz I/O nenhum — é só `return { ... }` com um objeto literal.
- Como `serviceMultipliers` é `Record<ServiceType, number>`, você **precisa** preencher as três
  chaves; o compilador reclama se faltar alguma. O mesmo vale para as quatro frequências.
- Os multiplicadores e descontos são floats *de propósito* (são fatores, não dinheiro). Tudo bem.
- Comente os valores em cents com o equivalente em dólares (como na tabela) — ajuda quem lê depois.

Rode até ficar verde:

```bash
cd ~/Dev/estimate-engine/backend
npx vitest run src/domain/pricing/config.test.ts
```

Esperado: **PASS**.

## 6. Refactor & boas práticas

- **Os tipos primeiro, os valores depois.** Com `types.ts` no lugar, deixe o compilador te guiar
  ao montar `defaultConfig` — campo faltando vira erro de tipo, não bug silencioso.
- **Não invente campos.** Implemente exatamente os tipos da seção 3. Resista à tentação de já
  adicionar coisas das próximas fases (estimate, cliente etc.) — elas têm seu próprio módulo.
- **Confirme a suíte inteira** antes de commitar:

```bash
npx vitest run src/domain/pricing/
```

- Commit sugerido:

```bash
cd ~/Dev/estimate-engine
git add backend/src/domain/pricing/types.ts backend/src/domain/pricing/config.ts backend/src/domain/pricing/config.test.ts
git commit -m "feat(pricing): add domain types and defaultConfig"
```

## 7. Checklist de conclusão

- [ ] `types.ts` define `ServiceType`, `Frequency`, `AddOn`, `SelectedAddOn`, `PricingConfig`,
      `QuoteInput`, `AddOnLine`, `QuoteBreakdown`.
- [ ] `config.ts` exporta `defaultConfig()` e o teste está **verde**.
- [ ] Os números batem com a tabela (base `8000`, perSqft `6`, `move_in_out` `1.8`, `weekly` `0.2`).
- [ ] O catálogo inicial tem os três add-ons (`inside_fridge`, `inside_oven`, `interior_windows`).
- [ ] `serviceMultipliers` e `frequencyDiscounts` têm **todas** as chaves dos respectivos unions.
- [ ] `npx vitest run src/domain/pricing/` continua **verde** (incluindo o módulo 1).

## 8. Para se aprofundar

- **Union types / literal types** no TypeScript: por que `"a" | "b"` é mais seguro que `string`.
- **`Record<K, V>` e exaustividade:** como `Record<ServiceType, number>` força cobrir todas as
  chaves, e o padrão de *exhaustiveness check* com `never`.
- **Domain modeling / ubiquitous language** (DDD): nomear os conceitos do negócio no código.
- **"Make illegal states unrepresentable":** desenhar tipos que não permitem dados inválidos.
- **`interface` vs `type` no TypeScript:** quando usar cada um (aqui usamos `interface` para
  objetos do domínio e `type` para os unions e para `Money`).

---

Pronto? Vá para **`03-engine-de-calculo.md`** — a função `calculate`: subtotal → multiplicador →
desconto → add-ons.
