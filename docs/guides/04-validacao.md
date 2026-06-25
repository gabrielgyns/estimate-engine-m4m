# 04 — Validação de input e erros de domínio

> **Como usar este guia:** você vai ensinar `calculate` a **recusar input inválido** antes de
> calcular qualquer coisa. Eu te dou as **classes de erro** (definições, que são models), o **teste
> (RED)** e a explicação de *quais* checagens fazer e em *que ordem*; **você escreve o bloco de
> validação**. A resposta existe no plano (`docs/plans/2026-06-22-fase-1-calculadora.md`, Task 6),
> mas só consulte como *gabarito* quando travar de verdade.
>
> **Pré-requisitos:** guia `03-engine-de-calculo.md` — `calculate` já calcula a fórmula completa e
> está toda verde.

---

## 1. Objetivo

Fazer `calculate` **falhar cedo e de forma clara** quando os dados violam um invariante do domínio:
input negativo, service/frequency fora dos enums, add-on que não existe no catálogo, quantidade
inválida. Em vez de produzir um breakdown sem sentido (ou um `NaN`), a engine **lança um erro
específico** — e cada erro estende uma classe base `PricingError`.

Ao terminar você vai ter praticado:

- **Validação em duas camadas** (conceito central do spec): Zod na fronteira HTTP + invariantes de
  domínio na engine pura.
- **Erros como classes em TypeScript:** uma hierarquia com base comum e `instanceof`.
- **Testar exceções no Vitest** com `expect(() => ...).toThrow(ErrClass)`.
- **Ordem de validação:** lançar o erro *mais específico e mais barato* primeiro.

## 2. Conceitos

### 2.1 Validação em DUAS camadas (defesa em profundidade)

O spec exige validar em **dois lugares diferentes**, de propósito:

**Camada 1 — fronteira HTTP, com Zod (guia 06; aqui só mencionamos).** Quando uma requisição
`POST /api/quotes/calculate` chega, um schema Zod valida o **shape**: os campos existem, os tipos são
corretos, os números são não-negativos, `quantity >= 1`, e `service`/`frequency` pertencem aos enums.
Se algo está fora, a rota responde **400** *antes* de chamar `calculate`. Isso lida com lixo
sintático vindo da rede (JSON malformado, campo faltando, string onde devia ser número).

**Camada 2 — domínio, dentro de `calculate` (este guia).** A engine é um **módulo puro que não
confia no chamador**. Ela revalida invariantes que dependem dos *dados* e da *config* — e lança erros
de domínio (`PricingError` e subclasses) se algo está errado.

**Por que ter as duas? Não é redundância?** Não — é **defesa em profundidade**. A razão central:
**a engine pode ser chamada por outros caminhos além do HTTP.** Hoje só a rota a chama; amanhã um
script de seed, um job em background, um teste, ou (na Fase 2) o fluxo de criação de estimate podem
chamar `calculate` direto, sem passar pelo Zod. Se a única validação morasse na camada HTTP, esses
outros caminhos ficariam desprotegidos. Além disso, há checagens que **só a engine sabe fazer**: o
Zod valida que `addOnId` é uma string, mas só a engine, com a `config` em mãos, sabe se aquele
`addOnId` **existe no catálogo**. Cada camada cobre o que a outra não consegue. A engine sendo
autossuficiente é o que a mantém um deep module portável e seguro.

### 2.2 Erros como classes em TypeScript

Em TypeScript, um erro idiomático é uma **classe que estende `Error`**. Vamos ter uma **hierarquia**:
uma base `PricingError` e cinco subclasses, uma por invariante:

- `PricingError` — base comum (não é lançada diretamente).
- `NegativeInputError` — algum número do input é negativo.
- `UnknownServiceError` — `service` não existe em `config.serviceMultipliers`.
- `UnknownFrequencyError` — `frequency` não existe em `config.frequencyDiscounts`.
- `UnknownAddOnError` — um `addOnId` selecionado não existe no catálogo da config.
- `InvalidQuantityError` — a `quantity` de algum add-on é menor que 1.

**Por que uma classe base comum?** Por causa do `instanceof` e do **mapeamento para HTTP**. No guia
06, o handler vai querer transformar *qualquer* erro de domínio em **400**. Com a base comum, isso é
uma única checagem:

```ts
if (err instanceof PricingError) {
  return reply.status(400).send({ error: err.message });
}
throw err; // não é erro de domínio -> deixa virar 500
```

`err instanceof PricingError` é `true` para **todas** as subclasses (é assim que herança funciona).
Então o handler não precisa listar os cinco tipos — ele captura a família inteira por uma referência
só. E se amanhã você adicionar um sexto erro de domínio, basta estendê-lo de `PricingError` e ele já
vira 400 automaticamente, sem tocar no handler. Essa é a vantagem de modelar com uma hierarquia.

### 2.3 As definições das classes (models — pode copiar)

Estas são **definições de tipos** (models), então estão aqui prontas. Crie `src/domain/pricing/errors.ts`
(continua no domínio puro — ver guia `09-organizacao-do-projeto.md`):

```ts
// Erro base do domínio de preços. O handler HTTP mapeia qualquer PricingError para 400.
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

> Cada subclasse define uma mensagem padrão e ajusta `this.name` (útil em stack traces e logs). O que
> diferencia um erro do outro no teste e no handler é a **classe** (via `instanceof`), não o texto.

## 3. Testes (RED)

Você vai testar que `calculate` **lança** a classe certa para cada input ruim. Primeiro, adicione os
imports dos erros no topo de `src/domain/pricing/calculate.test.ts`:

```ts
import {
  NegativeInputError, UnknownServiceError, UnknownFrequencyError,
  UnknownAddOnError, InvalidQuantityError,
} from "./errors.js";
```

Depois adicione o bloco de testes:

```ts
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

Rode e confirme que falha (o módulo de erros ainda não existe):

```bash
cd ~/Dev/estimate-engine/backend
npx vitest run src/domain/pricing/calculate.test.ts
```

Esperado: **FAIL** (`Cannot find module './errors.js'`).

### O padrão de testar exceções no Vitest

Repare em três detalhes do teste:

- **`expect(() => calculate(...))` — uma arrow function, não a chamada direta.** Se você escrevesse
  `expect(calculate(...))`, a função executaria *na hora* e o erro escaparia antes do `expect`
  conseguir capturá-lo, quebrando o teste com a exceção crua. Embrulhar em `() => ...` adia a
  execução: o Vitest chama a função *dentro* do `.toThrow`, captura o que ela lança e compara.
- **`.toThrow(NegativeInputError)` — passando a classe.** Isso afirma "o erro lançado é
  `instanceof NegativeInputError`". É mais robusto do que comparar a mensagem em string (que pode
  mudar). Testamos o **tipo**, que é o que o handler HTTP também vai usar.
- **`"bogus" as never`** burla o TypeScript de propósito: o tipo `ServiceType` não admite `"bogus"`,
  mas em runtime um chamador desonesto (ou dados corrompidos) poderia mandar isso. O `as never`
  permite simular esse cenário no teste — exatamente o tipo de coisa contra a qual a Camada 2
  protege.

## 4. Seu desafio (GREEN) — o bloco de validação

Sua tarefa é inserir as checagens como as **primeiras linhas** de `calculate`, **antes** de qualquer
cálculo (antes do `const base = ...`). Primeiro, importe os erros no topo de `calculate.ts`:

```ts
import {
  NegativeInputError, UnknownServiceError, UnknownFrequencyError,
  UnknownAddOnError, InvalidQuantityError,
} from "./errors.js";
```

Agora descreva o bloco em prosa — **a ORDEM importa**. Valide do mais geral/barato para o mais
específico, e lance assim que achar o primeiro problema:

1. **Negativos primeiro.** Cheque todos os campos numéricos do input que não podem ser negativos:
   `sqft`, `bedrooms`, `bathrooms`, `pets` e `manualDiscount`. Se **qualquer um** for `< 0`, lance
   `new NegativeInputError()`. Dica: uma única condição com `||` cobre todos
   (`input.sqft < 0 || input.bedrooms < 0 || ...`).
2. **Service desconhecido.** Verifique se o `service` do input existe como chave em
   `config.serviceMultipliers`. Se não, lance `new UnknownServiceError()`. Dica: o operador `in` faz
   exatamente isso — `!(input.service in config.serviceMultipliers)`. (Por isso valide negativos
   antes: se o service for inválido, indexar `config.serviceMultipliers[input.service]` lá embaixo
   daria `undefined` e o cálculo viraria `NaN` — a checagem aqui evita isso.)
3. **Frequency desconhecida.** Mesma ideia para a frequência:
   `!(input.frequency in config.frequencyDiscounts)` → `new UnknownFrequencyError()`.
4. **Add-on inexistente ANTES de quantidade.** Percorra os `input.addOns`. Para cada um, primeiro
   confira se o `addOnId` existe no catálogo; **só depois** confira a quantidade. Dicas:
   - Construa **um `Set` dos ids do catálogo** uma vez:
     `new Set(config.addOns.map((a) => a.id))`. Lookup com `.has(sel.addOnId)` é O(1).
   - No loop: se `!catalogIds.has(sel.addOnId)` → `new UnknownAddOnError()`. **Em seguida**, se
     `sel.quantity < 1` → `new InvalidQuantityError()`.
   - A ordem (id antes de quantidade) faz a engine reportar o problema mais fundamental primeiro:
     não adianta reclamar da quantidade de um add-on que sequer existe.

Depois desse bloco, o resto de `calculate` (que você fez no guia 03) segue inalterado — agora ele só
roda quando o input é válido, e pode assumir com segurança que toda indexação por service, frequency
e addOnId vai resolver.

> **Não cole o bloco pronto do plano.** Tente escrevê-lo a partir das dicas acima. Se travar de
> verdade, o gabarito está na Task 6.

Quando terminar, rode a suíte inteira e confirme tudo verde:

```bash
npx vitest run src/domain/pricing/
```

Esperado: **PASS** (todos — os de cálculo do guia 03 *e* os cinco de validação).

## 5. Refactor & boas práticas

- **Valide cedo, retorne/lance cedo.** O bloco de validação no topo é um *guard clause*: ele protege
  o corpo "feliz" da função, que fica livre de `if`s defensivos espalhados.
- **Um erro por invariante.** Não use uma `PricingError` genérica com mensagens diferentes; a classe
  específica é o que permite ao handler e aos testes distinguirem os casos.
- **Mensagens em português, identificadores em inglês.** As `message` podem ser em PT-BR (são para
  humano); os nomes das classes e campos seguem em inglês.
- **Não capture o que você não trata.** A engine *lança*; quem decide virar 400 é o handler HTTP
  (guia 06). Mantenha a responsabilidade separada.

## 6. Checklist de conclusão

- [ ] `src/domain/pricing/errors.ts` define `PricingError` + as 5 subclasses.
- [ ] Todas as subclasses estendem `PricingError` (logo, `instanceof PricingError` é `true` para
      todas).
- [ ] `calculate` valida **no início**, antes de qualquer cálculo.
- [ ] A ordem é: negativos → service → frequency → add-on inexistente → quantidade < 1.
- [ ] Os 5 testes de `calculate — validação de domínio` passam com `.toThrow(ErrClass)`.
- [ ] `npx vitest run src/domain/pricing/` passa inteiro (cálculo + validação).

## 7. Para se aprofundar

- **Defesa em profundidade:** por que validar em mais de uma camada não é desperdício quando as
  camadas têm responsabilidades diferentes (Zod = shape na fronteira; engine = invariantes de
  domínio).
- **Erros como tipos:** modelar falhas como uma hierarquia de classes, e por que `instanceof` numa
  base comum simplifica o tratamento (um único `catch` cobre a família).
- **Guard clauses / fail fast:** validar e lançar no topo da função para manter o corpo principal
  linear e legível.
- **Próximo guia:** `05-persistencia-postgres.md` — sair do mundo puro e persistir a `PricingConfig`
  no Postgres com Drizzle + JSONB e o repository pattern.
