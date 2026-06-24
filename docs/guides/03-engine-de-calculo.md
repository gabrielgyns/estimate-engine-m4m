# 03 — Engine de cálculo (`calculate`)

> **Como usar este guia:** você vai construir a função `calculate` **incrementalmente via TDD**,
> em três etapas. Eu te dou os **testes (RED)** e a **explicação do algoritmo**; **você escreve a
> implementação**. A resposta existe no plano (`docs/plans/2026-06-22-fase-1-calculadora.md`,
> Tasks 3, 4 e 5), mas só consulte como *gabarito* quando travar de verdade. Você aprende
> escrevendo, não lendo.
>
> **Pré-requisitos:** guias `01-money-e-tdd.md` (tipo `Money`, `roundHalfUp`) e
> `02-modelo-de-dominio.md` (os tipos `QuoteInput`, `PricingConfig`, `QuoteBreakdown`, etc. +
> `defaultConfig()`). Se você ainda não tem esses tipos no diretório `src/pricing`, volte e termine
> o guia 02 antes.

---

## 1. Objetivo

Construir `calculate`: a **engine pura de preços** do Estimate Engine. Ela recebe um `QuoteInput`
(dados do imóvel + serviço + add-ons selecionados) e uma `PricingConfig`, e devolve um
`QuoteBreakdown` **itemizado** (linha a linha, mais o total).

Ao terminar você vai ter praticado:

- **Deep module na prática:** uma função sem HTTP, sem DB, sem efeitos colaterais.
- **Construção incremental via TDD:** três etapas, cada uma com seus testes ficando verdes antes de
  seguir para a próxima.
- **Money handling correto:** arredondar de volta para cents inteiros após cada multiplicação por
  float.
- **O golden case** como rede de segurança contra regressões.

A **validação de input** (recusar negativos, service desconhecido, etc.) fica no guia **04**. Aqui a
engine confia que o input é bem-formado; lá ela passa a não confiar.

## 2. Conceitos

### 2.1 Deep module aplicado: `calculate` é função pura

A engine é o exemplo canônico de **deep module**: muita lógica de negócio atrás de uma interface
minúscula. A assinatura é só isto:

```ts
export function calculate(input: QuoteInput, config: PricingConfig): QuoteBreakdown
```

Repare no que **não** está aí: nada de `Request`, `Response`, conexão de banco, `async`, `Promise`.
A função é **pura** — para o mesmo `(input, config)`, sempre o mesmo `QuoteBreakdown`, sem tocar em
nada externo. Isso a torna:

- **Trivial de testar:** sem subir Fastify nem Postgres; é só chamar a função e checar o retorno.
- **Fácil de raciocinar:** você segura o algoritmo inteiro na cabeça.
- **Portável:** amanhã essa mesma fórmula pode virar um serviço no Laravel do m4m.

O backend é a **fonte da verdade do cálculo**. O frontend nunca reimplementa a fórmula — ele chama
`POST /api/quotes/calculate`, que por baixo chama `calculate`. Toda a complexidade de preço vive
aqui, num único lugar.

### 2.2 A fórmula completa

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

### 2.3 As decisões de domínio (entenda cada uma)

A fórmula codifica **decisões de negócio** que vieram do protótipo validado. Não são arbitrárias —
cada uma tem uma razão, e você precisa entendê-las para não "corrigir" o que está certo:

**(a) O multiplicador incide sobre o subtotal inteiro, incluindo pets.**
`afterMultiplier = subtotal * serviceMultiplier`. O `subtotal` já soma `pets * perPet`. Então quando
o serviço é `move_in_out` (1.8×), a parcela de pets também é multiplicada por 1.8. A lógica de
negócio: um move-in/out é mais trabalhoso *em tudo*, inclusive lidar com pelos de pet — então o
multiplicador escala o serviço completo, sem exceções.

**(b) O desconto de frequência incide sobre o `afterMultiplier` (o valor cheio do serviço).**
`freqDiscount = afterMultiplier * frequencyDiscount`. Ou seja: primeiro aplicamos o multiplicador,
*depois* descontamos a fidelidade sobre esse valor já multiplicado. A lógica: o desconto recompensa
recorrência (weekly = 20% off) sobre o preço real do serviço naquele dia.

**(c) Add-ons entram como valor fixo, somados DEPOIS — não escalam, não recebem desconto.**
`total = afterMultiplier - freqDiscount + addOnsTotal - manualDiscount`. Os add-ons (ex.: "Inside
Fridge" por $30) são preço de tabela: **não** são multiplicados pelo `serviceMultiplier` e **não**
recebem o desconto de frequência. Um add-on custa o que custa, independentemente do serviço ou da
recorrência. Por isso ele entra na conta só no fim. *(O spec marca essa decisão como revisável no
futuro — mas para a Fase 1 é assim.)*

**(d) Snapshot de add-ons (relevante na Fase 2).**
O catálogo de add-ons é configurável (o usuário pode editar preços). Quando, na Fase 2, uma estimate
for persistida, os add-ons escolhidos serão **congelados como JSON na própria estimate**. Mudar o
catálogo depois não altera estimates antigas. Na Fase 1 não persistimos nada (o cálculo é
stateless), mas o `QuoteBreakdown` já devolve cada `AddOnLine` itemizada justamente para que, lá na
frente, esse snapshot seja trivial de gravar. Você está construindo a fundação dele agora.

### 2.4 `roundHalfUp` a cada multiplicação por float

Dinheiro é **inteiro em cents** (`type Money = number`). A única hora em que floats aparecem é nas
multiplicações por `serviceMultiplier` e por `frequencyDiscount` — ambos são `number` fracionários
(ex.: `1.8`, `0.2`). Após **cada** uma dessas multiplicações, arredonde **na hora** de volta para um
cent inteiro com `roundHalfUp` (que você fez no guia 01). Exemplo do conceito (esta é uma linha-dica,
não a função inteira):

```ts
const afterMultiplier = roundHalfUp(subtotal * serviceMultiplier);
```

Por que arredondar *imediatamente* e não só no fim? Porque se você deixar frações de cent se
acumularem por várias operações, o erro propaga e o total final pode fechar com 1 cent de diferença
do esperado. Arredondar a cada passo mantém todo valor intermediário como cent inteiro — exatamente o
que o `QuoteBreakdown` promete em cada campo.

## 3. Models (as assinaturas — você implementa)

Você já tem os tipos do guia 02 (`QuoteInput`, `PricingConfig`, `QuoteBreakdown`, `AddOnLine`, etc.)
e o `roundHalfUp` do guia 01. A única coisa nova aqui é a assinatura da função, no arquivo
`src/pricing/calculate.ts`:

```ts
import { roundHalfUp } from "./money.js";
import type { PricingConfig, QuoteBreakdown, QuoteInput } from "./types.js";

// calculate é a engine pura de preços: input + config -> breakdown itemizado.
export function calculate(input: QuoteInput, config: PricingConfig): QuoteBreakdown;
```

> Lembre da regra de ESM/NodeNext: nos imports relativos do código TS de produção a extensão é
> `.js` mesmo o arquivo sendo `.ts` (`./money.js`, `./types.js`). Isso é normal e esperado.

O corpo é **seu desafio**. Vamos construí-lo em três etapas, cada uma guiada por testes.

## 4. Construção incremental por TDD (3 etapas)

Crie o arquivo de teste `src/pricing/calculate.test.ts`. Em todas as etapas, este header fica no
topo (o `baseInput` é o golden case da Helena, reutilizado em quase todo teste):

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
```

---

### Etapa A — subtotal (Task 3)

**Os testes (RED).** Adicione ao arquivo:

```ts
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

Rode e confirme que falha (o módulo ainda não existe):

```bash
cd ~/Dev/estimate-engine/backend
npx vitest run src/pricing/calculate.test.ts
```

Esperado: **FAIL** (`Cannot find module './calculate.js'`).

**O que implementar (GREEN), em prosa.** Crie `src/pricing/calculate.ts` com a função `calculate`.
Nesta etapa ela só precisa preencher os **campos de subtotal** do breakdown; os demais campos do
`QuoteBreakdown` ainda podem ir como `0` / `[]` (placeholders que as próximas etapas substituem).

Dicas:

- `base` é direto: `config.basePrice`.
- Cada *charge* é uma multiplicação de uma quantidade do `input` por uma taxa da `config` — ex.:
  `sqftCharge = input.sqft * config.perSqft`. Faça o mesmo para bedrooms, bathrooms e pets.
- `subtotal` é a soma de todas as charges (incluindo `base` e `petsCharge`). Como `perSqft` e
  amigos já são cents inteiros e as quantidades são inteiras, **aqui não há float** — não precisa de
  `roundHalfUp` ainda.
- Retorne um `QuoteBreakdown` completo: preencha os 6 campos de subtotal com os valores calculados e
  os outros campos com placeholders (`serviceMultiplier: 0`, `afterMultiplier: 0`,
  `frequencyDiscountPct: 0`, `frequencyDiscountAmount: 0`, `addOns: []`, `addOnsTotal: 0`,
  `manualDiscount: 0`, `total: 0`).

> Você já pode importar o `roundHalfUp` no topo (vai usá-lo na Etapa B). Se o lint reclamar de import
> não usado, ignore por ora.

Rode de novo; deve passar:

```bash
npx vitest run src/pricing/calculate.test.ts
```

Esperado: **PASS**.

---

### Etapa B — multiplicador + desconto + golden case (Task 4)

**Os testes (RED).** Adicione ao arquivo:

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

Rode e confirme que falha (`total`/`afterMultiplier` ainda valem `0`):

```bash
npx vitest run src/pricing/calculate.test.ts
```

Esperado: **FAIL**.

**As contas do golden case (decore este número).** O golden case da Helena — Deep Clean, One-time,
1000 sqft, 2 quartos, 1 banheiro, 0 pets, sem add-ons:

```
base            = 8000                       ($80.00)
sqftCharge      = 1000 * 6   = 6000          ($60.00)
bedroomsCharge  = 2 * 1500   = 3000          ($30.00)
bathroomsCharge = 1 * 2000   = 2000          ($20.00)
petsCharge      = 0 * 500    = 0
subtotal        = 8000+6000+3000+2000+0 = 19000

serviceMultiplier (deep_clean) = 1.0
afterMultiplier = 19000 * 1.0 = 19000

frequencyDiscount (one_time)   = 0.0
freqDiscount    = 19000 * 0.0 = 0

addOnsTotal     = 0
manualDiscount  = 0

total = 19000 - 0 + 0 - 0 = 19000  →  max(19000, 0) = 19000  =  $190.00 ✅
```

**Por que esse caso importa tanto.** Ele exercita a fórmula inteira com números redondos e um
resultado memorável (`19000`). Ele aparece como teste em **vários** módulos do projeto (engine, HTTP,
UI). Se ele quebrar em qualquer lugar, é o primeiro sinal de que algo na fórmula regrediu — é a sua
rede de segurança contra mudanças que parecem inofensivas.

**O que implementar (GREEN), em prosa.** Estenda `calculate` para preencher `serviceMultiplier`,
`afterMultiplier`, `frequencyDiscountPct`, `frequencyDiscountAmount` e `total` (ainda **sem** add-ons
nesta etapa). Dicas:

- Pegue o multiplicador na config indexando pelo service: `config.serviceMultipliers[input.service]`.
  Esse é um `number` fracionário (float).
- `afterMultiplier` é o `subtotal` vezes esse multiplicador, **arredondado na hora**:
  `roundHalfUp(subtotal * serviceMultiplier)`. (É exatamente o exemplo da seção 2.4 — agora você usa
  de verdade.)
- Pegue o percentual de desconto indexando por frequência:
  `config.frequencyDiscounts[input.frequency]` — outro float.
- `frequencyDiscountAmount` é o `afterMultiplier` vezes esse percentual, **também arredondado**:
  `roundHalfUp(afterMultiplier * frequencyDiscountPct)`. Note a decisão (b): o desconto incide sobre
  o `afterMultiplier`, não sobre o subtotal cru.
- Nesta etapa, `total = afterMultiplier - frequencyDiscountAmount` (add-ons, manualDiscount e piso
  entram na Etapa C).
- Preencha esses campos no objeto de retorno (substituindo os placeholders da Etapa A). `addOns`,
  `addOnsTotal` e `manualDiscount` continuam como placeholder por mais uma etapa.

Rode; todos devem passar:

```bash
npx vitest run src/pricing/calculate.test.ts
```

Esperado: **PASS** (todos).

---

### Etapa C — add-ons + desconto manual + piso (Task 5)

**Os testes (RED).** Adicione ao arquivo:

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

Rode e confirme que falha:

```bash
npx vitest run src/pricing/calculate.test.ts
```

Esperado: **FAIL**.

**O que implementar (GREEN), em prosa.** Complete `calculate` para montar as `AddOnLine`, somar o
`addOnsTotal`, aplicar o `manualDiscount` e o **piso** `minimumPrice`. Dicas:

- **Indexe o catálogo.** Você precisa, para cada add-on selecionado (que traz só `addOnId` +
  `quantity`), achar o `AddOn` correspondente na config (que tem `name` e `price`). Em vez de varrer
  o array a cada item, construa **uma vez** um índice `id → AddOn` com um `Map`:
  `new Map(config.addOns.map((a) => [a.id, a]))`. Lookup vira O(1).
- **Monte as linhas.** Para cada `SelectedAddOn`, busque o `AddOn` no Map e produza uma `AddOnLine`
  com `addOnId`, `name`, `unitPrice` (= `price` do catálogo), `quantity` e
  `lineTotal = price * quantity`. Como `price` é cent inteiro e `quantity` é inteiro, **não há float
  aqui** — sem `roundHalfUp`. (Nesta etapa assuma que todo `addOnId` existe no catálogo; a validação
  de add-on inexistente é o guia 04.)
- **Some o total dos add-ons.** Um `reduce` somando os `lineTotal` de cada linha resolve:
  `addOns.reduce((sum, line) => sum + line.lineTotal, 0)`.
- **Total bruto e piso.** Aplique a fórmula final:
  `rawTotal = afterMultiplier - frequencyDiscountAmount + addOnsTotal - manualDiscount`. Depois
  aplique o piso com `Math.max(rawTotal, config.minimumPrice)`. É isso que impede o total de ficar
  negativo quando um `manualDiscount` grande "come" o serviço inteiro — ele cai no `minimumPrice`.
- Preencha `addOns`, `addOnsTotal`, `manualDiscount` (= `input.manualDiscount`) e `total` no retorno,
  substituindo os últimos placeholders. **Cuidado:** remova o `return` antigo da Etapa B para não
  ter dois returns.

Rode a suíte inteira do diretório e confirme tudo verde:

```bash
npx vitest run src/pricing/
```

Esperado: **PASS** (todos).

## 5. Seu desafio (GREEN) — resumo

Ao final das três etapas você terá escrito o corpo inteiro de `calculate`, sem nunca ter colado a
solução pronta. O contrato a respeitar:

1. **Subtotal** = base + cada charge (sem float).
2. **afterMultiplier** = `roundHalfUp(subtotal * serviceMultiplier)`.
3. **frequencyDiscountAmount** = `roundHalfUp(afterMultiplier * frequencyDiscountPct)`.
4. **addOnsTotal** = soma dos `lineTotal` (flat, indexando o catálogo por `Map`).
5. **total** = `Math.max(afterMultiplier - freqDiscount + addOnsTotal - manualDiscount, minimumPrice)`.

Se travar de verdade, o gabarito está no plano (Tasks 3, 4 e 5) — mas tente fechar cada etapa no
verde sozinho primeiro.

## 6. Refactor & boas práticas

Com tudo verde, melhore sem quebrar os testes:

- **Nomeie os intermediários.** `afterMultiplier`, `frequencyDiscountAmount`, `rawTotal` — variáveis
  com nome contam a história da fórmula. Evite expressões gigantes numa linha só.
- **Mantenha a pureza.** Nada de `console.log`, `Date.now()`, leitura de env ou I/O dentro de
  `calculate`. Se você sentir vontade de fazer isso, o lugar é outra camada (HTTP/repo), não a
  engine.
- **Não otimize cedo.** O `Map` para o catálogo já é a única estrutura que vale a pena. O resto é
  aritmética direta.
- **Re-rode a suíte a cada mudança** (`npx vitest run src/pricing/`). O golden case é o alarme.

## 7. Checklist de conclusão

- [ ] `src/pricing/calculate.ts` exporta `calculate(input, config): QuoteBreakdown`.
- [ ] A função é **pura** (sem HTTP, DB, env, log ou `async`).
- [ ] Etapa A: testes de subtotal verdes.
- [ ] Etapa B: golden case = `19000`, `move_in_out` = `34200`, weekly desconta `3800`, pets entram no
      subtotal e são multiplicados — todos verdes.
- [ ] Etapa C: add-ons somam flat com quantidade; piso mínimo segura o total — verdes.
- [ ] `roundHalfUp` é aplicado **após cada** multiplicação por float (multiplicador e desconto).
- [ ] `npx vitest run src/pricing/` passa inteiro.

## 8. Para se aprofundar

- **Deep modules** (John Ousterhout, *A Philosophy of Software Design*): por que interface pequena +
  muita funcionalidade é o ideal — `calculate` é o caso de estudo do projeto.
- **Funções puras e testabilidade:** por que ausência de efeitos colaterais torna o teste trivial
  (sem mocks, sem setup, sem teardown).
- **Money handling:** por que dinheiro nunca é float "solto"; o padrão de cents inteiros +
  arredondamento na fronteira de cada multiplicação fracionária.
- **Próximo guia:** `04-validacao.md` — ensinar `calculate` a **não confiar no chamador** e lançar
  erros de domínio (`PricingError` e subclasses) antes de calcular.
