# 08 — Frontend: a tela de Config + CRUD do catálogo de add-ons

> **Como usar este guia:** fecha a Fase 1. Aqui você aprende a **escrita** com TanStack Query
> (`useMutation` + `invalidateQueries`), o padrão de **form com estado local copiado da query**, e
> monta a tela de configuração. Como sempre: te dou os **conceitos** e a **anatomia**; a
> implementação do `.tsx` é sua. O gabarito é a Task 11 do plano — abra só se travar.

---

## 1. Objetivo

Ao terminar este módulo você vai ter:

- A tela **`ConfigPage`**: edita rates (`basePrice`, `perSqft`, ...), preço mínimo e **gerencia o
  catálogo de add-ons** (adicionar, editar nome/preço, deletar).
- O padrão de **escrita** com `useMutation` e a **invalidação de cache** após salvar.
- O padrão **"copiar a query para estado local"** para editar um formulário sem refetch a cada
  tecla.
- Navegação simples entre **Calculadora** e **Config** no `App`.
- O ciclo **full-stack** fechando: a alteração viaja React → `PUT /api/pricing-config` → Postgres
  (JSONB) → e volta no próximo `GET`.

Pré-requisito: o guia 07 (tipos, `api`, `formatCents`, `QueryClientProvider`) já feito.

## 2. Conceitos

### 2.1 Leitura é `useQuery`; escrita é `useMutation`

`useQuery` busca e cacheia (idempotente, roda sozinho). **Escrita** — qualquer coisa que muda o
servidor (`POST`, `PUT`, `DELETE`) — usa **`useMutation`**: você chama `mutation.mutate(payload)`
**explicitamente** (no clique do botão "Salvar"), e o hook te dá `isPending`, `isError`, etc.

Forma geral, para reconhecer:

```ts
const save = useMutation({
  mutationFn: async (next: PricingConfig) =>
    (await api.put("/pricing-config", next)).data,
  onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-config"] }),
});
// no botão:  onClick={() => save.mutate(cfg)}
```

### 2.2 `invalidateQueries`: por que invalidar o cache depois de salvar

Depois que o `PUT` grava no Postgres, o **cache** do TanStack Query ainda guarda a config **antiga**
(a query `["pricing-config"]` que a calculadora também usa). Se você não fizer nada, a calculadora
continuaria mostrando o catálogo velho até o cache expirar.

`qc.invalidateQueries({ queryKey: ["pricing-config"] })` marca essa query como *stale* e força um
**refetch**. Como a Calculadora e a Config **compartilham a mesma `queryKey`**, ambas pegam a versão
nova automaticamente. É assim que "salvar na Config" se reflete na Calculadora sem recarregar a
página. Pegue `qc` com `const qc = useQueryClient()`.

### 2.3 Form com estado local copiado da query (e *por que*)

Editar um formulário direto sobre `query.data` é ruim: `query.data` é "propriedade" do cache do
Query, e a cada tecla você estaria mexendo num objeto que o Query pode substituir num refetch. O
padrão limpo:

1. `useQuery` busca a config (a fonte remota).
2. Um `useState<PricingConfig | null>(null)` guarda a **cópia editável** local (`cfg`).
3. Um `useEffect([data])` copia a config para o estado local **quando o fetch chega**: `if (data)
   setCfg(data)`.
4. O usuário edita **`cfg`** localmente — digitar não dispara request nenhuma.
5. Só o botão **Salvar** envia `cfg` via mutation.

**Por quê:** edição local é instantânea e isolada; nenhuma chamada de rede enquanto se digita; o
servidor só é tocado quando o usuário decide salvar. (Compare com a Calculadora, que recalcula ao
vivo de propósito — ali a fonte da verdade é o backend; aqui estamos *montando* uma mudança para
enviar de uma vez.)

Snippet do padrão (ilustrativo):

```ts
const { data } = useQuery<PricingConfig>({
  queryKey: ["pricing-config"],
  queryFn: async () => (await api.get("/pricing-config")).data,
});
const [cfg, setCfg] = useState<PricingConfig | null>(null);
useEffect(() => { if (data) setCfg(data); }, [data]);
```

### 2.4 Money na Config: mostramos cents (decisão de Fase 1)

Na Calculadora formatamos para dólares (display). Na Config, para a Fase 1, **editamos os campos
diretamente em cents** (`basePrice = 8000`). É uma **decisão consciente e simples**: evita a
conversão dólar↔cents bidirecional no input (parsing, casas decimais, arredondamento). Custo: o
admin digita `8000` em vez de `80.00`. Aceitável para uma tela de admin interna nesta fase; dá para
melhorar depois com um input em dólares que converte. Deixe o label explícito, ex.: `"Base price
(cents)"`.

## 3. Models

Você **reusa os tipos** de `frontend/src/types.ts` do guia 07 — nada novo. Os que importam aqui:
`PricingConfig` (o objeto editado) e `AddOn` (`{ id, name, price }`, com `price` em cents). Não
precisa reescrever nada.

## 4. Testes (RED)

Esta tela **não tem teste automatizado** nesta fase — é CRUD de formulário + persistência, melhor
verificado manualmente (seção 7). O teste forte do frontend continua sendo o `formatCents` do guia
07; mantenha-o verde:

```bash
cd ~/Dev/estimate-engine/frontend && npx vitest run
```

## 5. Seu desafio (GREEN)

### 5.1 `ConfigPage` — anatomia (descreva, depois escreva)

Crie `frontend/src/pages/ConfigPage.tsx`.

**Setup de dados:**
- `const qc = useQueryClient()`.
- `useQuery<PricingConfig>(["pricing-config"], ...)` para buscar.
- `const [cfg, setCfg] = useState<PricingConfig | null>(null)` + o `useEffect` que copia `data` para
  `cfg` (padrão da seção 2.3).
- `useMutation` com `mutationFn` que faz `api.put("/pricing-config", next)` e `onSuccess` que invalida
  `["pricing-config"]`.
- **Guard:** enquanto `cfg` for `null`, renderize um "Carregando…" e retorne cedo. Depois desse
  guard, `cfg` é não-nulo — o resto do componente pode assumir isso.

**Campos de money (rates):**
- Um helper `moneyField(label, key)` que renderiza um `<label>` + `<input type="number">` controlado
  por `cfg[key]`, com `onChange` fazendo `setCfg({ ...cfg, [key]: Number(e.target.value) })`. Lembre
  do `Number(...)`.
- Use-o para `basePrice`, `perSqft`, `perBedroom`, `perBathroom`, `perPet`, `minimumPrice`. (Os
  multiplicadores e descontos de frequência são `Record<...>`; na Fase 1 pode deixá-los só de
  leitura ou fora — o foco é rates + add-ons. Se quiser editá-los, é o mesmo padrão sobre
  `cfg.serviceMultipliers[...]`.)

**CRUD do catálogo de add-ons** (tudo no estado local `cfg.addOns`, sempre **imutável**):
- `addAddOn()`: gera um id (ex.: `addon_${Date.now()}`) e faz
  `setCfg({ ...cfg, addOns: [...cfg.addOns, { id, name: "Novo add-on", price: 0 }] })`. **Por que
  gerar id no front?** O backend identifica add-ons por `id`; um id novo único evita colisão com os
  existentes e com os selecionados em estimates.
- `updateAddOn(i, patch)`: `cfg.addOns.map((a, idx) => idx === i ? { ...a, ...patch } : a)` e seta.
  Use para editar `name` (input de texto) e `price` (input numérico, em cents).
- `deleteAddOn(i)`: `cfg.addOns.filter((_, idx) => idx !== i)` e seta.

Exemplo do input controlado de um add-on (ilustrativo):

```tsx
<input
  value={a.name}
  onChange={(e) => updateAddOn(i, { name: e.target.value })}
/>
```

**Render:**
- Seção de rates (grid com os `moneyField`).
- Seção de add-ons: um cabeçalho com botão **"+ Add-on"** (`onClick={addAddOn}`) e a lista
  `cfg.addOns.map((a, i) => ...)` com input de nome, input de preço e botão **Del**
  (`onClick={() => deleteAddOn(i)}`). Use `key={a.id}`.
- Botão **Salvar** no fim: `onClick={() => save.mutate(cfg)}`, `disabled={save.isPending}`, texto
  alternando "Salvando…" / "Salvar".

### 5.2 Navegação Calculadora ↔ Config no `App`

Para a Fase 1, navegação **mínima** com estado de aba — sem react-router ainda.

**Anatomia do `App`:**
- `const [tab, setTab] = useState<"calc" | "config">("calc")`.
- Uma `<nav>` com dois botões que chamam `setTab("calc")` / `setTab("config")` (dê destaque visual
  ao ativo via className condicional).
- Abaixo: `{tab === "calc" ? <CalculatorPage /> : <ConfigPage />}`.

Mantenha o wrapper de tela cheia do guia 07.

## 6. Refactor & boas práticas

- **Imutabilidade sempre:** nunca `cfg.addOns.push(...)`. Toda mudança cria novo array/objeto, senão
  o React não re-renderiza (e bugs sutis aparecem).
- **Um só `queryKey` para a config:** Calculadora e Config usam `["pricing-config"]`. É o que faz a
  invalidação propagar. Não invente keys diferentes.
- **Estado derivado mínimo:** `cfg` é a única cópia editável; não duplique campos individuais em
  estados separados.
- **Próxima evolução (não obrigatória na Fase 1):** input de money em dólares com conversão para
  cents; edição dos multiplicadores/descontos; `onError` da mutation para feedback de falha.

## 7. Verificação manual (o ciclo full-stack fechando)

Suba as três peças (Postgres + backend + dev server), como no guia 07:

```bash
docker start ee-pg
# terminal 1
cd ~/Dev/estimate-engine/backend \
  && export DATABASE_URL='postgres://postgres:postgres@localhost:5432/estimate_engine' \
  && npm run dev
# terminal 2
cd ~/Dev/estimate-engine/frontend && npm run dev
```

Em `http://localhost:5173`:

1. Vá em **Config**. Mude **"Base price"** (ex.: para `9000`). Delete um add-on. Crie outro com
   preço `1000`. Clique **Salvar**.
2. Volte à **Calculadora**: o novo catálogo aparece nas checkboxes e o total reflete a nova base —
   **sem recarregar** (graças ao `invalidateQueries`).
3. **Recarregue a página** (F5): as mudanças continuam lá. Isso confirma que persistiu no
   **Postgres** (JSONB), não só no estado do navegador.

**Reforço do ciclo:** ao clicar Salvar, sua mudança viaja **React → `PUT /api/pricing-config` →
Postgres (coluna JSONB)**. No próximo **`GET`** (disparado pela invalidação ou pelo F5), ela
**volta** e re-hidrata a UI. Esse round-trip ponta a ponta — form → API → DB → UI — é exatamente o
objetivo de aprendizado da Fase 1.

## 8. Checklist de conclusão

- [ ] `ConfigPage` carrega a config no estado local via `useEffect` (não edita `query.data` direto).
- [ ] Editar campos **não** dispara request; só **Salvar** chama o `PUT`.
- [ ] `useMutation` + `invalidateQueries(["pricing-config"])` faz a Calculadora refletir a mudança
      sem reload.
- [ ] CRUD de add-ons funciona: adicionar (id gerado), editar nome/preço, deletar — tudo imutável.
- [ ] Navegação por abas entre Calculadora e Config funciona.
- [ ] Após **F5**, as mudanças persistem (confirmando o JSONB no Postgres).
- [ ] `npx vitest run` continua verde (`formatCents`).

## Para se aprofundar

- **`useMutation`** — `onMutate`/optimistic updates, `onError`, `onSettled`. Otimismo é o próximo
  passo natural depois de dominar invalidação.
- **Invalidação vs `setQueryData`** — quando refetch e quando atualizar o cache na mão.
- **react-router** — quando a navegação por estado de aba não escalar mais (Fase 2+).
- **JSONB no Postgres** — como o catálogo de add-ons vive como JSON na coluna `data` (revise o guia
  05); por isso adicionar um campo no `AddOn` não exige migration.

---

Parabéns — você fechou a **Fase 1**. Reveja o checklist final no plano
(`docs/plans/2026-06-22-fase-1-calculadora.md`) e, quando tudo estiver verde, a **Fase 2
(Estimates)** ganha seu próprio spec → plano → guia.
