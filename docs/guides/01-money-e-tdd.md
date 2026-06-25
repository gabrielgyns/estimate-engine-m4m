# Módulo 1 — `Money`, arredondamento e fundamentos de TDD

> **Como usar este guia:** eu **explico o porquê**, te dou os **models** (assinaturas de tipo
> e de função) e os **testes (RED)** prontos para rodar. **Você escreve a implementação.** A
> resposta existe no plano (`docs/plans/2026-06-22-fase-1-calculadora.md`, Task 1), mas use-o só
> como *gabarito* quando travar de verdade. Você aprende escrevendo, não lendo.

---

## 1. Objetivo

Ao terminar este módulo, você vai ter:

- O scaffold do backend Node + TypeScript (ESM) com **Vitest** configurado e rodando.
- O tipo `Money` (dinheiro como **inteiro em cents**) e a função `roundHalfUp`.
- Praticado o ciclo **TDD** completo (*red → green → refactor*) pela primeira vez.

Este é o tijolo de base da engine: todo valor monetário no Estimate Engine passa por aqui.

## 2. Conceitos

### 2.1 Por que dinheiro NUNCA deve ser float / decimal quebrado

Números de ponto flutuante (`number` em JS, que é IEEE 754 de 64 bits) não representam a maioria
das frações decimais com exatidão. O exemplo clássico:

```js
0.1 + 0.2 === 0.3        // false
0.1 + 0.2                // 0.30000000000000004
```

Isso acontece porque `0.1` e `0.2` não têm representação binária finita — o computador guarda uma
aproximação. Some várias dessas aproximações ao longo de uma fórmula de preço e os centavos
**derivam**. Em dinheiro, errar um centavo é um bug: a soma de uma fatura não bate, um desconto
fica $0.01 fora, o cliente reclama. Para dinheiro, "quase certo" é **errado**.

### 2.2 A solução: inteiros em cents

Em vez de representar $190.00 como o float `190.0`, representamos como o **inteiro** `19000`
(cents). Toda a aritmética acontece em inteiros, que o computador soma e subtrai **exatamente**.
A conversão para "dólares com vírgula" só acontece na hora de **exibir** (no frontend,
dividindo por 100). É por isso que, no glossário, definimos:

> `Money` = `number` inteiro em cents (ex.: `19000` = $190.00).

### 2.3 Por que `number` em cents é seguro em JavaScript

JavaScript só tem um tipo numérico (`number`, float de 64 bits) — não existe um tipo inteiro
nativo separado. Mas isso **não é problema** para nós: o `number` representa **com exatidão**
todos os inteiros até **2^53** (≈ 9 quatrilhões), o limite chamado `Number.MAX_SAFE_INTEGER`.
Enquanto mantivermos os valores como inteiros (cents) e nunca passarmos de 2^53, a aritmética
inteira é perfeita. Nenhuma fatura de limpeza chega perto desse teto. Por isso `type Money = number`
é seguro — desde que a gente combine que esse `number` é **sempre um inteiro de cents**.

> O perigo nunca é o tamanho do número; é a **fração**. Por isso a regra: float só aparece em
> dois lugares (o multiplicador de serviço e o percentual de desconto), e **sempre** arredondamos
> de volta para cents inteiros logo depois. É aí que entra `roundHalfUp`.

### 2.4 Por que precisamos arredondar (e o que é "half up")

A fórmula de preço (módulo 3) multiplica o subtotal por um **multiplicador** (float, ex.: `1.8`)
e por um **percentual de desconto** (float, ex.: `0.2`). Multiplicar um inteiro de cents por um
float pode produzir um valor **fracionário de cent**, ex.:

```
34199 * 1.0  = 34199        (inteiro, ok)
19000 * 0.05 = 950          (inteiro, ok)
34199 * 0.5  = 17099.5      (meio cent! — precisa arredondar)
```

Não existe "meio cent" no mundo real. Precisamos decidir uma regra de arredondamento e aplicá-la
de forma consistente. Usamos **half up**: quando a fração é exatamente `.5`, arredonda para
**cima** (afastando de zero). Para os nossos valores (sempre positivos), "half up" é o
comportamento intuitivo que todo mundo aprende na escola:

```
17099.4  → 17099   (fração < .5, arredonda p/ baixo)
17099.5  → 17100   (fração = .5, arredonda p/ cima)
17099.6  → 17100   (fração > .5, arredonda p/ cima)
```

Em JS, `Math.round` faz **"half away from zero"** (afasta de zero no `.5`). Para valores
**positivos**, isso é exatamente half up. Como cents de preço são sempre ≥ 0 no nosso domínio,
`Math.round` resolve. (Dica que você vai usar no GREEN — mas a implementação é sua.)

### 2.5 TDD: o ciclo red → green → refactor

Você vai repetir este ciclo o tempo todo:

```
1. RED      Escreva um teste que descreve o comportamento desejado. Rode. Ele FALHA
            (a função ainda não existe).
2. GREEN    Escreva o MÍNIMO de código para o teste passar. Sem firula.
3. REFACTOR Com o verde garantido, melhore o código sem quebrar o teste. Rode de novo.
```

**Por que o teste primeiro?** Porque te força a definir *o que* o código deve fazer antes de
*como*. O teste vira a especificação executável e a sua rede de segurança. Neste curso, **eu te
dou o teste (RED)** e **você faz o GREEN**.

## 3. Models

São estes os artefatos que você vai criar neste módulo. O **tipo** pode ser mostrado por inteiro
(é só uma definição de tipo). A **função** vem só com a assinatura — o corpo é seu.

> Estes arquivos moram em `src/domain/` — o núcleo puro do backend, sem framework. Veja o guia
> `09-organizacao-do-projeto.md` para entender a estrutura `domain/ · modules/ · infra/`.

```ts
// backend/src/domain/pricing/money.ts

// Money é um valor monetário em cents (inteiro). Nunca use decimais quebrados para dinheiro.
export type Money = number;

// roundHalfUp arredonda um valor em cents (possivelmente fracionário) para o cent inteiro
// mais próximo, com "half up" (no .5, arredonda afastando de zero).
export function roundHalfUp(value: number): Money;
```

> **Convenção ESM (importante):** o backend é ESM (`"type": "module"`) com
> `moduleResolution: NodeNext`. Por isso, nos imports relativos do **código de produção** e dos
> **testes**, o caminho leva extensão `.js` mesmo o arquivo sendo `.ts` — ex.:
> `import { roundHalfUp } from "./money.js";`. Isso é normal e esperado.

## 4. Testes (RED)

Antes dos testes, faça o **setup** do projeto (isto é configuração, não implementação — pode
seguir à risca).

### 4.1 Setup do repositório e do projeto Node

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

### 4.2 `backend/tsconfig.json`

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

- `target: ES2022` — JavaScript moderno como saída.
- `module`/`moduleResolution: NodeNext` — ESM de verdade; é o que exige o `.js` nos imports.
- `strict: true` — liga todas as checagens do TypeScript. Mais segurança, menos surpresa.

### 4.3 Scripts em `backend/package.json` (campo `"scripts"`)

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

### 4.4 O teste (cole e rode no vermelho)

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

Rode e **confirme que falha** (esse é o RED):

```bash
cd ~/Dev/estimate-engine/backend
npx vitest run src/domain/pricing/money.test.ts
```

Esperado: **FAIL** com algo como `Cannot find module './money.js'` — porque `money.ts` ainda não
existe. Esse erro vermelho é o ponto de partida correto.

## 5. Seu desafio (GREEN)

Crie `backend/src/domain/pricing/money.ts` e faça o teste ficar **verde**. Você precisa:

1. Exportar o tipo `export type Money = number;` (essa parte é definição de tipo; pode escrever
   exatamente assim).
2. Implementar `export function roundHalfUp(value: number): Money` para que **todos** os cinco
   `expect` passem.

**Dicas (sem entregar o corpo):**

- Pense no que "arredondar para o inteiro mais próximo, half up" significa para valores positivos.
- O JS já tem uma função na biblioteca-padrão `Math` que faz exatamente "half away from zero".
  Reveja a seção 2.4: para positivos, isso coincide com half up.
- A implementação cabe em **uma linha**. Se você está escrevendo muito código, recuou demais —
  GREEN é o mínimo para passar.

Rode de novo até ficar verde:

```bash
cd ~/Dev/estimate-engine/backend
npx vitest run src/domain/pricing/money.test.ts
```

Esperado: **PASS**.

## 6. Refactor & boas práticas

- **Documente a intenção, não o óbvio.** Um comentário curto dizendo *por que* `Math.round` serve
  (porque os valores são positivos ⇒ half up) vale mais que "arredonda o valor".
- **Não generalize cedo.** Você pode ficar tentado a já tratar valores negativos ou outros modos
  de arredondamento. Não faça — não temos teste pedindo isso, e o domínio (preços) só tem cents
  positivos. YAGNI.
- **Rode a suíte inteira** ao final para garantir que nada quebrou:

```bash
npx vitest run src/domain/pricing/
```

- Quando estiver verde, **commite** (o curso assume que você versiona cada passo):

```bash
cd ~/Dev/estimate-engine
git add .gitignore backend/package.json backend/tsconfig.json backend/package-lock.json \
  backend/src/domain/pricing/money.ts backend/src/domain/pricing/money.test.ts
git commit -m "feat(pricing): scaffold backend, Money type and roundHalfUp"
```

## 7. Checklist de conclusão

- [ ] `npm pkg set type="module"` aplicado (o `package.json` tem `"type": "module"`).
- [ ] `tsconfig.json` com `target ES2022`, `module`/`moduleResolution NodeNext`, `strict: true`.
- [ ] Vitest instalado e rodando.
- [ ] `money.test.ts` passou pelo ciclo: **rodou vermelho** antes de você implementar.
- [ ] `roundHalfUp(150.5) === 151` e `roundHalfUp(34199.5) === 34200` passam.
- [ ] `npx vitest run src/domain/pricing/` está **verde**.

## 8. Para se aprofundar

- **IEEE 754 / ponto flutuante:** por que `0.1 + 0.2 !== 0.3`. Procure por "What Every Computer
  Scientist Should Know About Floating-Point Arithmetic" (clássico) ou "0.30000000000000004".
- **Money como inteiro:** o padrão "store money as integer minor units" (cents) é universal em
  fintech; bibliotecas como `dinero.js` existem justamente para formalizar isso.
- **`Number.MAX_SAFE_INTEGER`** (2^53 − 1): entenda a fronteira da aritmética inteira segura em JS.
- **Modos de arredondamento:** "round half up", "round half to even" (banker's rounding) e o que
  `Math.round` faz de fato (half **away from zero** — cuidado com negativos, que não usamos aqui).
- **TDD:** Kent Beck, *Test-Driven Development by Example* — a fonte do ciclo red-green-refactor.

---

Pronto? Vá para **`02-modelo-de-dominio.md`** — os tipos do domínio + `defaultConfig`.
