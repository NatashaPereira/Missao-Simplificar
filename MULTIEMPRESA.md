# Missão Simplificar — versão multiempresa

## Empresas configuradas

- Royal Cargo — `/publico/royal-cargo`
- AMTrans — `/publico/amtrans`
- Rentalog — `/publico/rentalog`
- Next — `/publico/next`
- DC Logistics — `/publico/dc-logistics`

Todo o histórico existente sem `company_id` é migrado automaticamente para **Royal Cargo** na primeira inicialização desta versão.

## Perfis

Os superadministradores fixos são:

- `e.jappe@royalcargo.com.br`
- `n.pereira@royalcargo.com.br`

Eles podem alternar a empresa no seletor do cabeçalho e visualizar/administrar todas as empresas. Os demais usuários ficam vinculados a apenas uma empresa.

O sistema limita cada empresa a **5 auditores ativos**. Para cadastrar os auditores, entre como superadministrador, selecione a empresa e use **Configurações > Usuários > Novo usuário**.

## Senha inicial dos superadministradores

Para um superadministrador que ainda não exista no banco, a senha inicial vem da variável de ambiente:

`SEED_ADMIN_PASSWORD`

Se ela não estiver configurada, o fallback atual é `1234`. Em produção, configure a variável no Render antes do deploy e altere a senha assim que possível.

> Usuários que já existem no banco mantêm o hash/senha atual; a migração só corrige o perfil para `super_admin`.

## Banco de dados

Continua usando a variável `DATABASE_URL`. No Render, aponte para a connection string do Supabase/Postgres.

As tabelas recebem `company_id` para segregação lógica:

- `records.company_id`
- `users.company_id`
- `activity_log.company_id`
- nova tabela `companies`

As operações de API só leem/escrevem dados da empresa ativa. Os links públicos também consultam somente a empresa do slug informado.

## Critérios e configurações iniciais

Na primeira migração, critérios e configurações já existentes da Royal Cargo são replicados para as demais empresas quando elas ainda não possuem critérios/configurações. Departamentos e auditorias não são copiados.

## Retenção de fotos

Fotos continuam comprimidas no navegador e armazenadas dentro do `responses_json` da auditoria. Nesta versão, qualquer auditoria anterior à janela de **6 meses** tem as fotos apagadas automaticamente quando os dados da empresa são acessados.

O histórico da auditoria, notas, respostas, médias, ranking e selos permanecem. Apenas o conteúdo das fotos é removido e o registro recebe:

- `photo_count = 0`
- `photos_expired = true`
- `photos_expired_at = AAAA-MM-DD`

Isso evita crescimento indefinido do banco sem depender de um cron job pago.

## Deploy

1. Suba estes arquivos no mesmo repositório GitHub.
2. No Render, mantenha `DATABASE_URL` apontando para o Supabase atual.
3. Adicione `SECRET_KEY` com um valor longo e aleatório.
4. Adicione `SEED_ADMIN_PASSWORD` antes do primeiro deploy desta versão.
5. Faça o deploy.
6. Entre como superadministrador e alterne entre as empresas pelo seletor no topo.
7. Cadastre até cinco auditores por empresa.

## Importante antes de produção

Faça um backup/export do banco atual antes do primeiro deploy da versão multiempresa. A migração foi construída para ser incremental, mas qualquer alteração estrutural de produção merece um ponto de restauração.
