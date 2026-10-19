# cockpit

Painel lateral para o [Claude Code](https://claude.com/claude-code). Abre ao lado da conversa e junta, numa coluna só, o que você costuma consultar fora dela:

```
▾ SESSÕES ───────────────────── 30 recentes
  filtrar…
  revise a pr 761 do smartcloud  19/10 16:49

▾ JIRA ────────── CAT-4411 · ● EM ANDAMENTO
  CAT-4411                        Subtarefa
  Atualização nos contextos de ProdutosRevisao

  status       ● EM ANDAMENTO
  responsável  Fulano de Tal
  prioridade   Médio

  [ mudar status ]  [ ↻ Atualizar ]
  ↗ Abrir no Jira          atualizado 18:42

▾ AGENTS ────────── ● 1 rodando · ✓ 1 feito
  sessão principal
  ├───▶ ✓ Explore                8s · agora
  │
  └───▶ ● Explore                        9s
         List models files
         ⎿ Bash  ls -la src/models

▾ GIT ───────────────── 1 para mim · 3 meus
  ▾ PARA MIM                           1 PR
  ▸ MEUS PRS                           3 PR
```

## Seções

| Seção | O que mostra | Precisa de |
|---|---|---|
| **Sessões** | As sessões recentes do projeto, com filtro. Clique para retomar. | nada |
| **Jira** | O card citado no prompt (`CAT-1234`) ou no nome da branch: status, responsável, prioridade, critérios de aceite. Muda o status com confirmação. | Conector **Atlassian Rovo** do claude.ai ligado no Claude Code |
| **Agents** | Árvore dos subagents da sessão, com o que cada um está fazendo e há quanto tempo. | nada |
| **Git** | PRs que pedem sua revisão e os seus PRs abertos, com aprovações, CI e comentários. Botão para revisar com o Claude. | [GitHub CLI](https://cli.github.com) (`gh`) logado |

Cada seção é independente: se uma falhar, só ela mostra `✗ erro` e as outras continuam funcionando. Clique no cabeçalho de uma seção para minimizar.

## Instalar

Requisitos: Claude Code instalado e `git`. Para a seção Git, o `gh` logado (`gh auth login`).

### 1. Baixar

**macOS e Linux**

```sh
git clone https://github.com/lucasvillatore/cockpit.git ~/.claude/mods/cockpit
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/lucasvillatore/cockpit.git "$env:USERPROFILE\.claude\mods\cockpit"
```

### 2. Ativar

Para experimentar só uma vez, abra o Claude Code apontando para a pasta:

```sh
claude --plugin-dir ~/.claude/mods/cockpit
```

```powershell
claude --plugin-dir "$env:USERPROFILE\.claude\mods\cockpit"
```

Para deixar sempre ativo, adicione a variável `CLAUDE_CODE_PLUGIN_DIRS` no `env` do seu `~/.claude/settings.json` (no Windows, `%USERPROFILE%\.claude\settings.json`):

**macOS e Linux**

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/cockpit"
  }
}
```

**Windows**

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\SEU_USUARIO\\.claude\\mods\\cockpit"
  }
}
```

Se o arquivo já tiver um bloco `env`, só acrescente a linha nele. Se já houver outras pastas na variável, separe com `:` no macOS e Linux e com `;` no Windows.

No macOS, acrescente também `CLAUDE_CODE_NO_FLICKER` no mesmo `env`. O painel só fica à direita no layout de tela cheia do terminal; sem essa variável ele abre abaixo do chat.

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/cockpit",
    "CLAUDE_CODE_NO_FLICKER": "1"
  }
}
```

### 3. Usar

Abra o Claude Code. O painel abre sozinho em modo interativo. Para reabrir: `/painel`.

| Comando | O que faz |
|---|---|
| `/painel` | Abre o painel |
| `/jira CAT-1234` | Mostra um card do Jira |
| `/git` | Recarrega os PRs |

## Atualizar

```sh
cd ~/.claude/mods/cockpit && git pull
```

No Windows: `cd "$env:USERPROFILE\.claude\mods\cockpit"; git pull`. O Claude Code recarrega o painel sozinho quando os arquivos mudam.

## Configurar

- **Site do Jira:** fixo em `hooks/sections/jira.tsx` (`CLOUD`). Troque pelo endereço da sua empresa (`suaempresa.atlassian.net`).
- **Projeto do Jira detectado no prompt:** a expressão `CAT` em `hooks/sections/jira.tsx`. Na branch, qualquer chave no formato `ABC-123` é aceita.
- **Robôs nos comentários de PR:** a lista `BOTS` em `hooks/sections/git.tsx`.

## Desenvolver

```sh
claude plugin validate ~/.claude/mods/cockpit
claude plugin test ~/.claude/mods/cockpit
```

O código fica em `hooks/`: `register.tsx` registra os eventos e desenha a moldura, e cada seção mora em `hooks/sections/`. Os testes ficam em `tests/`.
