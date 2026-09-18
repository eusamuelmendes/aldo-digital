# Aldo Digital — Fases 1 a 5 (fundação + cliente + painel)

Sistema de pedidos do Bar do Aldo: cardápio digital, carrinho, pedido,
acompanhamento do cliente e painel administrativo com login real.

## O que já funciona (verificado, não é maquete)

- **19 tabelas** em PostgreSQL, com migrations versionadas em SQL legível
- **Cardápio real no banco**: 23 produtos, 5 categorias, preços do cardápio atual
- **API do cardápio** (`GET /api/products`) servindo o que está cadastrado
- **API de pedidos** (`POST /api/orders`) que recalcula o preço no servidor
- **QR Code de mesa assinado** (HMAC) — trocar a mesa na URL não funciona
- **Máquina de estados** do pedido, com histórico append-only de cada transição
- **36 testes automatizados** passando, incluindo integração contra Postgres real
- **`/cardapio`**: cliente navega pelas categorias reais, escolhe opções
  (ponto da carne, adicionais), monta o carrinho — tudo puxado da API, nada
  fixo no código
- **`/carrinho`**: revisão do pedido, escolha entre retirada/mesa, telefone de
  contato, envio real para `POST /api/orders`
- **`/pedido/:id`**: tela de acompanhamento do cliente, atualiza sozinha
  (polling a cada 5s) conforme o status muda no painel
- **`/admin/login`**: login real (e-mail+senha com hash scrypt no banco,
  sessão em cookie assinado HMAC) — testado com credencial errada (rejeitada)
  e certa (aceita)
- **`/admin`**: dashboard com números do dia calculados por consulta SQL real
  (não hardcoded)
- **`/admin/pedidos`**: fila de pedidos em aberto, com botões que avançam o
  status pela mesma máquina de estados testada (pular etapa é bloqueado,
  testado ao vivo com curl)
- **`/admin/mesas`**: lista os links assinados de cada mesa, para gerar/imprimir
  o QR Code
- **`/admin/cardapio`**: gestão real do cardápio — criar produto, editar nome/
  preço/descrição/categoria/foto, marcar "acabou hoje" (indisponível) ou
  remover do cardápio (soft-delete: some do cliente, mas nada é apagado do
  banco). Toda mudança de preço é gravada em `audit_logs` com valor antes/depois.
  Upload de foto real (envia o arquivo, servido por rota própria da API —
  não pela pasta `public/`, que em produção não pega arquivo novo sem
  redeploy). Gestão de grupos de opções (ex: "Ponto da carne", "Adicionais"):
  criar grupo, criar opção com preço, ativar/desativar, remover — uma opção
  já usada em algum pedido não pode ser apagada (o banco protege via chave
  estrangeira), então a remoção cai automaticamente para desativação
- **`/api/admin/*` e `/admin/*` protegidos por middleware** — sem sessão
  válida, API responde 401 e página redireciona para o login (testado sem
  cookie)

## O que foi testado ao vivo nesta fase (não só em teste automatizado)

- Login errado → 401; login certo → cookie de sessão; painel sem cookie → 401
- Pedido no local usando o link real de uma mesa (token HMAC) → mesa e taxa de
  serviço corretas
- Corpo da requisição com um `priceCents` forjado → ignorado, servidor cobrou
  o preço real do banco
- Corpo da requisição tentando informar `tableId` direto (sem token) → recusado
- Painel tentando pular RECEIVED → COMPLETED direto → bloqueado (409)
- Mudança de status pelo painel → tela de acompanhamento do cliente reflete
  o novo status na atualização seguinte (polling)
- Produto criado pelo painel → aparece imediatamente em `GET /api/products`
  (cardápio público); mudança de preço → conferida direto na tabela
  `audit_logs`; marcar indisponível → some do cardápio do cliente na hora;
  remover do cardápio → some do público mas continua no banco, visível como
  "removido" na tela de gestão

## Rodando localmente

```bash
# 1. Postgres (local, Docker ou uma URL do Supabase/Neon)
cp .env.example .env        # preencha DATABASE_URL e TABLE_TOKEN_SECRET

# 2. Dependências e banco
npm install
npm run db:migrate          # cria as 19 tabelas
npm run db:seed             # popula com o cardápio real do Aldo

# 3. Aplicação e testes
npm run dev                 # http://localhost:3000
npm test                    # 36 testes
npm run typecheck
```

Gere o `TABLE_TOKEN_SECRET` com `openssl rand -hex 32`.

## Estrutura

```
src/
├── db/
│   ├── schema.ts        modelo de dados completo (comentado)
│   ├── seed.ts          cardápio real do Aldo
│   ├── migrate.ts       aplica migrations (usar no deploy)
│   └── index.ts         conexão
├── lib/
│   ├── money.ts         dinheiro em centavos, nunca float
│   ├── pricing.ts       ★ cálculo de preço no servidor
│   ├── table-token.ts   ★ QR Code assinado por mesa
│   ├── password.ts      hash scrypt
│   ├── id.ts            ids opacos
│   └── load-env.ts
├── server/orders/
│   └── create-order.ts  criação do pedido + máquina de estados
└── app/api/
    ├── products/route.ts
    └── orders/route.ts

drizzle/                 migrations SQL geradas
tests/                   36 testes (unidade + integração)
```

★ = os dois arquivos que concentram as decisões de segurança.

## As duas regras que não se negociam

**1. O navegador não informa preço.** Olhe o tipo `CartItemInput` em
`src/lib/pricing.ts`: não existe campo de preço. O cliente manda *qual produto,
quantas unidades, quais opções*; todo valor vem do banco. Um carrinho que
confia no preço do navegador é manipulável com o devtools aberto.

Teste que prova isso: `tests/pricing.test.ts` → "ignora qualquer preço enviado
pelo navegador".

**2. A mesa vem do token, não da URL.** `/mesa/01` permitiria lançar o consumo
na conta do vizinho. Cada mesa tem um segredo próprio e o QR carrega um token
assinado com HMAC; adulterar o número invalida a assinatura. Isso também
permite "girar" o QR de uma mesa específica sem reimprimir os outros 11.

Teste que prova isso: `tests/table-token.test.ts` → "rejeita payload adulterado".

## O que ainda NÃO existe (e é honesto dizer)

| Item | Situação |
|---|---|
| Interface de cardápio/carrinho/pedido | ✅ entregue nesta fase |
| Painel administrativo com login | ✅ entregue nesta fase |
| Realtime (cozinha) | Fase 6 — painel usa polling (5s) por enquanto; decisão técnica p/ WebSocket já tomada, não implementada |
| Reservas | Fase 7 — não implementado |
| Pagamento online | Fase 8 — **exige conta e credenciais do Aldo** |
| Estoque | tabelas modeladas, operação desligada |
| Cadastro/CRUD de produto pelo painel | ✅ entregue, incluindo upload de foto e edição de grupos de opções (`/admin/cardapio`) |
| Deploy | **exige contas de hospedagem/banco** (Supabase + Vercel, ver auditoria) |

Nada aqui finge estar conectado ao que não está.

## Decisões técnicas

| Decisão | Por quê |
|---|---|
| PostgreSQL | Relatórios do item 20 são consultas SQL agregadas; um banco relacional resolve isso sem gambiarra |
| Drizzle ORM | TypeScript puro, sem binário nativo para baixar no deploy; migrations em SQL legível e versionável |
| Next.js | Site público, painel e API no mesmo projeto — um deploy, não três |
| Centavos (integer) | `0.1 + 0.2 !== 0.3`; em dinheiro isso vira divergência de caixa |
| Snapshot no item do pedido | Mudar preço hoje não pode alterar o faturamento de ontem |
| scrypt (node:crypto) | Hash de senha sério sem dependência extra |
