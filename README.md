# estimate-engine

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.js
```

## Banco de dados (Drizzle)

Ciclo de trabalho (depois de configurado):

```bash
bunx drizzle-kit generate   # lê o schema → gera o .sql em ./drizzle
bunx drizzle-kit migrate    # aplica os .sql no banco
bunx drizzle-kit studio     # GUI web pra inspecionar os dados
```

`generate` + `migrate` é o fluxo "de produção" (versiona as migrations no git). Existe também o `drizzle-kit push`, que joga o schema direto no banco sem gerar arquivo — ótimo pra prototipar, mas evite em produção.

This project was created using `bun init` in bun v1.2.23. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
