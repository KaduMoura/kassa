# Relatório de Auditoria Técnica - Backend (Kassa)

## 📊 Sumário Executivo
A implementação do backend segue uma arquitetura sólida (Two-Stage Retrieval) e utiliza bem as tecnologias propostas (Fastify, Zod, Gemini, MongoDB). No entanto, existem gaps críticos em **testes**, **configuração de linting** e **segurança de input** que precisam ser endereçados antes de uma versão de produção.

---

## 1. Verificação de Funcionalidades (vs docs/00-context.md)
| Requisito | Status | Observação |
| :--- | :--- | :--- |
| **Upload de Imagem** | ✅ OK | Implementado via `@fastify/multipart`. |
| **Product Matching** | ✅ OK | Estruturado em 2 estágios (Heurística + Reranking). |
| **Prompt Opcional** | ✅ OK | Campo `prompt` no multipart é repassado para a IA. |
| **Admin Interface** | ⚠️ Parcial | Existem rotas de `/debug`, mas não uma interface de admin estruturada no backend (apenas placeholders). |
| **API Key em Memória** | ✅ OK | Recebida via header `x-ai-api-key` e não persistida. |

---

## 2. Qualidade de Código e Arquitetura
### ✅ Pontos Fortes
- **Separação de Preocupações**: Estrutura bem definida entre `domain`, `infra`, `interfaces` e `services`.
- **Resiliência na IA**: O `GeminiCatalogReranker` valida e corrige a saída da IA (garante que IDs existem e adiciona faltantes).
- **Tipagem**: Uso extensivo de TypeScript e Zod ajuda na segurança de tipos.

### ❌ Pontos de Melhoria / Bugs
- **ESLint Quebrado**: `npm run lint` falha por ausência de arquivo de configuração (`.eslintrc` ou `eslint.config.js`).
- **Log Inconsistente**: `ImageSearchService.ts` usa `console.error` (linha 85) em vez do `Pino` logger injetado ou disponível via Fastify.
- **Inconsistência de IDs**: `CatalogRepository.findById` usa `title` como busca de ID (linha 87), enquanto o resto do sistema usa `_id` ou IDs gerados.

---

## 3. Qualidade & Testes (Vitest)
### 🚨 Gaps Críticos
- **Sem testes no Service**: O `ImageSearchService`, que é o coração da orquestração, **não possui testes**.
- **Baixa Cobertura**: Apenas 4 arquivos de teste. Fluxos de erro da API e validação de schema de entrada não são testados exaustivamente.
- **Falta de Integração**: Não há testes que validam o fluxo `Multipart -> Controller -> Service -> DB Mock` integrados.

---

## 4. Segurança e Robustez
- **Payload Multipart**: No `SearchController.ts`, não há validação do `mimetype` do arquivo antes do processamento. Aceita qualquer arquivo como "image".
- **Limites de Campo**: O campo `prompt` não tem validação de tamanho máximo (`z.string().max(...)`), o que pode ser explorado para DoS de memória.
- **Tratamento de Exceções**: O `Fastify.setErrorHandler` captura `AiError`, mas erros genéricos de banco ou parsing podem vazar detalhes se não forem sanitizados (atualmente usa o default do Fastify).

---

## 5. Camada de Dados (MongoDB)
- **Queries com Regex**: A busca heurística usa `$regex` com `i` (case-insensitive). Em um catálogo grande, isso é ineficiente. Recomenda-se o uso de `Text Indexes` do MongoDB se o schema permitir.
- **Ladder de Relaxação**: A lógica de Plan A/B/C é excelente para garantir que sempre haja resultados (Recall).

---

## 6. Checklist de Débito Técnico
- [ ] Criar arquivo de configuração do ESLint.
- [ ] Implementar testes unitários para `ImageSearchService`.
- [ ] Adicionar validação de `mimetype` (e.g. `image/jpeg`, `image/png`) no controller.
- [ ] Padronizar uso de Logger (remover `console.log` e `console.error`).
- [ ] Adicionar testes de integração para as rotas da API.
- [ ] Validar tamanho máximo do campo `prompt` no Zod schema.

---

## 🛠 Comandos Utilizados na Auditoria
- Baseline de Instalação: `pnpm install`
- Checagem Estática: `pnpm run typecheck` (Sucesso)
- Linting: `pnpm run lint` (**Falha: Config missing**)
- Testes: `pnpm test` (**Passou: 10 testes, mas cobertura insuficiente**)
