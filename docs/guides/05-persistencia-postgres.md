# 05 — Persistência com Postgres (Drizzle ORM, JSONB e o repository)

> **Como usar este guia:** continuação do curso prático. Eu **explico o porquê**, te dou as
> **assinaturas** (models), o **schema** e os **testes (TDD)** prontos — mas **você escreve a
> implementação**. A resposta existe no plano (`docs/plans/2026-06-22-fase-1-calculadora.md`, Task 7),
> mas use-o só como *gabarito* quando travar de verdade. Você aprende escrevendo, não lendo.

Pré-requisito: ter terminado os guias **01–04** (engine `calculate` completa, com `PricingError`).

---

## 1. Objetivo

Persistir a `PricingConfig` no Postgres e expor o acesso a dados atrás de uma interface mínima.
Ao final deste módulo você vai ter:

- A tabela `pricing_config` definida com **Drizzle ORM** (schema declarativo tipado), em `infra/db/`.
- A coluna `data` como **JSONB** guardando a config inteira, com tipagem estática via `$type<PricingConfig>()`.
- A migration gerada e aplicada com **drizzle-kit**.
- A interface `ConfigStore` (o contrato) e a classe `PricingConfigRepository` que a implementa, no
  módulo `modules/pricing-config/`.
- O comportamento **seed on first read**: se a tabela está vazia, `get` semeia a `defaultConfig`.
- Testes de integração que rodam contra um Postgres real (e se *pulam* sozinhos quando não há banco).

A engine continua **pura**: ela não importa nada de banco. O repository é a única coisa que sabe SQL.

## 2. Conceitos

### 2.1 Repository pattern — por que isolar o acesso a dados

O **repository pattern** é uma camada fina cuja única responsabilidade é **traduzir entre o domínio
e o armazenamento**. O resto da aplicação fala com uma *interface* (`get()`, `save()`), não com
SQL nem com Drizzle.

Por que vale a pena:

- **A engine fica pura.** `calculate(input, config)` recebe a config pronta. Ela não sabe se veio
  do Postgres, de um arquivo, ou de um mock de teste. Isso é o que a mantém *trivial de testar*.
- **Um só lugar para mexer no banco.** Se amanhã você trocar Drizzle por outra coisa, ou mudar o
  layout da tabela, só o repository muda. Nada mais no código importa.
- **Testabilidade por dublê.** Como o HTTP depende de uma *interface* (`ConfigStore`), nos testes
  de handler (guia 06) você passa um `FakeStore` em memória — sem subir banco nenhum.

Em camadas, o fluxo é: `http → repository → engine`. O repository fica **entre** o HTTP e o banco;
a engine fica num canto isolado, sem dependências de infraestrutura.

### 2.2 Onde cada peça mora — `modules/pricing-config/` vs `infra/db/`

A estrutura do projeto é organizada **por papel** (ver guia 09): `domain/` (regras puras),
`modules/<feature>/` (features = fatias verticais) e `infra/` (encanamento técnico). Esse guia
toca dois desses baldes, e a separação não é arbitrária:

- **`modules/pricing-config/repository.ts`** — o repository é a feature **dona daquele dado**.
  Quem sabe que existe uma "pricing config", como ela é lida (seed on first read) e como ela é
  gravada (upsert) é a feature `pricing-config`. A interface `ConfigStore` e a classe
  `PricingConfigRepository` moram aqui porque mudam junto com a feature.
- **`infra/db/schema.ts` e `infra/db/client.ts`** — o **schema das tabelas** e o **client do banco**
  (pool + Drizzle) são **encanamento compartilhável**. Não pertencem a nenhuma feature em
  particular: amanhã `modules/estimates/` e `modules/leads/` vão usar o mesmo `client.ts` e
  declarar tabelas no mesmo `infra/db/schema.ts`. Por isso vivem em `infra/`, não dentro de um módulo.

Isso casa com a **regra de dependência** do guia 09 — a seta aponta sempre pra dentro:

```
modules  →  infra/db      (o repository importa createDb e o schema)
modules  →  domain        (o repository importa defaultConfig e PricingConfig)
```

O `repository.ts` (em `modules/`) importa de `infra/db/` e de `domain/pricing/` — nunca o contrário.
`infra/db/` não sabe que `pricing-config` existe; ele só oferece o cano. O `domain/pricing/`, mais
ao centro ainda, não importa nem `infra` nem `modules`: a engine continua pura.

### 2.3 Drizzle ORM — query builder tipado + connection pool

**Drizzle** é um *query builder tipado* para TypeScript. Você descreve o schema em código
(`pgTable(...)`), e o Drizzle te dá:

- Um objeto `db` para montar queries (`db.select().from(...).where(...)`), com **autocompletar e
  checagem de tipos** baseados no seu schema.
- O **drizzle-kit**, uma CLI que gera arquivos de **migration** (SQL) a partir do schema.

Drizzle **não** abre conexão sozinho — ele recebe um **driver**. Usamos o driver `pg`
(`node-postgres`) com um **connection pool** (`Pool`). Um pool mantém um conjunto de conexões TCP
abertas e as reaproveita entre requisições, em vez de abrir/fechar uma conexão por query (caro). Em
um servidor web isso é praticamente obrigatório.

Instale as dependências:

```bash
cd ~/Dev/estimate-engine/backend
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

E suba um Postgres local via Docker (se ainda não fez no guia 00):

```bash
docker run --name ee-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=estimate_engine \
  -p 5432:5432 -d postgres:15
```

Connection string usada nos guias:
`postgres://postgres:postgres@localhost:5432/estimate_engine`

Crie um `backend/.env.example` documentando as variáveis:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/estimate_engine
PORT=8080
```

### 2.4 Por que guardar a config inteira como JSONB

A `PricingConfig` tem campos escalares (`basePrice`, `perSqft`, `minimumPrice`), mas também tem
estruturas aninhadas e variáveis: `serviceMultipliers`, `frequencyDiscounts` e — o ponto-chave — um
**catálogo de add-ons** que o usuário pode adicionar/editar/remover (decisão de domínio do spec,
seção 6.3).

Se modelássemos isso em colunas, o catálogo de add-ons viraria **outra tabela** com relação 1:N,
mais joins, mais migrations a cada mudança de forma. Para a Fase 1 isso é peso morto. A decisão do
spec é guardar a **config inteira como um único documento JSONB**:

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Colunas** | Query/filtro por campo; constraints no banco | Schema rígido; add-ons exigem tabela à parte; migration a cada mudança de forma |
| **JSONB** (escolhido) | Flexível; add-ons variáveis sem nova tabela; um round-trip lê tudo | Sem constraints de banco nos campos internos; validação fica no app (Zod, guia 06) |

Como a config é lida inteira e gravada inteira (nunca filtramos "todas as configs com basePrice > X"),
o JSONB encaixa perfeitamente. O *trade-off* que aceitamos: a integridade dos campos internos passa
a ser responsabilidade da **validação na aplicação** (Zod na fronteira HTTP — guia 06), não do banco.

### 2.5 Tabela singleton

Na Fase 1 existe **uma única** config (o spec diz "linha única; vira *per-tenant* se houver
multi-tenant no futuro"). Garantimos isso com:

- `id: smallint` com `default(1)`.
- Uma **check constraint** `id = 1`, que torna impossível inserir uma segunda linha com outro id.

Assim a tabela tem no máximo uma linha, e sabemos sempre onde ela está: `where(id = 1)`.

### 2.6 `$type<PricingConfig>()` — tipando o JSONB

Para o Drizzle, uma coluna `jsonb` é, por padrão, `unknown` — ele não tem como adivinhar a forma do
JSON. O `.$type<PricingConfig>()` é uma anotação **só de tipo** (não muda nada no banco) que diz ao
TypeScript: "o conteúdo desta coluna é uma `PricingConfig`". Com isso, ao ler uma linha,
`row.data` já vem tipado como `PricingConfig`, e ao gravar, o compilador exige que você passe um
objeto com a forma certa. É o elo que liga o **tipo do domínio** ao **armazenamento**.

Repare que o schema (`infra/db/schema.ts`) importa `PricingConfig` de
`../../domain/pricing/types.js`: o encanamento conhece o tipo do domínio (a seta aponta pra dentro),
mas o domínio nunca conhece o encanamento.

## 3. Models (o que você vai escrever)

### 3.1 O schema Drizzle (mostrado na íntegra — é declarativo)

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

Leia campo a campo:

- `id` — `smallint`, primary key, `default(1)`. Combinado com a check, força o singleton.
- `data` — `jsonb`, `notNull`, tipado como `PricingConfig`. **Aqui mora a config inteira.**
- `updatedAt` — timestamp com timezone, `defaultNow()`. Útil para auditoria/debug.
- A terceira posição do `pgTable` é onde declaramos **constraints de tabela**: a check `id = 1`.

Note o import: `PricingConfig` vem de `../../domain/pricing/types.js`. O schema está em
`infra/db/`, dois níveis abaixo de `src/`, alcançando `domain/pricing/`.

### 3.2 A assinatura de `createDb` (mostrada — é o seam de infraestrutura)

`backend/src/infra/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function createDb(connectionString: string) {
  // cria o pool pg e embrulha no Drizzle (você implementa)
}

export type Db = ReturnType<typeof createDb>;
```

`createDb` cria o pool `pg` e embrulha no Drizzle; o tipo `Db` é o que o repository vai receber no
construtor. É puro *wiring* de driver, sem lógica de negócio — por isso mora em `infra/db/`. O corpo
é curto (criar o `Pool` com a `connectionString` e passar pro `drizzle`); fica como exercício.

### 3.3 O `drizzle.config.ts` (config da CLI de migrations — mostrado)

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

Isso diz ao drizzle-kit: leia o schema em `./src/infra/db/schema.ts`, escreva as migrations em
`./drizzle/`, o dialeto é PostgreSQL, e conecte usando `DATABASE_URL`. O caminho do `schema` agora
aponta para `infra/db/` — é o único lugar onde o drizzle-kit procura as tabelas.

Adicione os scripts ao `backend/package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

### 3.4 A interface `ConfigStore` (o contrato — mostrada)

```ts
export interface ConfigStore {
  get(): Promise<PricingConfig>;
  save(config: PricingConfig): Promise<void>;
}
```

Essa interface é o **contrato** que o HTTP vai consumir. Repare que ela não menciona Drizzle nem
Postgres — só fala em `PricingConfig`. É exatamente isso que permite, no guia 06, trocar a
implementação real por um `FakeStore` nos testes. Ela mora junto com o repository, em
`modules/pricing-config/repository.ts`, porque é o contrato daquela feature.

### 3.5 As assinaturas do `PricingConfigRepository` (SEM corpo — é o seu desafio)

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
    // TODO: você implementa (seção 5)
  }

  async save(config: PricingConfig): Promise<void> {
    // TODO: você implementa (seção 5)
  }
}
```

Olhe os imports — eles materializam a regra de dependência da seção 2.2: o repository (em `modules/`)
puxa o `Db` e o `pricingConfig` de `infra/db/`, e o `defaultConfig` + `PricingConfig` de
`domain/pricing/`. Tudo aponta pra dentro.

O construtor recebe o `Db` por **injeção de dependência** — quem cria o repo decide qual conexão
passar. Os corpos de `get` e `save` são o seu trabalho.

## 4. Migrations com drizzle-kit

O fluxo de migration com Drizzle é em dois passos:

1. **`generate`** — o drizzle-kit compara o seu `schema.ts` com o estado das migrations já geradas e
   escreve um **arquivo SQL** novo em `drizzle/` com o `CREATE TABLE` / `ALTER TABLE` necessário.
   Esse SQL é versionado no git (você revisa o que vai rodar antes de aplicar).
2. **`migrate`** — aplica os arquivos SQL pendentes no banco apontado por `DATABASE_URL`.

Gere e aplique a migration da tabela `pricing_config`:

```bash
cd ~/Dev/estimate-engine/backend
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine'
npx drizzle-kit generate
npx drizzle-kit migrate
```

Esperado: um arquivo SQL aparece em `drizzle/` e a tabela `pricing_config` é criada no banco.
Você pode conferir com `docker exec -it ee-pg psql -U postgres -d estimate_engine -c '\d pricing_config'`.

> **Por que SQL versionado em vez de "o ORM cria a tabela sozinho"?** Porque migrations são um
> histórico auditável e reproduzível do schema. Qualquer ambiente (sua máquina, CI, produção)
> chega ao mesmo estado rodando as mesmas migrations na ordem.

## 5. Seu desafio (GREEN): implementar `createDb`, `get` e `save`

Você vai escrever o corpo de `createDb` e os corpos de `get` e `save`. Aqui estão os conceitos e
dicas — não o código.

### 5.0 `createDb(connectionString)` — o cano do banco

Crie um `Pool` do `pg` com a `connectionString` recebida e passe esse pool para `drizzle(...)`,
retornando o resultado. É um wrapper de duas linhas; o tipo `Db` deriva sozinho do retorno via
`ReturnType<typeof createDb>`.

### 5.1 `get()` — ler com seed on first read

O comportamento desejado: **se a tabela está vazia, semeia a `defaultConfig` e a devolve; senão,
devolve a config gravada.** Isso garante que a primeira leitura nunca falha por "não tem config" —
o app já nasce com a config-semente do protótipo.

Passo a passo:

1. Faça um `select` da tabela `pricingConfig` filtrando por `id = 1` (use o helper `eq` do Drizzle:
   `eq(pricingConfig.id, 1)`).
2. Se o resultado vier **vazio** (`rows.length === 0`): chame `defaultConfig()`, **persista** com seu
   próprio `save(...)` e retorne essa config.
3. Se vier **uma linha**: retorne o campo `data` dela. Graças ao `$type<PricingConfig>()`, ele já
   está tipado como `PricingConfig` — sem cast.

Dica: reaproveitar `save` dentro de `get` para semear evita duplicar a lógica de escrita.

### 5.2 `save(config)` — UPSERT (insert-or-update)

Como a linha pode ou não existir ainda, `save` precisa fazer um **UPSERT**: insere se não houver,
atualiza se já houver. No Drizzle isso é `insert().values().onConflictDoUpdate(...)`. O snippet do
`onConflictDoUpdate` (a parte específica do upsert) pode te guiar:

```ts
// DICA — o miolo do upsert (você monta o insert ao redor):
.onConflictDoUpdate({
  target: pricingConfig.id,
  set: { data: config, updatedAt: new Date() },
})
```

Passo a passo:

1. Comece um `insert(pricingConfig)`.
2. `.values({ id: 1, data: config })` — sempre `id: 1` (singleton).
3. Encadeie o `.onConflictDoUpdate(...)` acima: em conflito de `id`, atualiza `data` e `updatedAt`.

O resultado: chamar `save` repetidamente sempre converge para "a linha 1 contém esta config".

## 6. Testes (RED) — integração contra Postgres real

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

O teste mora ao lado do repository, em `modules/pricing-config/`, e seus imports atravessam os
baldes: `createDb` e `pricingConfig` de `infra/db/`, `defaultConfig` de `domain/pricing/`, e o
próprio repository do mesmo módulo. Dois detalhes importantes deste teste:

- **`describe.skipIf(!url)`** — estes são testes de **integração**: precisam de um Postgres de
  verdade. Sem `DATABASE_URL` no ambiente, eles **se pulam** em vez de falhar. Isso mantém a suíte
  rápida e verde em qualquer máquina/CI que não tenha banco, enquanto ainda dá cobertura real quando
  o banco está presente. Os testes da engine (guias 01–04, em `domain/pricing/`) são puros e rodam
  sempre; estes só quando há `DATABASE_URL`.
- **`beforeEach` limpando a tabela** (`db.delete(pricingConfig)`) — testes precisam ser
  **independentes e determinísticos**. Se o teste anterior gravou `basePrice: 9999`, o próximo
  ("semeia defaultConfig quando a tabela está vazia") só faz sentido se a tabela começar **vazia**.
  Limpar antes de cada teste garante o mesmo estado inicial sempre, sem ordem-dependência.

### Rodando os testes

Primeiro veja o RED (sem o repo implementado):

```bash
cd ~/Dev/estimate-engine/backend
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine'
npx vitest run src/modules/pricing-config/repository.test.ts
```

Esperado **antes** de implementar: FAIL (`Cannot find module './repository.js'`).
Esperado **depois** de implementar `get`/`save`: PASS.

Se rodar **sem** `DATABASE_URL`, os dois testes aparecem como *skipped* — e isso é correto:

```bash
npx vitest run src/modules/pricing-config/repository.test.ts   # sem DATABASE_URL → skipped
```

## 7. Refactor & boas práticas

- **Mantenha a engine sem import de banco.** Se você precisar importar algo de `infra/db` dentro de
  `domain/pricing`, parou: a config deve *chegar* na engine, não ser buscada por ela. A seta de
  dependência nunca sai do domínio.
- **Não vaze tipos do Drizzle pra fora do repository.** O mundo externo só conhece `ConfigStore`,
  `PricingConfig` e `get`/`save`. Linhas de banco e helpers do Drizzle ficam dentro de
  `modules/pricing-config/repository.ts`.
- **`infra/db/` é encanamento, não feature.** O `client.ts` e o `schema.ts` não sabem que
  `pricing-config` existe — eles oferecem o cano que qualquer módulo futuro (`estimates`, `leads`)
  vai reusar. Se você se pegar importando algo de `modules/` dentro de `infra/db/`, inverteu a seta.
- **`save` idempotente.** Graças ao upsert, chamar `save` duas vezes com a mesma config não cria
  linhas duplicadas nem quebra. Boa propriedade.
- **Use `eq` em vez de string crua.** Filtros tipados (`eq(pricingConfig.id, 1)`) são checados pelo
  compilador e evitam SQL injection trivial.

## 8. Checklist de conclusão

- [ ] `npx drizzle-kit generate` criou um arquivo SQL em `drizzle/` e `migrate` criou a tabela.
- [ ] `infra/db/schema.ts`, `infra/db/client.ts`, `drizzle.config.ts` e
      `modules/pricing-config/repository.ts` existem.
- [ ] `ConfigStore` está definida e `PricingConfigRepository` a implementa.
- [ ] `get` faz seed on first read; `save` faz UPSERT.
- [ ] Com `DATABASE_URL` setada, `npx vitest run src/modules/pricing-config/repository.test.ts`
      passa (2 testes).
- [ ] Sem `DATABASE_URL`, esses testes aparecem como *skipped* (não falham).
- [ ] A engine (`domain/pricing/`) continua sem nenhum import de `infra/db/`.
- [ ] `infra/db/` não importa nada de `modules/` (a dependência aponta só pra dentro).

## 9. Para se aprofundar

- **Repository pattern** e a fronteira domínio/infraestrutura — por que a lógica pura não deve
  conhecer persistência, e por que o repository mora na *feature* enquanto o client/schema moram na
  *infra* (ver guia 09).
- **JSONB no Postgres** — quando documento vs. colunas; índices GIN (relevante só se você precisar
  filtrar *dentro* do JSON, o que não é o caso aqui).
- **Connection pooling** com `pg` — tamanho do pool, conexões ociosas, por que reusar conexões.
- **Migrations** como histórico versionado do schema — `generate` vs. `push`, e por que preferir
  SQL revisável.
- **Injeção de dependência** — passar o `Db` no construtor em vez de criar dentro do repo torna o
  repo testável e desacoplado.

---

Próximo: **`06-http-api.md`** — expor tudo isso via Fastify, com validação Zod na fronteira.
</content>
</invoke>
