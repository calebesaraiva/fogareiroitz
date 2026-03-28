## Producao

Antes de publicar, configure estas variaveis:

```env
DATABASE_URL=
JWT_SECRET=
VITE_RESTAURANT_PHONE=
VITE_APP_TITLE=Fogareiro ITZ Restaurante
VITE_APP_LOGO=/fogareiro-logo.png
```

## Login local inicial

O sistema cria estes acessos automaticamente no primeiro start com banco configurado:

- `vania@fogareiroitz.com` - senha `Fogareiro@Adm2026`
- `norton@fogareiroitz.com` - senha `Fogareiro@Adm2026`
- `cozinha@fogareiroitz.com` - senha `Fogareiro@Cozinha2026`

Depois do primeiro login, altere as senhas pelo painel administrativo.

## Regras importantes

- O admin consegue criar e gerenciar outros logins direto no painel.
- O papel `garcom` pode acessar o painel operacional.
- So a `cozinha` continua podendo abrir pedido interno direto sem aprovacao.
- O acompanhamento do pedido agora exige apenas o telefone do cliente.
- O telefone do cliente deve ser informado no checkout com DDD.

## Validacao antes de subir

Rode:

```bash
pnpm check
pnpm build
pnpm test
```

Depois valide manualmente:

- ` /login ` entra com um dos acessos iniciais
- ` /admin ` gerencia produtos, pedidos e logins
- ` /cozinha ` aceita pedido, informa prazo e atualiza status
- ` / ` abre o cardapio
- ` /carrinho ` finaliza pedido
- ` /acompanhar ` consulta o pedido pelo telefone

## Observacoes

- O frontend ainda emite aviso de bundle grande no build. Nao bloqueia producao.
- Se o produto sair do cardapio entre selecao e checkout, o pedido continua sendo salvo com nome e preco do item.
- Rodar importacao inicial do cardapio:
  `pnpm import:menucheff`
