# Cardápio Digital - TODO

## Banco de Dados & Estrutura
- [x] Definir schema de produtos (foto, descrição, preço, ingredientes)
- [x] Criar tabela de produtos no banco de dados
- [x] Configurar integração com S3 para upload de fotos

## Catálogo de Produtos (Cliente)
- [x] Criar página de catálogo com listagem de produtos
- [x] Implementar grid responsivo para exibição de produtos
- [x] Adicionar imagens, descrição e preço em cada card
- [x] Criar modal/drawer para visualizar detalhes do produto
- [x] Implementar busca/filtro de produtos

## Carrinho de Pedidos
- [x] Criar contexto/estado global para gerenciar carrinho
- [x] Implementar seleção de itens do cardápio
- [x] Adicionar opções de customização (completo/sem ingredientes)
- [x] Criar campo de observações para cada item
- [x] Implementar visualização do carrinho
- [x] Criar resumo do pedido com preço total

## Integração WhatsApp
- [x] Configurar número de WhatsApp do restaurante
- [x] Implementar geração de mensagem formatada com pedido
- [x] Criar botão para enviar pedido via WhatsApp
- [x] Testar envio de mensagens

## Painel Administrativo
- [x] Criar página de login/autenticação para admin
- [x] Implementar listagem de produtos no painel
- [x] Criar formulário para adicionar novos produtos
- [ ] Implementar upload de foto para S3
- [x] Criar funcionalidade de edição de produtos
- [x] Implementar exclusão de produtos
- [x] Adicionar confirmação de exclusão
- [x] Criar interface responsiva para painel admin

## Design & UX
- [x] Definir paleta de cores elegante
- [x] Implementar tipografia consistente
- [x] Garantir responsividade em mobile
- [x] Adicionar animações suaves
- [ ] Testar em diferentes dispositivos

## Testes & Validação
- [x] Escrever testes unitários para procedures
- [ ] Testar fluxo completo de pedido
- [ ] Validar responsividade mobile
- [ ] Testar integração WhatsApp
- [ ] Validar upload de fotos

## Deploy & Entrega
- [ ] Criar checkpoint final
- [ ] Documentar instruções de uso
- [ ] Entregar sistema ao usuário

## Login do Dono
- [x] Criar página de login elegante
- [x] Integrar com autenticação Manus OAuth
- [x] Redirecionar para painel admin após login
- [x] Adicionar botão de logout no painel
- [x] Validar permissões de admin

## Branding & Customização
- [x] Adicionar campo para logomarca do restaurante
- [x] Adicionar campo para nome do restaurante
- [x] Exibir logomarca e nome em destaque no catálogo
- [x] Exibir logomarca e nome no painel admin
- [x] Exibir logomarca e nome na página de login

## Testes de Rotas
- [x] Testar rota / (catálogo)
- [x] Testar rota /carrinho (carrinho)
- [x] Testar rota /login (login)
- [x] Testar rota /admin (painel admin)
- [x] Testar redirecionamento após login
- [x] Testar redirecionamento sem autenticação
- [x] Testar logout
