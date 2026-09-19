# Aldo Digital — guia de continuidade em outro ambiente

Este arquivo existe pra você (ou qualquer outra pessoa/IA) conseguir pegar
este projeto exatamente de onde ele parou, em qualquer máquina, sem depender
desta conversa. Leia isto antes do `README.md` (que fica mais focado na
arquitetura interna do código).

## 1. O que este ZIP contém

Todo o código-fonte do projeto (`src/`, `drizzle/`, `tests/`, configs),
**exceto**:

- `node_modules/` — reinstale com `npm install`
- `.next/` — build gerado, reconstrua com `npm run build`
- `.git/` — histórico do repositório não incluso aqui (ver seção 5 se quiser recuperá-lo)
- `.env` — contém segredos reais de produção, **nunca deve ir num ZIP**
- `entrega/` — scripts SQL avulsos gerados numa etapa pontual do deploy, não fazem parte da aplicação

Está incluso `.env.example` com todas as variáveis necessárias (sem valores
reais) e as 3 imagens de produto que já estavam em `uploads/products/`.

## 2. Como rodar em outro ambiente (do zero)

```bash
# 1. Extrair e instalar dependências
unzip aldo-digital.zip -d aldo-digital
cd aldo-digital
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
```

Edite o `.env` com:

```
DATABASE_URL="postgresql://usuario:senha@host:5432/banco"
TABLE_TOKEN_SECRET="gere com: openssl rand -hex 32"
SERVICE_FEE_PERCENT="10"
```

Você tem duas opções de banco:

- **Continuar usando o banco de produção já existente** (Supabase) — peça a
  connection string ao Samuel (é a mesma usada no deploy da Vercel). Nesse
  caso **pule o passo de seed**, o banco já tem os dados reais.
- **Banco novo/local** (Postgres local, Docker, outro Supabase) — rode as
  migrations e o seed do zero:

```bash
npm run db:migrate    # cria as 19 tabelas
npm run db:seed       # popula com o cardápio real do Aldo (23 produtos, 3 usuários, 12 mesas)
```

```bash
# 3. Rodar
npm run dev            # http://localhost:3000
npm test                # 36 testes automatizados
npm run typecheck
```

Login padrão do painel administrativo (ambiente de desenvolvimento/seed):
`admin@bardoaldo.com.br` / `aldo-dev-2026` — **troque essa senha se for usar
em produção de verdade**, ela está exposta neste repositório de propósito
apenas para desenvolvimento.

## 3. Deploy em produção (se for redeployar)

O site já está publicado e funcionando em `aldo-digital.vercel.app`, ligado
a um repositório GitHub (`eusamuelmendes/aldo-digital`) com deploy automático
a cada push na branch `main`. Se for continuar esse mesmo deploy:

1. Clone o repositório GitHub existente (não este ZIP) para manter o
   histórico de commits.
2. Configure as variáveis de ambiente no painel da Vercel (Settings →
   Environment Variables): `DATABASE_URL`, `TABLE_TOKEN_SECRET`,
   `SERVICE_FEE_PERCENT`.
3. Qualquer `git push` na branch `main` dispara um novo deploy automático.

Se for montar um deploy novo do zero, qualquer plataforma que rode Next.js
(Vercel, Railway, Render, um VPS próprio) funciona — só precisa de um
Postgres acessível por HTTPS/porta liberada e das mesmas 3 variáveis de
ambiente.

## 4. Status honesto das funcionalidades

### ✅ Implementado e testado de verdade (não é maquete)

- Cardápio digital dinâmico (`/cardapio`) — puxa produtos, categorias, preços
  e grupos de opções (ex: ponto da carne) direto do banco, nada fixo no código
- Carrinho e finalização de pedido (`/carrinho`) — preço sempre recalculado
  no servidor (o navegador não manda preço, só produto/quantidade/opções)
- Acompanhamento do pedido pelo cliente (`/pedido/:id`) — status em
  português, tempo decorrido, detalhamento de subtotal/taxas, atualização
  automática (polling a cada 5s), botão de copiar link, tela de conclusão
- QR Code de mesa assinado com HMAC — trocar o número na URL não funciona,
  cada mesa tem token próprio
- Login administrativo real (`/admin/login`) — senha com hash scrypt, sessão
  em cookie assinado, todas as rotas `/admin/*` e `/api/admin/*` protegidas
  por middleware
- Painel de pedidos (`/admin/pedidos`) — fila em tempo real (polling), máquina
  de estados que bloqueia pular etapas (ex: não deixa ir direto de "recebido"
  para "concluído")
- Dashboard administrativo (`/admin`) — faturamento do dia com comparação
  honesta com ontem (não inventa tendência quando não há base de comparação),
  gráfico de movimento por hora, pedidos por tipo, ranking de mais vendidos —
  tudo calculado por consulta SQL real, nada hardcoded
- Gestão de cardápio (`/admin/cardapio`) — criar/editar/remover produto,
  upload de foto real, gestão de grupos de opções, histórico de mudança de
  preço em `audit_logs`
- Gestão de mesas (`/admin/mesas`) — geração dos QR Codes assinados
- 36 testes automatizados (unidade + integração contra Postgres real)

### 🔶 Parcialmente implementado / simplificado

- **Atualização em tempo real**: usa polling (consulta a cada 5 segundos),
  não WebSocket. Funciona bem no volume atual, mas não é "tempo real"
  instantâneo — decisão técnica consciente pra não complicar o deploy.
- **Controle de estoque**: as tabelas existem no banco, mas a lógica de
  baixa automática de estoque está desligada (não é usada no fluxo de
  pedido hoje).
- **Funcionamento offline**: o sistema depende 100% de internet hoje (ver
  o catálogo de arquiteturas que fizemos — nenhuma das alternativas offline
  foi implementada ainda, é uma decisão em aberto).

### ❌ Não implementado (não existe, mesmo que pareça)

- **Pagamento online** (Mercado Pago ou qualquer gateway) — não há
  integração nenhuma. Isso exige que o dono do Aldo abra conta num provedor
  de pagamento com o CNPJ do negócio; não é algo que se resolve só com código.
- **Reservas de mesa** — não implementado.
- **Notificação push** (avisar o cliente no celular quando o pedido fica
  pronto) — hoje o cliente só sabe olhando a tela de acompanhamento.
- **Integração com apps de delivery** (iFood etc.) — não existe.
- **App nativo** (Android/iOS) — é só web hoje, funciona no navegador do
  celular mas não é um app instalável de verdade (poderia virar PWA, ver
  discussão sobre arquiteturas offline).

### 🌐 Depende de serviços externos (fora do controle do código)

- **Banco de dados**: PostgreSQL hospedado no Supabase (plano gratuito hoje).
  Sem ele, nada funciona — nem local nem em produção.
- **Hospedagem do site**: Vercel (plano gratuito hoje). O deploy automático
  depende do GitHub também.
- **Repositório de código**: GitHub (`eusamuelmendes/aldo-digital`) — é de
  onde a Vercel puxa cada novo deploy.

Nenhum desses três serviços tem custo hoje (estão nos planos gratuitos), mas
todos têm limites de uso que podem exigir upgrade pago se o movimento crescer.

## 5. Recuperando o histórico de commits (opcional)

Este ZIP não inclui `.git/` pra ficar leve. Se quiser o histórico completo
de commits, clone direto do GitHub:

```bash
git clone https://github.com/eusamuelmendes/aldo-digital.git
```

(Precisa de acesso ao repositório — é privado, fale com o Samuel se for
outra pessoa/ambiente que precisa de acesso.)
