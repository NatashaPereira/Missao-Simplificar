# Missão Simplificar — Auditorias 5S (versão Python/Flask)

Esta é a versão do app fora do Canva: backend em Flask + banco de
dados SQLite real, mantendo a mesma interface e as mesmas funções
que você já usava.

## Como rodar localmente

1. Instale o Python 3.10+ (se ainda não tiver).
2. No terminal, dentro desta pasta, rode:

```bash
pip install -r requirements.txt
python app.py
```

3. Abra o navegador em: http://localhost:5000

O banco de dados (`instance/database.db`) é criado automaticamente
na primeira execução. Ele fica salvo nessa pasta — faça backup desse
arquivo periodicamente (é o "banco de dados" de verdade agora).

## Estrutura do projeto

```
missao-simplificar/
├── app.py                  # Backend Flask (API + banco SQLite)
├── requirements.txt         # Dependências Python
├── instance/
│   └── database.db          # Banco de dados (criado automaticamente)
├── templates/
│   └── index.html            # Página principal (HTML)
└── static/
    ├── app.js                 # Toda a lógica do app (Dashboard, Auditorias, PDF, etc.)
    └── data-sdk-shim.js        # Camada que fala com a API Flask (substitui o dataSdk do Canva)
```

## O que mudou em relação à versão do Canva

- `window.dataSdk` (exclusivo do Canva) foi substituído por
  `data-sdk-shim.js`, que faz chamadas HTTP para `/api/records`
  no Flask. A interface (`init`, `create`, `update`, `delete`) é a
  mesma, então quase todo o `app.js` continua idêntico ao que você
  já tinha.
- Os scripts exclusivos do Canva (`telemetry_sdk`, `editing_sdk`,
  `resizing_sdk`) foram removidos, pois não existem fora da
  plataforma.
- Os placeholders `data-template-id` (que o Canva preenchia
  automaticamente com textos/imagens) foram trocados por conteúdo
  fixo direto no HTML.
- O carregamento automático de departamentos/critérios (que causava
  duplicação) foi removido. Agora existe um botão "Carregar Padrão"
  na aba Critérios, que só adiciona o que ainda não existir.

## Colocar na web (gratuito) — Supabase + Render

Para o app ficar acessível por um link, para qualquer pessoa, sem
depender da sua máquina ligada, use dois serviços gratuitos:
**Supabase** (banco de dados Postgres na nuvem, permanente) e
**Render** (hospedagem do código Flask). Ambos têm planos free
suficientes para esse app.

### Passo 1 — Criar o banco no Supabase

1. Acesse https://supabase.com e crie uma conta gratuita.
2. Crie um novo projeto (escolha uma senha forte para o banco —
   anote essa senha).
3. No painel do projeto, vá em **Project Settings → Database**.
4. Copie a **Connection string** no modo **URI** (algo como
   `postgresql://postgres:[SUA-SENHA]@db.xxxxx.supabase.co:5432/postgres`).
   Substitua `[SUA-SENHA]` pela senha que você definiu.

Guarde essa URL — ela é o valor de `DATABASE_URL`.

### Passo 2 — Publicar o código no Render

1. Crie uma conta gratuita em https://render.com.
2. Suba este projeto para um repositório no GitHub (crie um
   repositório novo e envie estes arquivos).
3. No Render, clique em **New → Web Service**, conecte o
   repositório do GitHub.
4. O Render vai detectar o `render.yaml` automaticamente. Se pedir
   para confirmar:
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `gunicorn app:app`
5. Em **Environment Variables**, adicione:
   - `DATABASE_URL` = a connection string do Supabase (passo 1)
6. Clique em **Create Web Service**. Após o build, o Render te dá
   uma URL pública (algo como `https://missao-simplificar.onrender.com`)
   — esse é o link que você compartilha com outras pessoas.

### Por que Supabase + Render (e não só Render)

O plano gratuito do Render apaga o disco a cada novo deploy — se o
banco fosse o arquivo SQLite local, os dados (departamentos,
critérios, auditorias) seriam perdidos toda vez que você publicasse
uma atualização. Usando o Postgres do Supabase, os dados ficam
guardados separadamente e sobrevivem a qualquer atualização do
código.

### Limitações do plano gratuito a saber

- O Render free "dorme" o serviço após ~15 minutos sem acesso — a
  primeira requisição depois disso demora alguns segundos para
  acordar (normal, sem problema).
- O Supabase free tem um limite de projeto pausado após 1 semana
  sem uso — se isso acontecer, é só reativar no painel.

## Próximos passos recomendados

1. **Login e permissões reais**: hoje não há autenticação. Para um
   sistema de login de verdade (com senha protegida), o caminho mais
   simples é usar `Flask-Login` + `werkzeug.security` (hash de senha)
   com uma nova tabela `users` no banco.
2. **Backup**: mesmo com Postgres gerenciado, vale exportar
   periodicamente os dados (o Supabase tem opção de backup/export no
   painel).
