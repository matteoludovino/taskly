# Taskly — Full-Stack To-Do App

> Um to-do list moderno feito em: Next.js 14 + API REST + Prisma + PostgreSQL + Docker.

![Taskly](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-38bdf8?logo=tailwindcss)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)

---

## Visão Geral

**Taskly** é uma aplicação de gerenciamento de tarefas fullstack em monorepo:

- **Frontend** — Next.js 14 (App Router), React, TypeScript, TailwindCSS, fonte Poppins
- **Backend** — Next.js API Routes com Zod para validação e rate limiting
- **Banco de dados** — PostgreSQL via Prisma ORM
- **Deploy** — Vercel (frontend + API) + Neon/Railway (DB) ou Docker Compose completo

### Funcionalidades

- ✅ Criar, editar, completar e excluir tarefas
- 🔍 Busca em tempo real por título/descrição
- 🎯 Filtros: Todas / Pendentes / Concluídas
- 📊 Ordenação por data de criação, prazo ou prioridade
- 🌗 Tema claro/escuro (salvo no localStorage)
- 📱 Layout responsivo (mobile-first)
- 📡 Suporte offline com fila de sincronização (localStorage)
- ⚡ Paginação e skeleton loading
- 🔔 Notificações toast
- 🛡️ Rate limiting, sanitização de inputs, CORS configurável

---

## Pré-requisitos

- **Node.js** 18+ 
- **npm** 9+
- **PostgreSQL** 14+ (ou Docker)

---

## Início rápido

### 1. Clonar e instalar

```bash
git clone https://github.com/seu-usuario/todo-app.git
cd todo-app
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com sua DATABASE_URL
```

### 3. Criar e migrar o banco

```bash
# Com PostgreSQL local rodando:
npm run prisma:migrate:dev

# Gera o Prisma Client (já é executado no postinstall)
npm run prisma:generate
```

### 4. Rodar em desenvolvimento

```bash
npm run dev
# Acesse http://localhost:3000
```

---

## Scripts disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento (localhost:3000) |
| `npm run build` | Build de produção |
| `npm run start` | Inicia o servidor de produção |
| `npm run lint` | Verifica o código com ESLint |
| `npm run format` | Formata com Prettier |
| `npm run test` | Roda os testes unitários com Jest |
| `npm run test:coverage` | Testes com relatório de cobertura |
| `npm run prisma:generate` | Gera o Prisma Client |
| `npm run prisma:migrate` | Aplica migrations em produção |
| `npm run prisma:migrate:dev` | Cria e aplica migrations em dev |
| `npm run prisma:studio` | Abre o Prisma Studio (GUI do banco) |

---

## Variáveis de Ambiente

Copie `.env.example` para `.env` e configure:

```env
# Conexão com o PostgreSQL
DATABASE_URL="postgresql://user:password@host:5432/database"

# Ambiente
NODE_ENV="development"

# CORS — domínio do frontend em produção
CORS_ORIGIN="https://seu-app.vercel.app"

# Apenas para Docker Compose local
POSTGRES_USER="todo"
POSTGRES_PASSWORD="todopass"
POSTGRES_DB="tododb"
```

### Provedores de banco recomendados

| Provedor | URL de exemplo |
|----------|----------------|
| **Neon** (recomendado) | `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require` |
| **Railway** | `postgresql://postgres:pass@containers-xxx.railway.app:PORT/railway` |
| **Supabase** | `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres` |
| **Local** | `postgresql://todo:todopass@localhost:5432/tododb` |

---

## Deploy

### Opção A — Vercel + Neon (recomendado, serverless)

1. **Banco de dados no Neon**
   ```bash
   # 1. Acesse https://neon.tech e crie um projeto
   # 2. Copie a connection string fornecida
   ```

2. **Deploy no Vercel**
   ```bash
   npm i -g vercel
   vercel login
   vercel --prod
   ```
   
   Defina as variáveis de ambiente no painel Vercel:
   ```
   DATABASE_URL    = postgresql://... (da Neon)
   NODE_ENV        = production
   CORS_ORIGIN     = https://seu-app.vercel.app
   ```

3. **Rodar migrations**
   ```bash
   # Com DATABASE_URL apontando para Neon:
   npm run prisma:migrate
   ```

### Opção B — Railway (app + DB juntos)

1. Crie um projeto no [Railway](https://railway.app)
2. Adicione um serviço PostgreSQL e copie a `DATABASE_URL`
3. Adicione um serviço a partir do repo GitHub
4. Configure as variáveis de ambiente no painel
5. O Railway detecta automaticamente Next.js e faz o deploy

### Opção C — Docker Compose (local ou VPS)

```bash
# Suba tudo com um comando:
docker compose up --build

# Acesse: http://localhost:3000

# Para rodar em background:
docker compose up -d --build

# Ver logs:
docker compose logs -f app

# Parar:
docker compose down

# Parar e remover dados:
docker compose down -v
```

> **Nota:** O container do app já executa `prisma migrate deploy` automaticamente ao iniciar.

---

## API — Endpoints

Base URL: `http://localhost:3000/api` (dev) ou `https://seu-app.vercel.app/api` (prod)

### `GET /api/tasks`

Lista tarefas com filtros, busca e paginação.

**Query params:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `completed` | `true\|false` | Filtrar por status |
| `page` | `number` | Página (default: 1) |
| `limit` | `number` | Itens por página (default: 20, max: 100) |
| `q` | `string` | Busca no título e descrição |
| `sort` | `createdAt\|dueDate\|priority` | Campo de ordenação |
| `order` | `asc\|desc` | Direção da ordenação |

**Exemplo:**
```bash
curl "http://localhost:3000/api/tasks?completed=false&page=1&limit=20"
```

**Resposta:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Comprar leite",
      "description": "Sem lactose",
      "completed": false,
      "priority": "low",
      "dueDate": "2026-04-01",
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-01-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### `GET /api/tasks/:id`

Retorna uma tarefa pelo ID.

```bash
curl "http://localhost:3000/api/tasks/uuid-aqui"
```

---

### `POST /api/tasks`

Cria uma nova tarefa.

**Body:**
```json
{
  "title": "Comprar leite",
  "description": "Sem lactose",
  "priority": "low",
  "dueDate": "2026-04-01"
}
```

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Comprar leite","description":"Sem lactose","priority":"low","dueDate":"2026-04-01"}'
```

**Resposta:** `201 Created` com o recurso criado.

---

### `PUT /api/tasks/:id`

Substitui completamente uma tarefa.

```bash
curl -X PUT http://localhost:3000/api/tasks/uuid-aqui \
  -H "Content-Type: application/json" \
  -d '{"title":"Comprar leite integral","priority":"med"}'
```

---

### `PATCH /api/tasks/:id`

Atualização parcial — ideal para toggle de `completed`.

```bash
# Toggle completed
curl -X PATCH http://localhost:3000/api/tasks/uuid-aqui \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'

# Atualizar apenas prioridade
curl -X PATCH http://localhost:3000/api/tasks/uuid-aqui \
  -H "Content-Type: application/json" \
  -d '{"priority":"high"}'
```

---

### `DELETE /api/tasks/:id`

Exclui uma tarefa.

```bash
curl -X DELETE http://localhost:3000/api/tasks/uuid-aqui
```

**Resposta:**
```json
{ "message": "Task deleted successfully" }
```

---

### Respostas de erro

```json
{ "error": "mensagem descritiva" }
```

| Status | Situação |
|--------|----------|
| `400` | Dados inválidos (validação Zod) |
| `404` | Tarefa não encontrada |
| `429` | Rate limit excedido (100 req/min por IP) |
| `500` | Erro interno do servidor |

---

## Modelo de Dados

```prisma
model Task {
  id          String    @id @default(uuid())
  title       String    @db.VarChar(255)
  description String?   @db.Text
  completed   Boolean   @default(false)
  priority    Priority  @default(med)   // low | med | high
  dueDate     DateTime? @db.Date
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

---

## Testes

```bash
# Rodar todos os testes
npm test

# Com cobertura
npm run test:coverage

# Watch mode (desenvolvimento)
npm run test:watch
```

Os testes cobrem:
- `validations.test.ts` — todos os schemas Zod
- `api-helpers.test.ts` — serialização, rate limit, IP extraction

---

## Estrutura do Projeto

```
todo-app/
├── prisma/
│   ├── schema.prisma           # Definição do banco
│   └── migrations/             # Histórico de migrations SQL
├── src/
│   ├── app/
│   │   ├── api/tasks/
│   │   │   ├── route.ts        # GET /tasks + POST /tasks
│   │   │   └── [id]/route.ts   # GET/PUT/PATCH/DELETE /tasks/:id
│   │   ├── globals.css         # Estilos globais + tema CSS vars
│   │   ├── layout.tsx          # Root layout com Poppins
│   │   └── page.tsx            # Página principal
│   ├── components/
│   │   ├── Header.tsx          # Header com relógio, tema, sync
│   │   ├── FilterBar.tsx       # Filtros, busca e ordenação
│   │   ├── CreateTaskForm.tsx  # Formulário de criação
│   │   ├── TaskCard.tsx        # Card de tarefa com ações
│   │   ├── EditTaskModal.tsx   # Modal de edição
│   │   ├── StatsBar.tsx        # Barra de estatísticas/progresso
│   │   ├── EmptyState.tsx      # Estado vazio
│   │   ├── Pagination.tsx      # Paginação
│   │   └── Toast.tsx           # Notificações + hook useToast
│   ├── hooks/
│   │   └── useTasks.ts         # Hook principal de dados
│   ├── lib/
│   │   ├── prisma.ts           # Singleton do Prisma Client
│   │   ├── validations.ts      # Schemas Zod
│   │   ├── api.ts              # Helpers de resposta + rate limit
│   │   └── offline.ts          # Sync offline via localStorage
│   └── types/
│       └── task.ts             # Tipos TypeScript
├── __tests__/
│   ├── validations.test.ts
│   └── api-helpers.test.ts
├── Dockerfile                  # Build multi-stage otimizado
├── docker-compose.yml          # App + PostgreSQL
├── .env.example                # Template de variáveis
└── README.md
```
