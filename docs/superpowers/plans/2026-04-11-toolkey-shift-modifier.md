# Shift modifier para teclas de ferramenta — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar "definir valor para futuras notas" de "modificar nota atualmente selecionada" nas teclas de ferramenta (duração, acidente, dot). Default vira "só futuro"; com `Shift` segurado vira "só nota atual".

**Architecture:** Refatoração localizada no handler de keydown em `js/app.js`. Três blocos de teclas (duração, acidente, dot) são reescritos para usar `e.code` (em vez de `e.key`) e ganham branches separados para shift/não-shift. Não toca em nenhum outro arquivo — todas as funções chamadas (`changeDurationOfSelected`, `setDuration`, etc.) já existem.

**Tech Stack:** Vanilla JS ES Modules, sem build step. Validação manual no navegador (`python -m http.server 8000`).

**Spec:** [`docs/superpowers/specs/2026-04-11-toolkey-shift-modifier-design.md`](../specs/2026-04-11-toolkey-shift-modifier-design.md)

---

## Visão geral dos arquivos tocados

| Arquivo | Mudanças |
|---|---|
| `js/app.js` | Refatorar 3 blocos no handler de keydown: duração (`1-5`), acidente (`S`, `-`, `N`), dot (`.`). Substituir `e.key` por `e.code`. Adicionar branches `if (shift)` para "modificar atual" e mantê-los separados de "definir futuro". |

**Não tocados:** todos os outros arquivos do projeto. As funções de baixo nível (`changeDurationOfSelected`, `changeAccidentalOfSelected`, `toggleDot`, `setDuration`, `toggleAccidental`, `toggleDotMode`) já existem e funcionam — só mudam os call-sites em `app.js`.

---

## Convenção de teste manual

Sem testes automatizados. Para validar:

```bash
cd /Users/vi/Developer_vtc/piano-piece-editor
python -m http.server 8000
# Abrir http://localhost:8000
```

Antes de cada teste, hard reload (Cmd+Shift+R) e se necessário `localStorage.clear()` no DevTools console.

---

## Task 1: Refatorar bloco de duração (`1-5`)

**Files:**
- Modify: `js/app.js` (linhas 422-430)

- [ ] **Step 1: Substituir o bloco**

Em `js/app.js`, encontre o bloco atual:

```js
    // Duration keys 1-5: modify selected note + set future duration
    const durMap = { '1': 'w', '2': 'h', '3': 'q', '4': '8', '5': '16' };
    if (!ctrl && !shift && durMap[key]) {
      e.preventDefault();
      if (hasSel) changeDurationOfSelected(durMap[key]);
      setDuration(durMap[key]);
      syncToolbar();
      return;
    }
```

Substitua por:

```js
    // Duration keys 1-5: Shift modifies selected; no Shift sets future duration
    const durCodeMap = { 'Digit1': 'w', 'Digit2': 'h', 'Digit3': 'q', 'Digit4': '8', 'Digit5': '16' };
    if (!ctrl && !alt && durCodeMap[e.code]) {
      e.preventDefault();
      if (shift) {
        if (hasSel) changeDurationOfSelected(durCodeMap[e.code]);
      } else {
        setDuration(durCodeMap[e.code]);
        syncToolbar();
      }
      return;
    }
```

- [ ] **Step 2: Validação manual no navegador**

Recarregue `http://localhost:8000` (hard reload). Crie score novo (`localStorage.clear()` se preciso).

1. Sem nada selecionado, aperte `1` → toolbar deve mudar para semibreve (botão `1` destaca-se ou indicador visual). Nada mais acontece.
2. Aperte `c` → uma semibreve C aparece (porque a duração futura é semibreve agora).
3. Selecione a semibreve. Aperte `3` (sem shift) → toolbar muda para seminima, **a nota continua semibreve**.
4. Mesma seleção. Aperte `Shift+3` → **a nota vira seminima**, toolbar continua marcando seminima (já estava).
5. Mude o toolbar pra mínima (`2`). Aperte `Shift+1` na mesma nota → nota vira semibreve, toolbar continua em mínima.
6. Sem nenhuma seleção, aperte `Shift+1` → no-op, nada acontece, toolbar não muda.

- [ ] **Step 3: Commit**

```bash
cd /Users/vi/Developer_vtc/piano-piece-editor
git add js/app.js
git commit -m "Split duration keys into Shift-modifies-current vs default-sets-future"
```

---

## Task 2: Refatorar bloco de acidentes (`S`, `-`, `N`)

**Files:**
- Modify: `js/app.js` (linhas 432-455 — três blocos `if` separados)

- [ ] **Step 1: Substituir os três blocos por um único**

Em `js/app.js`, encontre os três blocos atuais:

```js
    // Accidental keys: modify selected note + set future accidental
    if (!ctrl && !shift && key === 's') {
      e.preventDefault();
      if (hasSel) changeAccidentalOfSelected('#');
      toggleAccidental('#');
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && !alt && key === '-') {
      e.preventDefault();
      if (hasSel) changeAccidentalOfSelected('b');
      toggleAccidental('b');
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 'n') {
      e.preventDefault();
      if (hasSel) changeAccidentalOfSelected('n');
      toggleAccidental('n');
      syncToolbar();
      return;
    }
```

Substitua os três por um único bloco:

```js
    // Accidental keys: Shift modifies selected; no Shift sets future accidental
    const accCodeMap = { 'KeyS': '#', 'Minus': 'b', 'KeyN': 'n' };
    if (!ctrl && !alt && accCodeMap[e.code]) {
      e.preventDefault();
      if (shift) {
        if (hasSel) changeAccidentalOfSelected(accCodeMap[e.code]);
      } else {
        toggleAccidental(accCodeMap[e.code]);
        syncToolbar();
      }
      return;
    }
```

**Atenção:** o `-` também é usado em `Ctrl+-` (remover compasso, no bloco anterior do mesmo handler). O `!ctrl` no novo bloco preserva esse comportamento — `Ctrl+-` continua caindo no branch de remover compasso, não no branch de bemol.

- [ ] **Step 2: Validação manual**

Hard reload. `localStorage.clear()` se preciso.

1. Sem seleção, aperte `S` → toolbar marca sustenido (visual). Nada mais.
2. Aperte `c` → C sustenido aparece.
3. Selecione a nota. Aperte `N` (sem shift) → toolbar marca natural, **nota continua sustenida**.
4. Mesma nota. Aperte `Shift+N` → **nota vira natural**, toolbar continua em natural.
5. Aperte `S` (sem shift) — toolbar marca sustenido novamente, nota continua natural.
6. Aperte `Shift+S` → nota vira sustenido novamente.
7. Aperte `-` (sem shift) → toolbar marca bemol, nota continua sustenida.
8. Aperte `Shift+-` → nota vira bemol.
9. **Regressão crítica — Ctrl+- deve continuar removendo compasso:** aperte `Ctrl+-` (Cmd+- no Mac). O último compasso deve sumir. Se virar bemol em vez disso, há bug.
10. Sem seleção, `Shift+S` → no-op.

- [ ] **Step 3: Commit**

```bash
cd /Users/vi/Developer_vtc/piano-piece-editor
git add js/app.js
git commit -m "Split accidental keys into Shift-modifies-current vs default-sets-future"
```

---

## Task 3: Refatorar bloco de dot (`.`)

**Files:**
- Modify: `js/app.js` (linhas 484-491)

- [ ] **Step 1: Substituir o bloco**

Em `js/app.js`, encontre o bloco atual:

```js
    // . — toggle dotted note
    if (!ctrl && !shift && key === '.') {
      e.preventDefault();
      if (hasSel) toggleDot();
      toggleDotMode();
      syncToolbar();
      return;
    }
```

Substitua por:

```js
    // . — Shift toggles dot on selected; no Shift toggles dot mode for future
    if (!ctrl && !alt && e.code === 'Period') {
      e.preventDefault();
      if (shift) {
        if (hasSel) toggleDot();
      } else {
        toggleDotMode();
        syncToolbar();
      }
      return;
    }
```

**Atenção:** o `.` também é usado em `Ctrl+.` (repeat last action, num bloco anterior do handler). O `!ctrl` preserva esse comportamento.

- [ ] **Step 2: Validação manual**

Hard reload. `localStorage.clear()` se preciso.

1. Crie compasso `[Cq, Dq]`. Selecione `Cq`.
2. Aperte `.` (sem shift) → toolbar marca dotted, **`Cq` continua sem ponto**.
3. Aperte `Shift+.` → **`Cq` vira seminima pontuada**, toolbar continua marcando dotted (já estava).
4. Aperte `Shift+.` de novo → desfaz o ponto, vira `Cq` puro.
5. Sem seleção, `Shift+.` → no-op.
6. **Regressão crítica — Ctrl+. (repeat last action) deve continuar funcionando:** faça uma ação qualquer (ex: digite `c`), aperte `Ctrl+.` (Cmd+.) → deve repetir a inserção (mais uma C aparece). Se aparecer toolbar mudando dotted em vez disso, há bug.

- [ ] **Step 3: Commit**

```bash
cd /Users/vi/Developer_vtc/piano-piece-editor
git add js/app.js
git commit -m "Split dot key into Shift-modifies-current vs default-sets-future"
```

---

## Task 4: Validação manual integrada

**Files:** nenhum (só validação)

Esta task roda a bateria completa de testes do spec, garantindo que tudo funciona em conjunto. Sem commit no final.

- [ ] **Step 1: Hard reload e estado limpo**

```js
// No DevTools console:
localStorage.clear();
location.reload();
```

- [ ] **Step 2: Cenário "configurar futuro sem mexer no presente"**

Esse é o caso de uso principal que motivou a mudança.

1. Crie score novo. Aperte `c` → seminima C (default).
2. Aperte `c d e f` → compasso `[Cq, Dq, Eq, Fq]`.
3. Selecione `Cq`.
4. Aperte `1` → toolbar muda pra semibreve, **mas `Cq` continua seminima**. Verificar visualmente.
5. Aperte `c` → no próximo lugar de inserção, deve aparecer uma semibreve C.

- [ ] **Step 3: Cenário "modificar atual com Shift"**

1. Selecione `Dq` no compasso anterior.
2. Aperte `Shift+1` → `Dq` vira `Dw`. Compasso fica em overflow (vermelho — herança da feature anterior).
3. Aperte `Shift+3` na mesma nota → `Dw` volta pra `Dq`, vermelho some.

- [ ] **Step 4: Cenário "acidentes"**

1. Selecione `Cq`.
2. Aperte `S` → toolbar marca sustenido, nota continua C natural.
3. Aperte `Shift+S` → nota vira C#.
4. Aperte `N` (sem shift) → toolbar marca natural, **nota continua C#**.
5. Aperte `Shift+N` → nota volta pra C natural.

- [ ] **Step 5: Cenário "dotted"**

1. Selecione uma seminima.
2. Aperte `.` → toolbar marca dotted, nota continua seminima pura.
3. Aperte `Shift+.` → nota vira seminima pontuada.
4. Aperte `Shift+.` de novo → nota volta pra seminima pura.

- [ ] **Step 6: Cenário "sem seleção"**

1. Clique numa região vazia (limpa seleção). Confirme que nada está selecionado.
2. Aperte `Shift+1`, `Shift+S`, `Shift+.` em sequência → todos no-op, nada acontece, toolbar não muda.
3. Aperte `1`, `S`, `.` (sem shift) → toolbar muda em cada uma. Sem erro.

- [ ] **Step 7: Regressões críticas (combinações com Ctrl)**

1. Aperte `Ctrl+-` (Cmd+- no Mac) → último compasso é removido.
2. Faça uma inserção qualquer (ex: digite `c`). Aperte `Ctrl+.` (Cmd+.) → repete a última ação (C aparece de novo).
3. `Ctrl+Z` / `Cmd+Z` → undo. `Ctrl+Shift+Z` → redo.

- [ ] **Step 8: Regressões em letras (chord, insert before)**

1. Selecione uma nota qualquer. Aperte `Shift+E` → adiciona E ao acorde da nota selecionada (já existia).
2. Selecione outra nota. Aperte `Alt+G` → insere G **antes** da selecionada.

- [ ] **Step 9: Final**

Se todos os cenários acima passaram, a implementação está completa. Sem commit nesta task.

---

## Critérios de aceitação

- [ ] Sem Shift: teclas `1-5`, `S`, `-`, `N`, `.` apenas definem o valor para próximas notas. Não modificam a seleção.
- [ ] Com Shift: as mesmas teclas modificam a nota selecionada (se houver) e não mudam o valor para futuras notas.
- [ ] Sem seleção + Shift+tecla: no-op silencioso, sem erro.
- [ ] Detecção via `e.code`: funciona consistentemente no Mac (onde Shift e Option mudam `e.key`).
- [ ] Sem regressão em `Ctrl+-` (remover compasso), `Ctrl+.` (repeat), `Ctrl+Z/Y` (undo/redo), `Shift+letra` (chord), `Alt+letra` (insert before).
- [ ] Seleção múltipla + `Shift+tecla` modifica todas as notas selecionadas (já é o comportamento atual de `changeDurationOfSelected`/etc).
- [ ] Seleção em compasso vazio (âncora, sem nota real) + `Shift+tecla` → no-op (guards `if (!note)` já existem nas funções).
